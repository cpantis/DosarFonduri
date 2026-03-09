/**
 * Seed DEMO — creează cabinetul Selenade Digital + admin + companie fictivă.
 *
 * Usage:
 *   npx tsx src/db/seed-demo.ts
 *
 * Requires DATABASE_URL in .env or environment.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import * as schema from "./schema";

// ─── CONFIG ──────────────────────────────────────────────
const ADMIN_EMAIL = "calin_pantis@yahoo.com";
const ADMIN_PASSWORD = "Demo2026!Selenade";
const ADMIN_NAME = "Călin Pantiș";

const ORG_NAME = "Selenade Digital";
const ORG_CODE = "SELENADE";

async function seedDemo() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding demo cabinet...\n");

  // ─── 1. ORGANIZAȚIE (Cabinet de consultanță) ──────────
  let org = await db.query.organizations.findFirst({
    where: (o, { eq }) => eq(o.code, ORG_CODE),
  });

  if (org) {
    console.log(`⏭  Organizația "${ORG_NAME}" există deja (id: ${org.id})`);
  } else {
    const [created] = await db.insert(schema.organizations).values({
      name: ORG_NAME,
      code: ORG_CODE,
      plan: "professional",
      maxUsers: 5,
      status: "active",
      providerNotes: "Cabinet demo — Selenade Digital S.R.L.",
    }).returning();
    org = created;
    console.log(`✅ Organizație creată: ${org.name} (id: ${org.id})`);
  }

  // ─── 2. USER ADMIN ────────────────────────────────────
  let user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, ADMIN_EMAIL),
  });

  if (user) {
    console.log(`⏭  Userul "${ADMIN_EMAIL}" există deja (id: ${user.id})`);
  } else {
    const passwordHash = await hash(ADMIN_PASSWORD, 12);
    const [created] = await db.insert(schema.users).values({
      organizationId: org.id,
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: "admin",
      status: "active",
    }).returning();
    user = created;
    console.log(`✅ Admin creat: ${user.email} (id: ${user.id})`);
    console.log(`   🔑 Parolă: ${ADMIN_PASSWORD}`);
  }

  // ─── 3. ORG CONFIG (defaults) ──────────────────────────
  const existingConfig = await db.query.orgConfig.findFirst({
    where: (c, { eq }) => eq(c.organizationId, org.id),
  });

  if (!existingConfig) {
    await db.insert(schema.orgConfig).values({
      organizationId: org.id,
    });
    console.log(`✅ Config organizație creată cu valori default`);
  }

  // ─── 4. COMPANIE DEMO (date fictive complete) ──────────
  const DEMO_CUI = "12345678";

  let company = await db.query.companies.findFirst({
    where: (c, { and, eq }) => and(
      eq(c.cui, DEMO_CUI),
      eq(c.organizationId, org.id),
    ),
  });

  if (company) {
    console.log(`⏭  Compania demo (CUI: ${DEMO_CUI}) există deja`);
  } else {
    const [created] = await db.insert(schema.companies).values({
      organizationId: org.id,
      formaJuridica: "SRL",
      denumire: "INNOVATION TECH SOLUTIONS SRL",
      cui: DEMO_CUI,
      regCom: "J40/1234/2018",
      euid: "ROONRC.J40/1234/2018",
      adresa: "Str. Victoriei Nr. 45, Et. 3, Ap. 12, Sector 1, București",
      localitate: "București",
      judet: "București",
      codPostal: "010061",
      telefon: "0212345678",
      email: "office@innovationtech.ro",
      website: "www.innovationtech.ro",
      caen: "6201",
      stare: "functiune",
      durata: "nelimitata",
      anInfiintare: 2018,
      capitalSocial: "50000.00",
      moneda: "RON",
      partiSociale: 500,
      valoareParte: "100.00",
      onrcRawData: {
        // ─── Date simulate API termene.ro (structura completă) ───
        firma: {
          cui: 12345678,
          nume_mfinante: "INNOVATION TECH SOLUTIONS SRL",
          nume_recom: "INNOVATION TECH SOLUTIONS S.R.L.",
          reg_com: "J40/1234/2018",
          este_cod_tva_intracomunitar: true,
        },

        caen: {
          principal_recom: {
            cod: "6201",
            label: "Activități de realizare a soft-ului la comandă (software orientat client)",
            versiune: "Rev.2",
          },
          principal_mfinante: {
            cod: "6201",
            label: "Activități de realizare a soft-ului la comandă",
          },
        },

        statut_tva: {
          curent: {
            cod: "I",
            label: "Înregistrat în scopuri de TVA",
            data_inceput_tva: "2018-06-01",
            data_anulare_tva: null,
            data_interogare: "2026-03-09",
            data_operarii_anularii_tva: null,
          },
          istoric: [
            {
              data_interogare: "2025-01-15",
              cod: "I",
              label: "Înregistrat în scopuri de TVA",
              data_inceput_tva: "2018-06-01",
              data_anulare_tva: null,
              data_operarii_anularii_tva: null,
            },
          ],
        },

        date_contact: {
          telefon: "0212345678",
          email: "office@innovationtech.ro",
        },

        adresa: {
          anaf: {
            tara: "România",
            judet: "București",
            localitate: "Sectorul 1",
            strada: "Victoriei",
            numar: "45",
            bloc: null,
            scara: null,
            etaj: "3",
            apartament: "12",
            cod_postal: "010061",
            tip_strada: "Str.",
            sector: "1",
            sub_localitate: null,
            neprelucrata: "Str. Victoriei Nr. 45 Et. 3 Ap. 12 Sector 1 București",
            formatat: "Str. Victoriei Nr. 45, Et. 3, Ap. 12, Sector 1, București, 010061",
          },
          sediu_social: {
            tara: "România",
            judet: "București",
            localitate: "Sectorul 1",
            strada: "Victoriei",
            numar: "45",
            cod_postal: "010061",
            sub_localitate: null,
            sursa_adresa: "RECOM",
            tip_strada: "Str.",
            sector: "1",
            bloc: null,
            scara: null,
            etaj: "3",
            apartament: "12",
            expirare: {
              sediu_expirat: false,
              data_expirare: null,
              data_actualizare: "2024-11-15",
            },
            cod_siruta: "179141",
            neprelucrata: "Str. Victoriei Nr. 45 Et. 3 Ap. 12 Sector 1",
            recom_neprelucrata: "BUCUREȘTI, str.VICTORIEI, nr.45, et.3, ap.12",
            mf_neprelucrata: "MUNICIPIUL BUCUREȘTI, SECTOR 1, STR VICTORIEI NR 45 ET 3 AP 12",
            formatat: "Str. Victoriei Nr. 45, Et. 3, Ap. 12, Sector 1, București, 010061",
          },
        },

        forma_juridica: {
          curenta: {
            organizare: "SRL",
            denumire: "Societate cu răspundere limitată",
            data_actualizare: "2018-03-15",
          },
          istoric: [
            {
              organizare: "SRL",
              denumire: "Societate cu răspundere limitată",
              data_actualizare: "2018-03-15",
            },
          ],
        },
      },
      createdBy: user.id,
    }).returning();
    company = created;
    console.log(`✅ Companie demo creată: ${company.denumire} (CUI: ${company.cui})`);

    // ─── Asociați ───
    await db.insert(schema.companyAssociates).values([
      {
        companyId: company.id,
        type: "pf",
        name: "Andrei Popescu",
        role: "Asociat unic",
        citizenshipOrCountry: "România",
        contribution: "50000.00",
        shares: 500,
        pctBenefits: "100.00",
        pctLosses: "100.00",
        tipAsociat: "persoana_fizica",
      },
    ]);
    console.log(`   ✅ Asociat adăugat: Andrei Popescu (asociat unic)`);

    // ─── Administratori ───
    await db.insert(schema.companyAdministrators).values([
      {
        companyId: company.id,
        name: "Andrei Popescu",
        role: "Administrator",
        powers: "depline",
        mandateDuration: "nelimitată",
        appointmentDate: "2018-03-15",
      },
    ]);
    console.log(`   ✅ Administrator adăugat: Andrei Popescu`);

    // ─── Date financiare (2023 + 2024) ───
    await db.insert(schema.companyFinancials).values([
      {
        companyId: company.id,
        year: 2023,
        source: "onrc",
        f10: {
          cifra_afaceri_neta: 2_850_000,
          venituri_totale: 3_120_000,
          cheltuieli_totale: 2_680_000,
          profit_brut: 440_000,
          profit_net: 374_000,
          impozit_profit: 66_000,
        },
        f20: {
          active_imobilizate: 1_200_000,
          active_circulante: 980_000,
          stocuri: 120_000,
          creante: 450_000,
          disponibilitati: 410_000,
          capitaluri_proprii: 1_850_000,
          datorii_totale: 330_000,
          datorii_termen_scurt: 280_000,
          datorii_termen_lung: 50_000,
        },
        f30: {
          numar_mediu_salariati: 32,
        },
        processedAt: new Date("2024-04-15"),
      },
      {
        companyId: company.id,
        year: 2024,
        source: "onrc",
        f10: {
          cifra_afaceri_neta: 3_450_000,
          venituri_totale: 3_780_000,
          cheltuieli_totale: 3_180_000,
          profit_brut: 600_000,
          profit_net: 510_000,
          impozit_profit: 90_000,
        },
        f20: {
          active_imobilizate: 1_500_000,
          active_circulante: 1_350_000,
          stocuri: 150_000,
          creante: 580_000,
          disponibilitati: 620_000,
          capitaluri_proprii: 2_360_000,
          datorii_totale: 490_000,
          datorii_termen_scurt: 390_000,
          datorii_termen_lung: 100_000,
        },
        f30: {
          numar_mediu_salariati: 45,
        },
        processedAt: new Date("2025-04-10"),
      },
    ]);
    console.log(`   ✅ Date financiare adăugate: 2023, 2024`);
  }

  // ─── DONE ──────────────────────────────────────────────
  await client.end();
  console.log("\n🌱 Seed demo complet!");
  console.log("\n📋 REZUMAT:");
  console.log(`   Cabinet:  ${ORG_NAME} (plan: professional, max 5 users)`);
  console.log(`   Admin:    ${ADMIN_EMAIL}`);
  console.log(`   Parolă:   ${ADMIN_PASSWORD}`);
  console.log(`   Companie: INNOVATION TECH SOLUTIONS SRL (CUI: ${DEMO_CUI})`);
  console.log(`\n   Logare: POST /api/auth/login { email: "${ADMIN_EMAIL}", password: "${ADMIN_PASSWORD}" }`);
}

seedDemo().catch((err) => {
  console.error("❌ Seed demo failed:", err);
  process.exit(1);
});
