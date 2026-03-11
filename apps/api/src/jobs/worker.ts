import { processGuideWorker } from "./processGuide";
import { processTemplateWorker } from "./processTemplate";
import { processReferenceDataWorker } from "./processReferenceData";
import { processClientDocWorker } from "./processClientDoc";
import { syncOnrcJob } from "./syncOnrc";

console.log("Workers started:");
console.log("  - process-guide");
console.log("  - process-template");
console.log("  - process-reference-data");
console.log("  - process-client-doc");
console.log("  - sync-onrc (cron: daily 03:00)");

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
    }
    // Schedule next run every 24h
    setInterval(async () => {
      try {
        await syncOnrcJob();
      } catch (err) {
        console.error("[syncOnrc] Cron error:", err);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

scheduleOnrcSync();

process.on("SIGTERM", async () => {
  await processGuideWorker.close();
  await processTemplateWorker.close();
  await processReferenceDataWorker.close();
  await processClientDocWorker.close();
  process.exit(0);
});
