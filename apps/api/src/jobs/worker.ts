import "dotenv/config";
import { processGuideWorker } from "./processGuide";
import { processTemplateWorker } from "./processTemplate";
import { processReferenceDataWorker } from "./processReferenceData";
import { processClientDocWorker } from "./processClientDoc";
import { processCompanyWorker } from "./processCompany";
import { syncOnrcJob } from "./syncOnrc";
import { checkDeadlines } from "./checkDeadlines";

console.log("Workers started:");
console.log("  - process-guide");
console.log("  - process-template");
console.log("  - process-reference-data");
console.log("  - process-client-doc");
console.log("  - process-company (concurrency: 2)");
console.log("  - sync-onrc (cron: daily 03:00)");
console.log("  - check-deadlines (cron: daily 08:00)");

// ONRC sync cron — runs daily at 03:00
function scheduleOnrcSync() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      await syncOnrcJob();
    } catch (err) {
      console.error("[syncOnrc] Cron error:", err);
      // Retry once after 5 minutes
      setTimeout(async () => { try { await syncOnrcJob(); } catch (e) { console.error("[syncOnrc] Retry failed:", e); } }, 5 * 60 * 1000);
    }
    // Schedule next run every 24h
    setInterval(async () => {
      try {
        await syncOnrcJob();
      } catch (err) {
        console.error("[syncOnrc] Cron error:", err);
        setTimeout(async () => { try { await syncOnrcJob(); } catch (e) { console.error("[syncOnrc] Retry failed:", e); } }, 5 * 60 * 1000);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

scheduleOnrcSync();

// Deadline check cron — runs daily at 08:00
function scheduleDeadlineCheck() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(async () => {
    try {
      await checkDeadlines();
    } catch (err) {
      console.error("[checkDeadlines] Cron error:", err);
      setTimeout(async () => { try { await checkDeadlines(); } catch (e) { console.error("[checkDeadlines] Retry failed:", e); } }, 5 * 60 * 1000);
    }
    setInterval(async () => {
      try {
        await checkDeadlines();
      } catch (err) {
        console.error("[checkDeadlines] Cron error:", err);
        setTimeout(async () => { try { await checkDeadlines(); } catch (e) { console.error("[checkDeadlines] Retry failed:", e); } }, 5 * 60 * 1000);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

scheduleDeadlineCheck();

process.on("SIGTERM", async () => {
  await processGuideWorker.close();
  await processTemplateWorker.close();
  await processReferenceDataWorker.close();
  await processClientDocWorker.close();
  await processCompanyWorker.close();
  process.exit(0);
});
