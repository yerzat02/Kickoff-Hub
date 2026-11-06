import { prisma } from "./prisma";
import type { LeagueSnapshot } from "./types";

/** Upserts a whole league snapshot (league, teams, standings, matches) in one transaction. */
export async function saveLeagueSnapshot(snap: LeagueSnapshot, opts: { syncedAt?: Date | null; mode?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const league = await tx.league.upsert({
      where: { osmLeagueId: snap.league.id },
      create: {
        osmLeagueId: snap.league.id,
        name: snap.league.name,
        weekNr: snap.league.weekNr,
        weeks: snap.league.weeks,
        seasonNr: snap.league.seasonNr,
        teamCount: snap.league.teamCount,
        lastSyncedAt: opts.syncedAt ?? null,
        lastSyncError: null,
        lastSyncMode: opts.mode ?? null,
      },
      update: {
        name: snap.league.name,
        weekNr: snap.league.weekNr,
        weeks: snap.league.weeks,
        seasonNr: snap.league.seasonNr,
        teamCount: snap.league.teamCount,
        lastSyncError: null,
        ...(opts.syncedAt ? { lastSyncedAt: opts.syncedAt, lastSyncMode: opts.mode ?? null } : {}),
      },
    });

    const teamDbIdByOsmId = new Map<number, number>();
    for (const t of snap.teams) {
      const team = await tx.team.upsert({
        where: { leagueId_osmTeamId: { leagueId: league.id, osmTeamId: t.id } },
        create: {
          leagueId: league.id,
          osmTeamId: t.id,
          name: t.name,
          logoUrl: t.logoUrl ?? null,
          crewId: t.crewId ?? null,
          crewName: t.crewName ?? null,
          managerName: t.managerName ?? null,
          managerCountry: t.managerCountry ?? null,
          managerUserId: t.userId ?? null,
          ranking: t.ranking ?? null,
          budget: t.budget ?? null,
        },
        update: {
          name: t.name,
          logoUrl: t.logoUrl ?? undefined,
          crewId: t.crewId ?? undefined,
          crewName: t.crewName ?? undefined,
          managerName: t.managerName ?? undefined,
          managerCountry: t.managerCountry ?? undefined,
          managerUserId: t.userId ?? undefined,
          ranking: t.ranking ?? undefined,
          budget: t.budget ?? undefined,
        },
      });
      teamDbIdByOsmId.set(t.id, team.id);
    }

    for (const s of snap.standings) {
      const teamId = teamDbIdByOsmId.get(s.teamId);
      if (!teamId) continue;
      const data = {
        points: s.points,
        won: s.won,
        drew: s.drew,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        yellowCards: s.yellowCards ?? 0,
        redCards: s.redCards ?? 0,
      };
      await tx.standing.upsert({ where: { teamId }, create: { teamId, ...data }, update: data });
    }

    for (const m of snap.matches) {
      const data = {
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        isPlayed: m.isPlayed,
      };
      await tx.match.upsert({
        where: { leagueId_weekNr_matchId: { leagueId: league.id, weekNr: m.weekNr, matchId: m.matchId } },
        create: { leagueId: league.id, weekNr: m.weekNr, matchId: m.matchId, ...data },
        update: data,
      });
    }

    return league;
  });
}

export async function markSyncError(osmLeagueId: number, message: string) {
  await prisma.league.updateMany({ where: { osmLeagueId }, data: { lastSyncError: message.slice(0, 500) } });
}
