import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { sampleToSnapshot } from "../lib/sample";
import { saveLeagueSnapshot } from "../lib/store";

async function main() {
  const file = path.join(process.cwd(), "data", "osm-sample-data.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const snap = sampleToSnapshot(raw);
  const league = await saveLeagueSnapshot(snap);
  console.log(
    `Seeded league "${league.name}" (osmLeagueId=${league.osmLeagueId}): ` +
      `${snap.teams.length} teams, ${snap.standings.length} standings, ${snap.matches.length} matches`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
