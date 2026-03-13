# FAZA 8 — Polish & Finalizare
## Dashboard, Responsive Tablet, Notificări Email, Export, Performance, Error Handling, Cron Jobs

**Dependențe**: Fazele 1-7 completate

---

## 8.0 DASHBOARD (Panou Principal)

### Referință UI: `02_Panou.jsx`
### Rută: `/dashboard`

**Layout:** pagină scroll cu sidebar aplicație (la fel ca toate paginile)

### Conținut:

**4 KPI Cards (grid 4 coloane):**
- 📊 Proiecte active — count + trend vs luna trecută
- 🏢 Firme — count total
- 📄 Documente procesate — count total
- 📅 Sesiuni deschise — count cu deadline-uri

**Proiecte recente (top 5):**
- Card per proiect: nume, firmă, status badge, 4 mini progress bars (eligibilitate, elemente, documente, template-uri)
- Click → navighează la ProjectView

**Feed activitate (ultimele 15 acțiuni):**
- Timeline: icon per tip + acțiune + detaliu + user + timestamp
- Tipuri: element extras, regulă verificată, doc generat, firmă adăugată, proiect creat

**Deadline-uri apropiate:**
- Card-uri sesiuni cu deadline < 30 zile
- Countdown: "12 zile rămase" / "3 zile — URGENT" (roșu)

**Acțiuni rapide:**
- + Proiect nou → modal creare wizard
- + Firmă nouă → modal adaugă firmă
- 📤 Upload document → selector folder din arbore

### Backend Route:

```typescript
// apps/api/src/routes/dashboard.ts
import { Hono } from "hono";

const dashboardRoutes = new Hono();

dashboardRoutes.get("/", async (c) => {
  const auth = c.get("auth") as AuthContext;
  const orgId = auth.organizationId!;

  // KPI-uri
  const [projectCount] = await db.select({ count: count() }).from(projects)
    .where(and(eq(projects.organizationId, orgId), ne(projects.status, "archived")));
  const [companyCount] = await db.select({ count: count() }).from(companies)
    .where(eq(companies.organizationId, orgId));
  const [docCount] = await db.select({ count: count() }).from(documents)
    .innerJoin(documentFolders, eq(documents.folderId, documentFolders.id))
    .where(eq(documentFolders.organizationId, orgId));

  // Proiecte recente cu progress
  const recentProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, orgId),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
    limit: 5,
    with: { company: true },
  });

  // Enrich cu progress bars
  const enriched = await Promise.all(recentProjects.map(async (p) => {
    const eligibility = await getEligibilityProgress(p.id);
    const elements = await getElementsProgress(p.id);
    const checklist = await getChecklistProgress(p.id);
    const neemia = await getNeemiaProgress(p.id);
    return { ...p, progress: { eligibility, elements, checklist, neemia } };
  }));

  // Activitate recentă
  const activity = await db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, orgId),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
    limit: 15,
  });

  // Deadline-uri (sesiuni cu deadline < 30 zile)
  // Deadline-urile sunt stocate ca metadate pe folderul sesiunii
  const deadlines = await getUpcomingDeadlines(orgId, 30);

  return c.json({
    stats: {
      projects: projectCount.count,
      companies: companyCount.count,
      documents: docCount.count,
    },
    recentProjects: enriched,
    activity,
    deadlines,
  });
});

export { dashboardRoutes };
```

### Înregistrare route în FAZA_1:

```typescript
// apps/api/src/index.ts — adaugă:
import { dashboardRoutes } from "./routes/dashboard";
app.route("/api/dashboard", authMiddleware, dashboardRoutes);
```

---

## 8.1 RESPONSIVE DESIGN (768-1440px)

### Breakpoints Tailwind

```css
/* tailwind.config.ts */
theme: {
  screens: {
    'tablet': '768px',    /* Tabletă */
    'laptop': '1024px',   /* Laptop */
    'desktop': '1440px',  /* Desktop mare */
  }
}
```

### Sidebar Collapsibilă

```typescript
// apps/web/src/components/layout/Sidebar.tsx (upgrade)
// Adaugă state collapsed + responsive auto-collapse

const [collapsed, setCollapsed] = useState(false);

// Auto-collapse pe tablet
useEffect(() => {
  const mq = window.matchMedia("(max-width: 1024px)");
  const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
  mq.addEventListener("change", handler);
  setCollapsed(mq.matches);
  return () => mq.removeEventListener("change", handler);
}, []);

// Sidebar width: collapsed = 64px (icon-only), expanded = 240px
// Pe hover/click se expandează temporar pe tablet
// Logo: collapsed = doar "DF", expanded = "DosarFonduri"
// Nav items: collapsed = doar icon, expanded = icon + label
// Footer: collapsed = doar avatar, expanded = avatar + name + theme toggle
```

### Layout Adaptiv per Pagina

**Panou (Dashboard):**
```css
/* Stats grid */
.stats-grid {
  @apply grid grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 gap-4;
}
/* Projects grid */
.project-cards {
  @apply grid grid-cols-1 laptop:grid-cols-2 desktop:grid-cols-3 gap-4;
}
```

**Firme:**
```css
/* Split pane → slide-over pe tablet */
@media (max-width: 1024px) {
  /* Lista firme full width */
  /* Click pe firmă → detail slide-over din dreapta (overlay) */
  /* Buton "← Înapoi" pe detail panel */
}
```

**Documente:**
```css
@media (max-width: 1024px) {
  /* Arbore foldere → collapsible panel */
  /* Document list → full width */
  /* Detail → slide-over */
}
```

**Proiecte:**
```css
.proj-grid {
  @apply grid grid-cols-1 laptop:grid-cols-2 gap-4;
}
/* Table view: scroll horizontal pe tablet */
```

**Template Viewer:**
```css
@media (max-width: 1024px) {
  /* Stacked vertical: checklist sus, document jos */
  /* Sau tab toggle: "Elemente" / "Document" */
}
```

### Slide-Over Component

```typescript
// apps/web/src/components/layout/SlideOver.tsx
"use client";
import { useEffect } from "react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: string;
  children: React.ReactNode;
}

export function SlideOver({ open, onClose, title, width = "400px", children }: SlideOverProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 bg-[var(--bg-surface)] border-l border-[var(--border)] shadow-2xl transition-transform overflow-y-auto"
        style={{ width, maxWidth: "90vw" }}
      >
        {title && (
          <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">←</button>
            <h3 className="font-bold text-[var(--text-primary)]">{title}</h3>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
```

---

## 8.2 NOTIFICĂRI EMAIL (Resend)

### Service Email

```typescript
// apps/api/src/services/email.ts
import { Resend } from "resend";
import { db } from "../db";
import { orgConfig, users } from "../db/schema";
import { eq } from "drizzle-orm";

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailParams {
  organizationId: string;
  to: string;
  subject: string;
  html: string;
}

async function getFromAddress(organizationId: string): Promise<string> {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, organizationId),
  });
  return config?.emailFrom || process.env.SENDER_EMAIL || "notificari@dosarfonduri.ro";
}

export async function sendEmail(params: EmailParams) {
  const from = await getFromAddress(params.organizationId);

  try {
    await resend.emails.send({
      from: `DosarFonduri <${from}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
  } catch (error) {
    console.error("Email send error:", error);
  }
}

// ─── TEMPLATES ───

export async function notifyNewElement(params: {
  organizationId: string;
  projectName: string;
  elementLabel: string;
  extractedBy: string; // "Solomon" | consultant name
}) {
  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, params.organizationId),
  });
  if (!config?.notifNewElement) return;

  // Trimite la toți consultanții din organizație
  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, params.organizationId),
  });

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
        <p><a href="${process.env.FRONTEND_URL}/projects">Deschide proiectul</a></p>
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

  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, params.organizationId),
  });

  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `⚠️ Eligibilitate eșuată — ${params.projectName}`,
      html: `
        <h2>Verificare eligibilitate eșuată</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Regulă: <strong>${params.ruleFailed}</strong></p>
        <p><a href="${process.env.FRONTEND_URL}/projects">Verifică detalii</a></p>
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

  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, params.organizationId),
  });

  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `Document completat — ${params.projectName}`,
      html: `
        <h2>Document generat cu succes</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Document: <strong>${params.documentName}</strong></p>
        <p><a href="${process.env.FRONTEND_URL}/projects">Descarcă documentul</a></p>
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

  const orgUsers = await db.query.users.findMany({
    where: eq(users.organizationId, params.organizationId),
  });

  for (const user of orgUsers) {
    await sendEmail({
      organizationId: params.organizationId,
      to: user.email,
      subject: `⏰ Termen apropiat — ${params.projectName} (${params.daysLeft} zile)`,
      html: `
        <h2>Termen de depunere apropiat</h2>
        <p>Proiect: <strong>${params.projectName}</strong></p>
        <p>Deadline: <strong>${params.deadline}</strong></p>
        <p>Zile rămase: <strong>${params.daysLeft}</strong></p>
        <p><a href="${process.env.FRONTEND_URL}/projects">Deschide proiectul</a></p>
      `,
    });
  }
}
```

---

## 8.3 EXPORT & BACKUP

```typescript
// apps/api/src/routes/export.ts
import { Hono } from "hono";
import { db } from "../db";
import { projects, companies, documents, projectElements, rules, auditLog } from "../db/schema";
import { eq } from "drizzle-orm";
import { AuthContext } from "../middleware/auth";

export const exportRoutes = new Hono();

// Export toate proiectele (JSON)
exportRoutes.get("/projects", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const allProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, auth.organizationId!),
    with: { company: true },
  });

  // Enrich cu elemente
  const enriched = await Promise.all(allProjects.map(async (p) => {
    const elements = await db.query.projectElements.findMany({
      where: eq(projectElements.projectId, p.id),
      with: { templateElement: true },
    });
    return {
      ...p,
      elements: elements.map(e => ({
        key: e.templateElement?.key,
        label: e.templateElement?.label,
        value: e.value,
        source: e.source,
        confirmed: e.confirmed,
      })),
    };
  }));

  c.header("Content-Type", "application/json");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_projects_${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(enriched);
});

// Export configurări
exportRoutes.get("/config", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const config = await db.query.orgConfig.findFirst({
    where: eq(orgConfig.organizationId, auth.organizationId!),
  });

  c.header("Content-Disposition", `attachment; filename="dosarfonduri_config_${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(config);
});

// Export raport activitate CSV
exportRoutes.get("/activity", async (c) => {
  const auth = c.get("auth") as AuthContext;
  if (auth.role !== "admin") return c.json({ error: "Doar admin" }, 403);

  const logs = await db.query.auditLog.findMany({
    where: eq(auditLog.organizationId, auth.organizationId!),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 10000,
  });

  // CSV format
  const header = "timestamp,user_id,action,entity_type,entity_id\n";
  const rows = logs.map(l =>
    `${l.createdAt?.toISOString()},${l.userId},${l.action},${l.entityType || ""},${l.entityId || ""}`
  ).join("\n");

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="dosarfonduri_activity_${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.text(header + rows);
});
```

---

## 8.4 CRON JOBS (ONRC Sync)

```typescript
// apps/api/src/jobs/syncOnrc.ts
import { Worker, Job } from "bullmq";
import { db } from "../db";
import { companies, apiIntegrations } from "../db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { lookupCUI } from "../services/onrc";

// Rulează zilnic — sincronizează firmele care au trecut de intervalul de sync
export const syncOnrcWorker = new Worker(
  "sync-onrc",
  async (job: Job) => {
    // Găsește organizațiile cu auto-sync activ
    const integrations = await db.query.apiIntegrations.findMany({
      where: and(
        eq(apiIntegrations.type, "ONRC"),
        eq(apiIntegrations.enabled, true),
        eq(apiIntegrations.autoSync, true),
      ),
    });

    for (const integration of integrations) {
      const syncDays = integration.syncIntervalDays || 7;
      const cutoff = new Date(Date.now() - syncDays * 86400000);

      // Firmele care nu au fost sincronizate recent
      const staleCompanies = await db.query.companies.findMany({
        where: and(
          eq(companies.organizationId, integration.organizationId),
          lt(companies.lastSyncedAt, cutoff),
        ),
      });

      for (const company of staleCompanies) {
        try {
          const data = await lookupCUI(company.cui, integration.organizationId);
          if (data) {
            await db.update(companies).set({
              denumire: data.denumire,
              adresa: data.adresa,
              localitate: data.localitate,
              judet: data.judet,
              stare: data.stare.includes("radia") ? "radiata" : "functiune" as any,
              onrcRawData: data.rawData,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            }).where(eq(companies.id, company.id));
          }
        } catch (error) {
          console.error(`Sync failed for ${company.cui}:`, error);
        }

        // Rate limit: 1 request/sec
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  },
  { connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") } }
);

// Setup cron (rulează zilnic la 03:00)
import { Queue } from "bullmq";
const syncQueue = new Queue("sync-onrc", {
  connection: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || "6379") }
});

// Adaugă job recurent
syncQueue.add("daily-sync", {}, {
  repeat: { pattern: "0 3 * * *" }, // zilnic la 03:00
});
```

---

## 8.5 PERFORMANCE

### Lazy Loading

```typescript
// apps/web/src/app/(app)/layout.tsx
import dynamic from "next/dynamic";

// Sidebar importat normal (necesar la layout)
// Paginile grele importate lazy
const SolomonChat = dynamic(() => import("@/components/solomon/SolomonChat"), {
  loading: () => <div className="animate-pulse bg-[var(--bg-surface)] h-full" />,
});
```

### Optimistic Updates

```typescript
// apps/web/src/hooks/useOptimistic.ts
import { useState, useCallback } from "react";

export function useOptimisticUpdate<T>(initial: T) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);

  const optimisticUpdate = useCallback(async (
    newData: T,
    apiCall: () => Promise<T>,
  ) => {
    const previous = data;
    setData(newData); // Instant UI update
    setPending(true);

    try {
      const result = await apiCall();
      setData(result); // Confirm cu date server
    } catch {
      setData(previous); // Rollback
    } finally {
      setPending(false);
    }
  }, [data]);

  return { data, setData, pending, optimisticUpdate };
}
```

### SWR / React Query

```typescript
// apps/web/src/hooks/useApi.ts
import useSWR from "swr";

const fetcher = async (url: string) => {
  const token = localStorage.getItem("df-token");
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
};

export function useApi<T>(path: string | null) {
  return useSWR<T>(path, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
}

// Usage:
// const { data: projects, mutate } = useApi<Project[]>("/api/projects");
```

---

## 8.6 ERROR HANDLING

### Global Error Boundary

```typescript
// apps/web/src/components/ErrorBoundary.tsx
"use client";
import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Ceva nu a mers bine</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white font-semibold"
            >
              Încearcă din nou
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### API Error Handler (Hono)

```typescript
// apps/api/src/middleware/errorHandler.ts
import { Context } from "hono";

export const errorHandler = (err: Error, c: Context) => {
  console.error("Unhandled error:", err);

  if (err.name === "ZodError") {
    return c.json({ error: "Date invalide", details: (err as any).issues }, 400);
  }

  if (err.message.includes("not found") || err.message.includes("Not found")) {
    return c.json({ error: "Resursa nu a fost găsită" }, 404);
  }

  return c.json({ error: "Eroare internă" }, 500);
};

// În index.ts:
// app.onError(errorHandler);
```

### Toast Notifications (Frontend)

```typescript
// apps/web/src/components/shared/Toast.tsx
"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: string; type: ToastType; message: string }

const ToastContext = createContext<{
  toast: (type: ToastType, message: string) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const colors = {
    success: "var(--accent-green)",
    error: "var(--accent-red)",
    warning: "var(--accent-yellow)",
    info: "var(--accent-blue)",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-3 rounded-lg border shadow-lg text-sm font-medium animate-slide-up"
            style={{
              background: "var(--bg-surface)",
              borderColor: colors[t.type],
              color: "var(--text-primary)",
              borderLeft: `3px solid ${colors[t.type]}`,
            }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
```

---

## 8.7 DEPLOYMENT CHECKLIST

### Railway (Backend)

```yaml
# railway.toml
[build]
  builder = "DOCKERFILE"
  dockerfilePath = "apps/api/Dockerfile"

[deploy]
  startCommand = "node dist/index.js"
  healthcheckPath = "/health"
  healthcheckTimeout = 10
  restartPolicyType = "ON_FAILURE"

# Worker service separat
# startCommand = "node dist/jobs/worker.js"
```

### Vercel (Frontend)

```json
// vercel.json
{
  "framework": "nextjs",
  "buildCommand": "cd apps/web && npm run build",
  "outputDirectory": "apps/web/.next",
  "installCommand": "npm install"
}
```

### Dockerfile Backend

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install --break-system-packages PyMuPDF python-docx openpyxl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/api/package*.json ./
RUN npm ci --only=production
COPY apps/api/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
```

---

## 8.8 CHECKLIST FINAL FAZA 8

- [ ] **Dashboard: route GET /api/dashboard (KPI, proiecte recente, activitate, deadline-uri)**
- [ ] **Dashboard: frontend pagina Panou (02_Panou.jsx referință)**
- [ ] Responsive: sidebar collapsibilă pe tablet
- [ ] Responsive: SlideOver component pentru detalii pe tablet
- [ ] Responsive: grid-uri adaptive (2/3/4 coloane)
- [ ] Responsive: Template Viewer stacked pe tablet
- [ ] Email: service Resend cu templates HTML
- [ ] Email: notificare element extras
- [ ] Email: notificare eligibilitate eșuată
- [ ] Email: notificare template completat
- [ ] Email: notificare termen apropiat
- [ ] Export: proiecte JSON
- [ ] Export: configurări JSON
- [ ] Export: raport activitate CSV
- [ ] Cron: sync ONRC zilnic (BullMQ repeat)
- [ ] Performance: lazy loading componente grele
- [ ] Performance: SWR/React Query data fetching
- [ ] Performance: optimistic updates
- [ ] Error: ErrorBoundary global
- [ ] Error: Hono error handler cu Zod
- [ ] Error: Toast notifications
- [ ] Deploy: Railway Dockerfile (API + Worker)
- [ ] Deploy: Vercel config (Frontend)
- [ ] Deploy: variabile de mediu setate
- [ ] Testing: endpoint-uri principale (smoke tests)
- [ ] Testing: flow complet end-to-end (signup → firmă → ghid → template → proiect → Solomon → Neemia → download)

---

## 8.9 FLOW COMPLET END-TO-END (TESTARE)

**Pașii de verificat:**

1. Provider generează cod `DF-TEST-2026` (Professional, 5 users, 30 zile trial)
2. Consultant face signup → date personale → firmă opțional → cod `DF-TEST-2026` → cont creat
3. Login → redirect dashboard (gol)
4. Firme → Adaugă firmă → CUI → preluare ONRC → firmă apare cu toate datele
5. Firme → Upload bilanț ANAF (PDF) → F10/F20/F30/F40 parsate
6. Documente → Arbore → Creare Program/Măsură/Sesiune
7. Documente → Ghiduri → Upload ghid PDF → Procesare → Reguli extrase (fixe + interpretate)
8. Documente → Template-uri → Upload cerere finanțare DOCX → Elemente extrase automat
9. Template Viewer → Validare elemente → Adaugă manual dacă lipsesc
10. Proiecte → Proiect nou → Selectare firmă + sesiune + nume → Pre-eligibilitate automată
11. Proiect → Eligibilitate → Verificare reguli (passed/failed)
12. Proiect → Solomon → Chat → Upload CI, CV, oferte → Extragere câmpuri automat
13. Proiect → Solomon → Conversație → Completare câmpuri prin dialog
14. Proiect → Elemente → Verificare completare (X/Y complete, confirmate)
15. Proiect → Neemia → Selectare template → Validare pre-generare → Generare → Download DOCX
16. Admin → Utilizatori → Adaugă email consultant → Al doilea consultant face signup → automat în cabinet
17. Admin → Audit AI → Costuri per proiect vizibile
18. Configurări → Solomon model switch → Integrare API test → Notificări configure
19. Provider → Dashboard → Cabinetul apare activ cu stats

**Dacă toți pașii funcționează, aplicația e completă.**
