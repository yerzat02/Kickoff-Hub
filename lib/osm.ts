/**
 * OSM (Online Soccer Manager) sync module.
 *
 * Talks to the game's internal web API (no public API exists), converts the
 * responses into a LeagueSnapshot and stores it through lib/store.ts.
 *
 * Credentials come only from .env (OSM_USERNAME / OSM_PASSWORD / OSM_CLIENT_ID /
 * OSM_CLIENT_SECRET, or a manually pasted OSM_ACCESS_TOKEN). Nothing secret is
 * ever logged.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { markSyncError, saveLeagueSnapshot } from "./store";
import type { LeagueSnapshot } from "./types";

const BASE = (process.env.OSM_API_BASE ?? "https://web-api.onlinesoccermanager.com").replace(/\/$/, "");
const APP_VERSION = process.env.OSM_APP_VERSION ?? "4.0.34";
const TOKEN_FILE = path.join(process.cwd(), ".cache", "osm-token.json");
const MIN_INTERVAL_SEC = Number(process.env.SYNC_MIN_INTERVAL_SEC ?? 300);
const LOGO_BASE = "https://assets.onlinesoccermanager.com/Team/Small";

type TokenSet = { access_token: string; refresh_token?: string; obtainedAt: number };

export class OsmError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OsmError";
  }
}

// ---------------------------------------------------------------- auth

function readCachedToken(): TokenSet | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as TokenSet;
  } catch {
    return null;
  }
}

function writeCachedToken(t: TokenSet) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t), { mode: 0o600 });
}

/** fetch() that turns low-level network errors into readable OsmError messages. */
async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const cause = (e as { cause?: { message?: string; code?: string } }).cause;
    const detail = cause?.code ?? cause?.message ?? (e as Error).message;
    throw new OsmError(`network error while calling ${new URL(url).pathname}: ${detail}`);
  }
}

async function tokenRequest(endpoint: "/token" | "/tokenRefresh", body: Record<string, string>): Promise<TokenSet> {
  const res = await safeFetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json; charset=utf-8", AppVersion: APP_VERSION },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new OsmError(`OSM auth failed (${endpoint}): HTTP ${res.status}`, res.status);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!json.access_token) throw new OsmError(`OSM auth failed (${endpoint}): no access_token in response`);
  const t: TokenSet = { access_token: json.access_token, refresh_token: json.refresh_token, obtainedAt: Date.now() };
  writeCachedToken(t);
  return t;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new OsmError(`Missing ${name} in .env`);
  return v;
}

async function passwordLogin(): Promise<TokenSet> {
  return tokenRequest("/token", {
    userName: requireEnv("OSM_USERNAME"),
    password: requireEnv("OSM_PASSWORD"),
    grant_type: "password",
    client_id: requireEnv("OSM_CLIENT_ID"),
    client_secret: requireEnv("OSM_CLIENT_SECRET"),
  });
}

async function refreshLogin(refreshToken: string): Promise<TokenSet> {
  return tokenRequest("/tokenRefresh", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireEnv("OSM_CLIENT_ID"),
    client_secret: requireEnv("OSM_CLIENT_SECRET"),
  });
}

/** Returns a bearer token: manual env token > cached token > refresh > password login. */
export async function getAccessToken(forceNew = false): Promise<string> {
  if (process.env.OSM_ACCESS_TOKEN) return process.env.OSM_ACCESS_TOKEN;
  if (!hasOsmCredentials()) throw new OsmError("OSM credentials are not configured in .env");
  const cached = readCachedToken();
  if (cached && !forceNew) return cached.access_token;
  if (cached?.refresh_token) {
    try {
      return (await refreshLogin(cached.refresh_token)).access_token;
    } catch {
      /* fall through to password login */
    }
  }
  return (await passwordLogin()).access_token;
}

export function hasOsmCredentials(): boolean {
  return Boolean(
    process.env.OSM_ACCESS_TOKEN ||
      (process.env.OSM_USERNAME && process.env.OSM_PASSWORD && process.env.OSM_CLIENT_ID && process.env.OSM_CLIENT_SECRET),
  );
}

// ---------------------------------------------------------------- http

function headers(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json; charset=utf-8",
    "Accept-Language": "ru-RU, en-GB",
    AppVersion: APP_VERSION,
  };
  if (process.env.OSM_PLATFORM_ID) h.PlatformId = process.env.OSM_PLATFORM_ID;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * GET from the OSM API. Public endpoints (league, teams, managers) work without
 * a token; protected ones (statistics, matches) need credentials in .env.
 */
async function osmGet<T>(apiPath: string, retry = true): Promise<T> {
  const token = hasOsmCredentials() ? await getAccessToken() : null;
  const res = await safeFetch(`${BASE}${apiPath}`, { headers: headers(token), cache: "no-store" });
  if (res.status === 401 && !token) throw new OsmError(`GET ${apiPath} requires OSM credentials`, 401);
  if (res.status === 401 && retry && !process.env.OSM_ACCESS_TOKEN) {
    await getAccessToken(true);
    return osmGet<T>(apiPath, false);
  }
  if (res.status === 429) throw new OsmError("OSM rate limit (429) — wait before syncing again", 429);
  if (!res.ok) throw new OsmError(`GET ${apiPath} → HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Same as osmGet but returns null instead of throwing (for optional data). */
async function osmTry<T>(apiPath: string): Promise<T | null> {
  try {
    return await osmGet<T>(apiPath);
  } catch (e) {
    console.warn(`[osm] optional request failed: ${apiPath}: ${(e as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------- normalisation helpers

type AnyObj = Record<string, unknown>;
const num = (o: AnyObj, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
};
const str = (o: AnyObj, ...keys: string[]): string | null => {
  for (const k of keys) if (typeof o[k] === "string") return o[k] as string;
  return null;
};
const asArray = (v: unknown): AnyObj[] => {
  if (Array.isArray(v)) return v as AnyObj[];
  if (v && typeof v === "object") {
    for (const k of ["items", "data", "matches", "teams", "result"]) {
      const inner = (v as AnyObj)[k];
      if (Array.isArray(inner)) return inner as AnyObj[];
    }
  }
  return [];
};

function teamLogo(t: AnyObj): string | null {
  const assets = asArray(t.assets);
  const small = assets.find((a) => num(a, "type") === 3) ?? assets[0];
  const p = small ? str(small, "path", "url") : null;
  if (p) return p.startsWith("http") ? p : `https://assets.onlinesoccermanager.com/${p.replace(/^\//, "")}`;
  const baseId = str(t, "baseId");
  return baseId ? `${LOGO_BASE}/${baseId}.png` : null;
}

// ---------------------------------------------------------------- fetching

type ManagerInfo = { userId: number | null; name: string | null; crewId: number | null; crewTag: string | null; countryCode: string | null };

/** /managers is public: returns name, country, crewId and crewTag per teamId. */
async function fetchManagers(leagueId: number): Promise<Map<number, ManagerInfo>> {
  const map = new Map<number, ManagerInfo>();
  const data = await osmTry<unknown>(`/api/v1/leagues/${leagueId}/managers`);
  for (const m of asArray(data)) {
    const teamId = num(m, "teamId");
    if (teamId == null) continue;
    map.set(teamId, {
      userId: num(m, "id", "userId"),
      name: str(m, "name", "userName"),
      crewId: num(m, "crewId"),
      crewTag: str(m, "crewTag"),
      countryCode: str(m, "countryCode"),
    });
  }
  return map;
}

async function fetchCrewNames(crewIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  for (const id of crewIds) {
    const c = await osmTry<AnyObj>(`/api/v1.1/crews/${id}`);
    const name = c ? str(c, "tag", "name") : null;
    if (name) map.set(id, name);
  }
  return map;
}

async function fetchMatches(leagueId: number): Promise<AnyObj[]> {
  const override = process.env.OSM_MATCHES_PATH;
  const candidates = override
    ? [override.replace("{leagueId}", String(leagueId))]
    : [
        `/api/v1/leagues/${leagueId}/matches/filter`,
        `/api/v1/leagues/${leagueId}/matches`,
        `/api/v1/leagues/${leagueId}/fixtures`,
      ];
  for (const p of candidates) {
    const data = await osmTry<unknown>(p);
    const arr = asArray(data);
    if (arr.length) return arr;
  }
  console.warn("[osm] no matches endpoint answered; calendar left unchanged (set OSM_MATCHES_PATH after checking DevTools)");
  return [];
}

/**
 * Builds a snapshot. With `publicOnly` only the endpoints that need no token are
 * used (league, teams, managers); standings and matches are left empty so the
 * previously stored values stay untouched.
 */
export async function fetchLeagueSnapshot(leagueId: number, publicOnly = false): Promise<LeagueSnapshot> {
  const league = await osmGet<AnyObj>(`/api/v1/leagues/${leagueId}`);
  const teamsRaw = asArray(await osmGet<unknown>(`/api/v1/leagues/${leagueId}/teams`));
  const managers = await fetchManagers(leagueId);
  const statsRaw = publicOnly ? [] : asArray(await osmGet<unknown>(`/api/v1/leagues/${leagueId}/teams/statistics`));
  const matchesRaw = publicOnly ? [] : await fetchMatches(leagueId);
  // crew tags normally come with /managers; the crews endpoint is only a fallback
  const missingCrewIds = [...new Set(
    teamsRaw.map((t) => num(t, "crewId")).filter((x): x is number => x != null && x > 0),
  )].filter((cid) => ![...managers.values()].some((m) => m.crewId === cid && m.crewTag));
  const crews = missingCrewIds.length && !publicOnly ? await fetchCrewNames(missingCrewIds) : new Map<number, string>();

  const weekNr = num(league, "weekNr", "week") ?? 0;

  const teams: LeagueSnapshot["teams"] = teamsRaw.map((t) => {
    const id = num(t, "id", "teamId") ?? 0;
    const mgr = managers.get(id);
    const userId = num(t, "userId", "managerUserId") ?? mgr?.userId ?? null;
    const crewId = num(t, "crewId") ?? mgr?.crewId ?? null;
    return {
      id,
      name: str(t, "name") ?? `Team ${id}`,
      logoUrl: teamLogo(t),
      crewId,
      crewName: mgr?.crewTag ?? (crewId != null ? crews.get(crewId) ?? null : null),
      userId,
      managerName: mgr?.name ?? str(t, "managerName", "userName"),
      managerCountry: mgr?.countryCode ?? null,
      ranking: num(t, "ranking"),
      budget: num(t, "budget"),
    };
  });

  const standings: LeagueSnapshot["standings"] = statsRaw
    .map((s) => ({
      teamId: num(s, "teamId", "id") ?? -1,
      points: num(s, "points") ?? 0,
      won: num(s, "won", "wins") ?? 0,
      drew: num(s, "drew", "draws", "draw") ?? 0,
      lost: num(s, "lost", "losses") ?? 0,
      goalsFor: num(s, "goalsFor", "goalsScored") ?? 0,
      goalsAgainst: num(s, "goalsAgainst", "goalsConceded") ?? 0,
      yellowCards: num(s, "yellowCards") ?? 0,
      redCards: num(s, "redCards") ?? 0,
    }))
    .filter((s) => s.teamId >= 0);

  const matches: LeagueSnapshot["matches"] = matchesRaw
    .map((m) => {
      const w = num(m, "weekNr", "week") ?? 0;
      const played =
        typeof m.isPlayed === "boolean" ? m.isPlayed
        : typeof m.played === "boolean" ? m.played
        : (num(m, "winnerTeamId") ?? 0) !== 0 || (w > 0 && w < weekNr);
      return {
        weekNr: w,
        matchId: num(m, "matchId", "id") ?? 0,
        homeTeamId: num(m, "homeTeamId") ?? 0,
        awayTeamId: num(m, "awayTeamId") ?? 0,
        homeGoals: num(m, "homeGoals") ?? 0,
        awayGoals: num(m, "awayGoals") ?? 0,
        isPlayed: played,
      };
    })
    .filter((m) => m.homeTeamId && m.awayTeamId);

  return {
    league: {
      id: num(league, "id") ?? leagueId,
      name: str(league, "name") ?? `League ${leagueId}`,
      weekNr,
      weeks: num(league, "weeks", "totalWeeks") ?? 0,
      seasonNr: num(league, "seasonNr", "season") ?? 1,
      teamCount: num(league, "teamCount", "teams") ?? teams.length,
    },
    teams,
    standings,
    matches,
  };
}

// ---------------------------------------------------------------- sync entry point

export type SyncResult =
  | { leagueId: number; ok: true; mode: "full" | "public"; teams: number; matches: number; syncedAt: string }
  | { leagueId: number; ok: false; skipped: true; reason: string; nextAllowedAt: string }
  | { leagueId: number; ok: false; skipped?: false; error: string; lastSyncedAt: string | null };

/**
 * Syncs one league. Never throws: API errors are recorded in League.lastSyncError
 * and the previously stored data stays untouched.
 */
export async function syncLeague(osmLeagueId: number, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const existing = await prisma.league.findUnique({ where: { osmLeagueId } });

  if (!opts.force && existing?.lastSyncedAt) {
    const nextAllowed = existing.lastSyncedAt.getTime() + MIN_INTERVAL_SEC * 1000;
    if (Date.now() < nextAllowed) {
      return {
        leagueId: osmLeagueId,
        ok: false,
        skipped: true,
        reason: `synced ${Math.round((Date.now() - existing.lastSyncedAt.getTime()) / 1000)}s ago; min interval ${MIN_INTERVAL_SEC}s`,
        nextAllowedAt: new Date(nextAllowed).toISOString(),
      };
    }
  }

  // Without credentials only the public part (league, teams, managers) is refreshed.
  const mode: "full" | "public" = hasOsmCredentials() ? "full" : "public";

  try {
    const snap = await fetchLeagueSnapshot(osmLeagueId, mode === "public");
    const syncedAt = new Date();
    await saveLeagueSnapshot(snap, { syncedAt, mode });
    return { leagueId: osmLeagueId, ok: true, mode, teams: snap.teams.length, matches: snap.matches.length, syncedAt: syncedAt.toISOString() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[osm] sync of league ${osmLeagueId} failed: ${error}`);
    if (existing) await markSyncError(osmLeagueId, error);
    return { leagueId: osmLeagueId, ok: false, error, lastSyncedAt: existing?.lastSyncedAt?.toISOString() ?? null };
  }
}
