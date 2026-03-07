import { processGuideWorker } from "./processGuide";
import { processTemplateWorker } from "./processTemplate";

console.log("Workers started:");
console.log("  - process-guide");
console.log("  - process-template");

process.on("SIGTERM", async () => {
  await processGuideWorker.close();
  await processTemplateWorker.close();
  process.exit(0);
});
