import "dotenv/config";
import { db } from "../lib/db";
import { checkShiftWork } from "../lib/shift-monitor";
import { deliverShiftEmails } from "../lib/email-delivery";
import { pollCompanySql, closeCompanySql } from "../lib/company-sql";
let stopping = false,
  lastShiftCheck = 0;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function main() {
  while (!stopping) {
    try {
      await pollCompanySql();
      if (Date.now() - lastShiftCheck >= 60000) {
        await checkShiftWork();
        lastShiftCheck = Date.now();
      }
      await deliverShiftEmails();
      await db.setting.upsert({
        where: { key: "background-worker-health" },
        create: {
          key: "background-worker-health",
          value: { checkedAt: new Date().toISOString() },
        },
        update: { value: { checkedAt: new Date().toISOString() } },
      });
    } catch {
      console.error(
        "Background cycle failed; check database availability and worker configuration. Retrying.",
      );
    }
    if (process.argv.includes("--once")) stopping = true;
    for (let i = 0; i < 10 && !stopping; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await closeCompanySql();
  await db.$disconnect();
}
main().catch(() => {
  console.error("Background worker stopped unexpectedly.");
  process.exitCode = 1;
});
