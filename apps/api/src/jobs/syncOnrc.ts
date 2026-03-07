import { db } from "../db";
import { companies, apiIntegrations } from "../db/schema";
import { eq, and, lt } from "drizzle-orm";

// ONRC sync job — called by worker on cron schedule
export async function syncOnrcJob() {
  console.log("[syncOnrc] Starting daily ONRC sync...");

  // Find organizations with ONRC auto-sync enabled
  const integrations = await db.query.apiIntegrations.findMany({
    where: and(
      eq(apiIntegrations.type, "ONRC"),
      eq(apiIntegrations.enabled, true),
      eq(apiIntegrations.autoSync, true),
    ),
  });

  let synced = 0;
  let errors = 0;

  for (const integration of integrations) {
    const syncDays = integration.syncIntervalDays || 7;
    const cutoff = new Date(Date.now() - syncDays * 86400000);

    // Find companies that haven't been synced recently
    const staleCompanies = await db.query.companies.findMany({
      where: and(
        eq(companies.organizationId, integration.organizationId),
        lt(companies.lastSyncedAt, cutoff),
      ),
    });

    for (const company of staleCompanies) {
      try {
        // Dynamic import to avoid circular dependencies
        const { lookupCUI } = await import("../services/onrc");
        const data = await lookupCUI(company.cui, integration.organizationId);
        if (data) {
          await db.update(companies).set({
            denumire: data.denumire,
            adresa: data.adresa,
            localitate: data.localitate,
            judet: data.judet,
            stare: (data.stare?.includes("radia") ? "radiata" : "functiune") as any,
            onrcRawData: data.rawData,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(companies.id, company.id));
          synced++;
        }
      } catch (error) {
        console.error(`[syncOnrc] Sync failed for CUI ${company.cui}:`, error);
        errors++;
      }

      // Rate limit: 1 request/sec
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[syncOnrc] Done: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}
