import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncLeague } from "@/lib/osm";

// POST /api/sync            → sync every league stored in the DB
// POST /api/sync?leagueId=N → sync one league (osmLeagueId); add &force=1 to ignore the min interval
// Header x-sync-token is required when SYNC_SECRET is set in .env
export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (secret && req.headers.get("x-sync-token") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSync(req);
}

// GET /api/sync is called by Vercel Cron (see vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSync(req);
}

async function runSync(req: NextRequest) {
  const url = req.nextUrl;
  const force = url.searchParams.get("force") === "1";
  const one = url.searchParams.get("leagueId");
  const ids = one
    ? [Number(one)]
    : (await prisma.league.findMany({ select: { osmLeagueId: true } })).map((l) => l.osmLeagueId);

  if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    return Response.json({ error: "no valid leagueId" }, { status: 400 });
  }

  const results = [];
  for (const id of ids) results.push(await syncLeague(id, { force }));
  const status = results.every((r) => r.ok) ? 200 : results.some((r) => r.ok) ? 207 : 502;
  return Response.json({ results }, { status });
}
