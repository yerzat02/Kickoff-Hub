/** Normalised league snapshot — the single shape both the seed file and the OSM API are converted into. */
export type LeagueSnapshot = {
  league: {
    id: number;
    name: string;
    weekNr: number;
    weeks: number;
    seasonNr: number;
    teamCount: number;
  };
  teams: Array<{
    id: number;
    name: string;
    logoUrl?: string | null;
    crewId?: number | null;
    crewName?: string | null;
    userId?: number | null;
    managerName?: string | null;
    managerCountry?: string | null;
    ranking?: number | null;
    budget?: number | null;
  }>;
  standings: Array<{
    teamId: number;
    points: number;
    won: number;
    drew: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    yellowCards?: number;
    redCards?: number;
  }>;
  matches: Array<{
    weekNr: number;
    matchId: number;
    homeTeamId: number;
    awayTeamId: number;
    homeGoals: number;
    awayGoals: number;
    isPlayed: boolean;
  }>;
};
