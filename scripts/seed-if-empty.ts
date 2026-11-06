import "dotenv/config";
import { execSync } from "node:child_process";
import { prisma } from "../lib/prisma";

// Runs on every deploy: loads the sample league only into an empty database,
// so data synced from OSM is never overwritten by the test file.
async function main() {
  const count = await prisma.league.count();
  if (count > 0) {
    console.log(`DB already has ${count} league(s), skipping seed`);
    return;
  }
  execSync("tsx scripts/seed.ts", { stdio: "inherit" });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
