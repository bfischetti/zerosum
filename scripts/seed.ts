import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { createDb } from "../src/db.js";
import { seedSampleGroup } from "../src/seed.js";

/** Integer cents to "-12.34", without floating point. */
function euros(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const db = createDb(config.databaseUrl);
const app = buildApp({ db, logger: false });

try {
  const { groupId, memberIds } = await seedSampleGroup(app);
  const nameOf = Object.fromEntries(Object.entries(memberIds).map(([n, id]) => [id, n]));

  const balances = (await app.inject({ method: "GET", url: `/groups/${groupId}/balances` })).json();
  const plan = (await app.inject({ method: "GET", url: `/groups/${groupId}/settlement-plan` })).json();

  console.log(`Seeded group "Lisbon trip": ${groupId}\n`);
  console.log("Balances (positive = is owed):");
  for (const m of balances.members) console.log(`  ${m.name.padEnd(6)} ${euros(m.balance).padStart(9)} EUR`);
  console.log("\nSettlement plan:");
  for (const p of plan.payments) {
    console.log(`  ${nameOf[p.fromMemberId]} pays ${nameOf[p.toMemberId]} ${euros(p.amount)} EUR`);
  }
} finally {
  await app.close();
  await db.destroy();
}
