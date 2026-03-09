# Configurări Railway — DosarFonduri

## Arhitectură deploy

```
Railway Project: DosarFonduri
├── PostgreSQL (plugin)          ← bază de date
├── Redis (plugin)               ← cache + BullMQ
├── Service: api                 ← Hono API (port 8080)
├── Service: worker              ← BullMQ worker (fără port)
└── Service: web                 ← Next.js 15 (port 3000)
```

---

## Pas 1 — Creează proiectul Railway

1. Mergi la [railway.app](https://railway.app) → **New Project**
2. Alege **Empty Project**
3. Numele proiectului: `DosarFonduri`

---

## Pas 2 — PostgreSQL

1. În proiect → **+ New** → **Database** → **PostgreSQL**
2. Railway creează automat variabila `DATABASE_URL`
3. După creare, du-te în **Settings** → **Networking** → asigură-te că **Private networking** e activat (serviciile comunică intern fără latență)

**Notă:** Railway oferă PostgreSQL 16. Connection string-ul arată:
```
postgresql://postgres:PASSWORD@HOST:5432/railway
```

---

## Pas 3 — Redis

1. **+ New** → **Database** → **Redis**
2. Railway creează automat `REDIS_URL`
3. Verifică în **Variables** că ai `REDIS_URL` disponibil

**Notă:** BullMQ necesită `maxRetriesPerRequest: null` — deja configurat în `lib/redis.ts`.

---

## Pas 4 — Service: API (Hono)

### 4.1 Creare serviciu

1. **+ New** → **GitHub Repo** → selectează repo-ul `DosarFonduri`
2. Redenumește serviciul: `api`

### 4.2 Build settings

- **Builder**: Dockerfile
- **Dockerfile Path**: `apps/api/Dockerfile`
- **Watch Paths**: `apps/api/**`, `packages/shared/**`

### 4.3 Deploy settings

- **Start Command**: `node dist/index.js`
- **Health Check Path**: `/health`
- **Health Check Timeout**: 10s
- **Restart Policy**: On Failure

### 4.4 Networking

- **Port**: `8080` (sau setează `PORT=8080` în variables)
- Generează **Public Domain**: `api-dosarfonduri.up.railway.app` (sau custom domain)

### 4.5 Variables (Environment)

Adaugă **toate** variabilele:

| Variabilă | Valoare | Notă |
|-----------|---------|------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referință Railway (se completează automat) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Referință Railway |
| `PORT` | `8080` | Port server |
| `JWT_SECRET` | (generează 64 char random) | `openssl rand -hex 32` |
| `PROVIDER_JWT_SECRET` | (generează 64 char random) | Alt secret, diferit de JWT_SECRET |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | De la console.anthropic.com |
| `FRONTEND_URL` | `https://dosarfonduri.up.railway.app` | URL-ul serviciului web (pt CORS) |

**Opționale (când configurezi storage S3/R2):**

| Variabilă | Valoare | Notă |
|-----------|---------|------|
| `S3_ENDPOINT` | `https://xxx.r2.cloudflarestorage.com` | Cloudflare R2 endpoint |
| `S3_BUCKET` | `dosarfonduri` | Numele bucket-ului |
| `S3_ACCESS_KEY` | (din R2 dashboard) | Access key ID |
| `S3_SECRET_KEY` | (din R2 dashboard) | Secret access key |
| `S3_REGION` | `auto` | Pentru R2 e mereu `auto` |

---

## Pas 5 — Service: Worker (BullMQ)

### 5.1 Creare serviciu

1. **+ New** → **GitHub Repo** → selectează **același** repo
2. Redenumește serviciul: `worker`

### 5.2 Build settings

- **Builder**: Dockerfile
- **Dockerfile Path**: `apps/api/Dockerfile` (același ca API)
- **Watch Paths**: `apps/api/**`, `packages/shared/**`

### 5.3 Deploy settings

- **Start Command**: `node dist/jobs/worker.js` (override!)
- **Health Check**: FĂRĂ (worker-ul nu expune HTTP)
- **Restart Policy**: On Failure

### 5.4 Networking

- **NU** genera domeniu public — worker-ul nu primește trafic extern

### 5.5 Variables

**Identice cu API** — copiază tot din serviciul `api`:
```
DATABASE_URL    = ${{Postgres.DATABASE_URL}}
REDIS_URL       = ${{Redis.REDIS_URL}}
JWT_SECRET      = (același ca api)
PROVIDER_JWT_SECRET = (același ca api)
ANTHROPIC_API_KEY = (același)
FRONTEND_URL    = (același)
```

**Shortcut Railway:** Poți folosi **Shared Variables** la nivel de proiect ca să nu le duplici.

---

## Pas 6 — Service: Web (Next.js)

### 6.1 Creare serviciu

1. **+ New** → **GitHub Repo** → selectează **același** repo
2. Redenumește serviciul: `web`

### 6.2 Build settings

- **Builder**: Dockerfile
- **Dockerfile Path**: `apps/web/Dockerfile`
- **Watch Paths**: `apps/web/**`, `packages/shared/**`

### 6.3 Deploy settings

- **Start Command**: `node apps/web/server.js`
- **Restart Policy**: On Failure

### 6.4 Networking

- **Port**: `3000`
- Generează **Public Domain**: `dosarfonduri.up.railway.app` (sau custom domain)

### 6.5 Variables

| Variabilă | Valoare | Notă |
|-----------|---------|------|
| `NEXT_PUBLIC_API_URL` | `https://api-dosarfonduri.up.railway.app` | URL-ul public al serviciului API |
| `PORT` | `3000` | |
| `NODE_ENV` | `production` | |

---

## Pas 7 — Migrare bază de date

După ce serviciul PostgreSQL e activ, rulează migrațiile. Două opțiuni:

### Opțiunea A: Din Railway CLI

```bash
# Instalează Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link-ul proiectului
railway link

# Rulează migrații (în contextul serviciului api)
railway run -s api -- npx drizzle-kit migrate

# Rulează seed (provider admin)
railway run -s api -- npx tsx src/db/seed.ts

# Rulează seed demo (Selenade Digital)
railway run -s api -- npx tsx src/db/seed-demo.ts
```

### Opțiunea B: Din Dockerfile (build step)

Adaugă în `apps/api/Dockerfile`, înainte de `CMD`:
```dockerfile
# Nu recomand — migrațiile ar rula la fiecare deploy
# Mai bine rulează manual prima dată cu railway run
```

**Recomandare:** Folosește Opțiunea A (Railway CLI) prima dată, apoi adaugă migrațiile în CI/CD dacă vrei.

---

## Pas 8 — Custom Domains (opțional)

1. **API**: Settings → Networking → Custom Domain → `api.dosarfonduri.ro`
   - Adaugă CNAME: `api.dosarfonduri.ro` → `api-dosarfonduri.up.railway.app`
2. **Web**: Settings → Networking → Custom Domain → `app.dosarfonduri.ro`
   - Adaugă CNAME: `app.dosarfonduri.ro` → `dosarfonduri.up.railway.app`

Railway generează automat certificat SSL (Let's Encrypt).

**Actualizează variabilele după custom domain:**
- În serviciul `api`: `FRONTEND_URL=https://app.dosarfonduri.ro`
- În serviciul `web`: `NEXT_PUBLIC_API_URL=https://api.dosarfonduri.ro`

---

## Pas 9 — Cloudflare R2 (Storage fișiere)

### 9.1 Creează bucket R2

1. Dashboard Cloudflare → R2 Object Storage → **Create bucket**
2. Nume: `dosarfonduri`
3. Location: EU (auto sau specific)

### 9.2 Creează API Token

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write**
3. Scope: Bucket `dosarfonduri`
4. Copiază: **Access Key ID** + **Secret Access Key**

### 9.3 Configurează în Railway

Adaugă în variabilele serviciului `api` + `worker`:
```
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_BUCKET=dosarfonduri
S3_ACCESS_KEY=access_key_id
S3_SECRET_KEY=secret_access_key
S3_REGION=auto
```

---

## Pas 10 — Verificare deploy

### Checklist post-deploy

```bash
# 1. Health check API
curl https://api-dosarfonduri.up.railway.app/health
# Răspuns: {"status":"ok","timestamp":"2026-03-09T..."}

# 2. Test login (după seed)
curl -X POST https://api-dosarfonduri.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"calin_pantis@yahoo.com","password":"Demo2026!Selenade"}'
# Răspuns: {"token":"...","user":{...}}

# 3. Test provider login
curl -X POST https://api-dosarfonduri.up.railway.app/api/provider/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dosarfonduri.ro","password":"ChangeMeNow!2026"}'

# 4. Frontend load
curl -I https://dosarfonduri.up.railway.app
# Răspuns: HTTP/2 200
```

---

## Generare secrete

Rulează local pentru a genera secretele JWT:

```bash
# JWT_SECRET (32 bytes = 64 hex chars)
openssl rand -hex 32
# Exemplu: a1b2c3d4e5f6...

# PROVIDER_JWT_SECRET (diferit!)
openssl rand -hex 32
```

**Nu refolosi același secret pentru ambele!**

---

## Costuri estimate Railway

| Serviciu | RAM | CPU | Cost estimat/lună |
|----------|-----|-----|-------------------|
| PostgreSQL | 1 GB | shared | ~$5-7 |
| Redis | 256 MB | shared | ~$3-5 |
| API (Hono) | 512 MB | shared | ~$5-7 |
| Worker | 512 MB | shared | ~$5-7 |
| Web (Next.js) | 512 MB | shared | ~$5-7 |
| **Total** | | | **~$23-33/lună** |

Railway oferă $5/lună credit gratuit pe Hobby plan. Pro plan ($20/lună) include mai multe resurse.

---

## Ordine deploy (important!)

1. **PostgreSQL** — creează primul (altele depind de DATABASE_URL)
2. **Redis** — creează al doilea (API + Worker depind de REDIS_URL)
3. **API** — deploy + verifică `/health`
4. **Migrații** — `railway run -s api -- npx drizzle-kit migrate`
5. **Seed** — `railway run -s api -- npx tsx src/db/seed.ts && npx tsx src/db/seed-demo.ts`
6. **Worker** — deploy (verifică logs că se conectează la Redis)
7. **Web** — deploy ultimul (depinde de API URL)
8. **Verificare** — rulează checklist-ul de mai sus

---

## Troubleshooting

| Problemă | Cauză | Soluție |
|----------|-------|---------|
| API nu pornește | `DATABASE_URL` lipsă | Verifică referința `${{Postgres.DATABASE_URL}}` |
| Worker crash loop | Redis nu e ready | Verifică `REDIS_URL` și că Redis e activ |
| CORS errors pe web | `FRONTEND_URL` greșit | Trebuie să fie exact URL-ul web (cu https://) |
| Login fail | DB fără seed | Rulează `railway run -s api -- npx tsx src/db/seed.ts` |
| Next.js 404 | `NEXT_PUBLIC_API_URL` greșit | Trebuie să fie URL-ul public al API (cu https://) |
| Migrații fail | Schema drift | `railway run -s api -- npx drizzle-kit push` (forțează) |
