import "dotenv/config";
import { prisma } from "../lib/prisma";
import { syncLeague } from "../lib/osm";

// usage: npm run sync [-- <osmLeagueId> ...] [--force]
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
  if (!ids.length) ids = (await prisma.league.findMany({ select: { osmLeagueId: true } })).map((l) => l.osmLeagueId);
  if (!ids.length) {
    console.log("No leagues in DB. Pass an osmLeagueId: npm run sync -- 154274365");
    return;
  }
  for (const id of ids) {
    const r = await syncLeague(id, { force });
    console.log(JSON.stringify(r));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
