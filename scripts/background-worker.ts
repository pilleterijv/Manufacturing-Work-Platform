import "dotenv/config";
import { serviceIssue } from "../lib/service-errors";
import { pollExternalData } from "../lib/external-poller";
import { queueOverdueReminders } from "../lib/reminders";
import { db } from "../lib/db";
import { checkShiftWork } from "../lib/shift-monitor";
import { deliverShiftEmails } from "../lib/email-delivery";
import { pollCompanySql, closeCompanySql } from "../lib/company-sql";
import { periodicJob } from "../lib/background-loop";
let stopping = false;
const health: Record<string, { checkedAt: string; ok: boolean }> = {};
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const jobs = [
  {
    name: "expired-password-links",
    interval: 1800000,
    run: () =>
      db.passwordReset.deleteMany({ where: { expires: { lt: new Date() } } }),
  },
  { name: "external-data", interval: 30000, run: pollExternalData },
  { name: "sql", interval: 10000, run: pollCompanySql },
  { name: "shifts", interval: 60000, run: checkShiftWork },
  { name: "overdue", interval: 60000, run: () => queueOverdueReminders() },
  { name: "email", interval: 10000, run: deliverShiftEmails },
];
async function runJob(job: (typeof jobs)[number]) {
  try {
    await job.run();
    health[job.name] = { checkedAt: new Date().toISOString(), ok: true };
  } catch (error) {
    const issue = serviceIssue(error);
    health[job.name] = { checkedAt: new Date().toISOString(), ok: false };
    console.error(
      `Background ${job.name} failed [${issue.code}]: ${issue.message} Other services continue.`,
    );
  }
}
async function saveHealth() {
  const value = { checkedAt: new Date().toISOString(), services: health };
  await db.setting.upsert({
    where: { key: "background-worker-health" },
    create: { key: "background-worker-health", value },
    update: { value },
  });
}
async function main() {
  try {
    if (process.argv.includes("--once")) {
      for (const job of jobs) await runJob(job);
      await saveHealth();
      if (Object.values(health).some((h) => !h.ok)) process.exitCode = 1;
    } else {
      await Promise.all([
        ...jobs.map((job) =>
          periodicJob(
            () => runJob(job),
            job.interval,
            () => stopping,
            () => console.error(`Background ${job.name} service will retry.`),
          ),
        ),
        periodicJob(
          saveHealth,
          10000,
          () => stopping,
          () =>
            console.error(
              "Worker health could not be saved; check PostgreSQL.",
            ),
        ),
      ]);
    }
  } finally {
    await closeCompanySql();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Background worker stopped unexpectedly.");
  process.exitCode = 1;
});
