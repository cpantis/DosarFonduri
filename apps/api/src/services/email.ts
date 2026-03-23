import { db } from "../db";
import { orgConfig, users } from "../db/schema";
import { eq } from "drizzle-orm";

interface EmailParams {
  organizationId: string;
  to: string;
  subject: string;
  html: string;
}

async function getFromAddress(organizationId: string): Promise<string> {
  // SENDER_EMAIL env var takes priority — it must match the domain verified in Resend
  if (process.env.SENDER_EMAIL) return process.env.SENDER_EMAIL;

  try {
    if (organizationId && organizationId !== "system") {
      const config = await db.query.orgConfig.findFirst({
        where: eq(orgConfig.organizationId, organizationId),
      });
      if (config?.emailFrom) return config.emailFrom;
    }
  } catch {
    // Invalid UUID or DB error — fall through to default
  }
  return "office@dosar-fonduri.com";
}

export async function sendEmail(params: EmailParams) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set, skipping email to", params.to, "subject:", params.subject);
    return { sent: false, reason: "no_api_key" };
  }

  try {
    const from = await getFromAddress(params.organizationId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `DosarFonduri <${from}>`,
          to: params.to,
          subject: params.subject,
          html: params.html,
        }),
        signal: controller.signal,
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("[email] Resend API error:", res.status, body);
        return { sent: false, reason: "api_error", status: res.status, detail: body };
      }

      console.log("[email] Sent to", params.to, "id:", body?.id);
      return { sent: true, id: body?.id };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[email] Send error:", error);
    return { sent: false, reason: "exception", detail: String(error) };
  }
}

// ─── NOTIFICATION TEMPLATES ───

async function getOrgUsers(organizationId: string) {
  return db.query.users.findMany({
    where: eq(users.organizationId, organizationId),
  });
}

export async function notifyNewElement(params: {
  organizationId: string;
  projectName: string;
  elementLabel: string;
  extractedBy: string;
}) {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, params.organizationId),
  });
  if (!config?.notifNewElement) return;

  const orgUsers = await getOrgUsers(params.organizationId);
  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `Element extras — ${params.projectName}`,
      html: `
        <h2>Element extras automat</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Element: <strong>${params.elementLabel}</strong></p>
        <p>Extras de: ${params.extractedBy}</p>
        <p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects">Deschide proiectul</a></p>
      `,
    });
  }
}

export async function notifyEligibilityFailed(params: {
  organizationId: string;
  projectName: string;
  ruleFailed: string;
}) {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, params.organizationId),
  });
  if (!config?.notifEligFail) return;

  const orgUsers = await getOrgUsers(params.organizationId);
  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `Eligibilitate eșuată — ${params.projectName}`,
      html: `
        <h2>Verificare eligibilitate eșuată</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Regulă: <strong>${params.ruleFailed}</strong></p>
        <p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects">Verifică detalii</a></p>
      `,
    });
  }
}

export async function notifyTemplateReady(params: {
  organizationId: string;
  projectName: string;
  documentName: string;
}) {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, params.organizationId),
  });
  if (!config?.notifTemplateReady) return;

  const orgUsers = await getOrgUsers(params.organizationId);
  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `Document completat — ${params.projectName}`,
      html: `
        <h2>Document generat cu succes</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Document: <strong>${params.documentName}</strong></p>
        <p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects">Descarcă documentul</a></p>
      `,
    });
  }
}

export async function notifyDeadlineApproaching(params: {
  organizationId: string;
  projectName: string;
  deadline: string;
  daysLeft: number;
}) {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, params.organizationId),
  });
  if (!config?.notifDeadline) return;

  const orgUsers = await getOrgUsers(params.organizationId);
  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `Termen apropiat — ${params.projectName} (${params.daysLeft} zile)`,
      html: `
        <h2>Termen de depunere apropiat</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Deadline: <strong>${params.deadline}</strong></p>
        <p>Zile rămase: <strong>${params.daysLeft}</strong></p>
        <p><a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/projects">Deschide proiectul</a></p>
      `,
    });
  }
}
