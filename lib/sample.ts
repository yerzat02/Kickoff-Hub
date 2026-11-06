import type { LeagueSnapshot } from "./types";

/** Shape of data/osm-sample-data.json (cache of the OSM web client). */
type SampleFile = {
  league: { id: number; name: string; weekNr: number; weeks: number; seasonNr: number; teamCount: number };
  managers: Record<string, string>;
  crews: Record<string, string>;
  teams: Array<{
    id: number; name: string; baseId: string; crewId?: number; userId?: number;
    ranking?: number; budget?: number; logo?: string;
  }>;
  standings: LeagueSnapshot["standings"];
  matches: Array<{
    weekNr: number; matchId: number; homeTeamId: number; awayTeamId: number;
    homeGoals: number; awayGoals: number; winnerTeamId?: number; isPlayed?: boolean;
  }>;
};

export function sampleToSnapshot(data: SampleFile): LeagueSnapshot {
  return {
    league: { ...data.league },
    teams: data.teams.map((t) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo ?? `https://assets.onlinesoccermanager.com/Team/Small/${t.baseId}.png`,
      crewId: t.crewId ?? null,
      crewName: t.crewId != null ? data.crews[String(t.crewId)] ?? null : null,
      userId: t.userId ?? null,
      managerName: t.userId != null ? data.managers[String(t.userId)] ?? null : null,
      ranking: t.ranking ?? null,
      budget: t.budget ?? null,
    })),
    standings: data.standings,
    matches: data.matches.map((m) => ({
      weekNr: m.weekNr,
      matchId: m.matchId,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      isPlayed: m.isPlayed ?? (m.winnerTeamId != null && m.winnerTeamId !== 0),
    })),
  };
}
