/**
 * Tests for all 6 document extractors (FIX 7).
 *
 * Since extractors call Claude API, we mock the Anthropic SDK and test:
 * 1. Output field structure and field keys
 * 2. Null/confidence:0 handling for missing fields
 * 3. Array field indexing (parcele, articole, echipamente)
 * 4. Business logic: tractor >8y exclusion (registru), AFIR freshness (extras cont)
 * 5. Graceful JSON parse failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══ MOCK ANTHROPIC SDK ═══

let mockResponse = { content: [{ type: "text", text: "{}" }] };

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = {
        create: vi.fn().mockImplementation(() => Promise.resolve(mockResponse)),
      };
    },
  };
});

// ═══ IMPORTS (after mock) ═══

import { extractContract } from "../services/contractExtractor";
import { extractOferta } from "../services/ofertaExtractor";
import { extractRegistruImobilizari } from "../services/registruExtractor";
import { extractDocumentMediu } from "../services/mediuExtractor";
import { extractExtrasCont } from "../services/extrasContExtractor";
import { extractDeclaratie } from "../services/declaratieExtractor";
import type { ExtractionResult } from "../services/extractionTypes";

// ═══ HELPERS ═══

function setMockResponse(data: Record<string, any>) {
  mockResponse = { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function setMockResponseRaw(text: string) {
  mockResponse = { content: [{ type: "text", text }] };
}

function getField(result: ExtractionResult, key: string) {
  return result.extracted_fields.find(f => f.field_key === key);
}

function getFieldValue(result: ExtractionResult, key: string) {
  return getField(result, key)?.field_value;
}

function getFieldConfidence(result: ExtractionResult, key: string) {
  return getField(result, key)?.confidence;
}

// ═══ CONTRACT EXTRACTOR ═══

describe("contractExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts parcels with UAT, suprafață, durată", async () => {
    setMockResponse({
      nr_contract: "456/2024",
      data_contract: "2024-03-15",
      arendas_nume: "AGRO TEST SRL",
      arendas_cui: "12345678",
      parcele: [
        { UAT: "Timișoara", suprafata_ha: 25.5, durata_contract: "5 ani", data_start: "2024-01-01", data_sfarsit: "2029-01-01", arendator_nume: "Ion Popescu", arendator_cui: "9876543" },
        { UAT: "Giroc", suprafata_ha: 10.0, durata_contract: "5 ani", data_start: "2024-01-01", data_sfarsit: "2029-01-01", arendator_nume: "Maria Ionescu", arendator_cui: null },
      ],
    });

    const result = await extractContract("mock pdf text");

    expect(result.document_type).toBe("contract_arenda");
    expect(getFieldValue(result, "nr_contract")).toBe("456/2024");
    expect(getFieldValue(result, "arendas_nume")).toBe("AGRO TEST SRL");
    expect(getFieldValue(result, "parcela_0_UAT")).toBe("Timișoara");
    expect(getFieldValue(result, "parcela_0_suprafata_ha")).toBe(25.5);
    expect(getFieldValue(result, "parcela_1_UAT")).toBe("Giroc");
    expect(getFieldValue(result, "parcela_1_suprafata_ha")).toBe(10.0);
    // Aggregate surface
    expect(getFieldValue(result, "suprafata_contracte")).toBe(35.5);
    expect(getFieldValue(result, "numar_parcele")).toBe(2);
    // Null field gets confidence 0
    expect(getFieldValue(result, "parcela_1_arendator_cui")).toBeNull();
    expect(getFieldConfidence(result, "parcela_1_arendator_cui")).toBe(0);
  });

  it("returns null with confidence 0 when fields missing", async () => {
    setMockResponse({ parcele: [] });

    const result = await extractContract("mock text");

    expect(getFieldValue(result, "nr_contract")).toBeNull();
    expect(getFieldConfidence(result, "nr_contract")).toBe(0);
    expect(getFieldValue(result, "arendas_nume")).toBeNull();
    expect(getFieldConfidence(result, "arendas_nume")).toBe(0);
  });

  it("handles JSON parse failure gracefully", async () => {
    setMockResponseRaw("not valid json {{{");

    const result = await extractContract("mock text");

    expect(result.document_type).toBe("contract_arenda");
    expect(result.extracted_fields).toHaveLength(0);
    expect(result.processing_time_ms).toBeGreaterThanOrEqual(0);
  });
});

// ═══ OFERTA EXTRACTOR ═══

describe("ofertaExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts supplier + articles with no-till detection", async () => {
    setMockResponse({
      furnizor_nume: "AGRAMAT SRL",
      furnizor_cui: "RO11223344",
      total_oferta_eur: 185000,
      data_oferta: "2024-06-15",
      nr_oferta: "OF-789/2024",
      valabilitate_oferta: "30 zile",
      articole: [
        { utilaj_denumire: "Semănătoare directă Sola Ares 6m", specificatii_tehnice: "6m lățime, no-till, GPS ready", pret_unitar_eur: 85000, cantitate: 1, pret_total_eur: 85000, este_no_till: true },
        { utilaj_denumire: "Tractor Fendt 724", specificatii_tehnice: "240 CP, 4WD", pret_unitar_eur: 100000, cantitate: 1, pret_total_eur: 100000, este_no_till: false },
      ],
    });

    const result = await extractOferta("mock pdf text");

    expect(result.document_type).toBe("oferta_pret");
    expect(getFieldValue(result, "furnizor_nume")).toBe("AGRAMAT SRL");
    expect(getFieldValue(result, "total_oferta_eur")).toBe(185000);
    expect(getFieldValue(result, "articol_0_utilaj_denumire")).toBe("Semănătoare directă Sola Ares 6m");
    expect(getFieldValue(result, "articol_0_este_no_till")).toBe(true);
    expect(getFieldValue(result, "articol_1_este_no_till")).toBe(false);
    expect(getFieldValue(result, "articol_1_pret_total_eur")).toBe(100000);
    // All extraction methods should be ai_sonnet
    expect(getField(result, "furnizor_nume")?.extraction_method).toBe("ai_sonnet");
  });

  it("returns null with confidence 0 for missing fields", async () => {
    setMockResponse({ articole: [] });

    const result = await extractOferta("mock text");

    expect(getFieldValue(result, "furnizor_nume")).toBeNull();
    expect(getFieldConfidence(result, "furnizor_nume")).toBe(0);
    expect(getFieldValue(result, "total_oferta_eur")).toBeNull();
    expect(getFieldConfidence(result, "total_oferta_eur")).toBe(0);
  });
});

// ═══ REGISTRU IMOBILIZĂRI EXTRACTOR ═══

describe("registruExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts equipment and calculates tractor >8y exclusion", async () => {
    const currentYear = new Date().getFullYear();
    setMockResponse({
      echipamente: [
        { denumire: "Tractor New Holland T7.210", an_achizitie: currentYear - 3, valoare_inventar: 450000, putere_cp: 210, stare: "functional", categorie: "tractor" },
        { denumire: "Tractor U650", an_achizitie: currentYear - 12, valoare_inventar: 50000, putere_cp: 65, stare: "functional", categorie: "tractor" },
        { denumire: "Semănătoare Gaspardo", an_achizitie: currentYear - 5, valoare_inventar: 120000, putere_cp: null, stare: "functional", categorie: "utilaj_agricol" },
      ],
      total_valoare_inventar: 620000,
      total_amortizare: 250000,
      data_registru: "2024-12-31",
    });

    const result = await extractRegistruImobilizari("mock pdf text");

    expect(result.document_type).toBe("registru_imobilizari");

    // First tractor (3 years old) — NOT excluded
    expect(getFieldValue(result, "echipament_0_denumire")).toBe("Tractor New Holland T7.210");
    expect(getFieldValue(result, "echipament_0_exclus_anexa3")).toBe(false);
    expect(getFieldValue(result, "echipament_0_vechime_ani")).toBe(3);

    // Second tractor (12 years old) — EXCLUDED
    expect(getFieldValue(result, "echipament_1_exclus_anexa3")).toBe(true);
    expect(getFieldValue(result, "echipament_1_vechime_ani")).toBe(12);

    // Semănătoare — no exclusion field (not a tractor)
    expect(getField(result, "echipament_2_exclus_anexa3")).toBeUndefined();

    // Aggregate power
    expect(getFieldValue(result, "putere_tractoare_existente")).toBe(210); // only eligible
    expect(getFieldValue(result, "putere_tractoare_excluse_8ani")).toBe(65); // only excluded
    expect(getFieldValue(result, "tractoare_excluse_lista")).toEqual(["Tractor U650"]);

    // Uses Sonnet
    expect(getField(result, "echipament_0_denumire")?.extraction_method).toBe("ai_sonnet");
  });

  it("handles null fields with confidence 0", async () => {
    setMockResponse({
      echipamente: [
        { denumire: null, an_achizitie: null, valoare_inventar: null, putere_cp: null, stare: null, categorie: null },
      ],
      total_valoare_inventar: null,
    });

    const result = await extractRegistruImobilizari("mock text");

    expect(getFieldValue(result, "echipament_0_denumire")).toBeNull();
    expect(getFieldConfidence(result, "echipament_0_denumire")).toBe(0);
    expect(getFieldValue(result, "total_valoare_inventar")).toBeNull();
    expect(getFieldConfidence(result, "total_valoare_inventar")).toBe(0);
  });
});

// ═══ MEDIU EXTRACTOR ═══

describe("mediuExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts environmental document data", async () => {
    setMockResponse({
      tip_document: "clasare",
      numar_document: "1234/2024",
      data_emitere: "2024-05-15",
      emitent: "APM Timiș",
      titular_nume: "AGRO VEST SRL",
      titular_cui: "44556677",
      proiect_denumire: "Modernizare fermă vegetală",
      locatie: "Sat Moșnița Nouă, Comuna Moșnița, Județul Timiș",
    });

    const result = await extractDocumentMediu("mock pdf text");

    expect(result.document_type).toBe("document_mediu");
    expect(getFieldValue(result, "tip_document_mediu")).toBe("clasare");
    expect(getFieldValue(result, "numar_document_mediu")).toBe("1234/2024");
    expect(getFieldValue(result, "emitent_mediu")).toBe("APM Timiș");
    expect(getFieldValue(result, "locatie_mediu")).toContain("Timiș");
    // Uses Haiku
    expect(getField(result, "tip_document_mediu")?.extraction_method).toBe("ai_haiku");
  });

  it("returns null with confidence 0 for all missing fields", async () => {
    setMockResponse({});

    const result = await extractDocumentMediu("mock text");

    expect(getFieldValue(result, "tip_document_mediu")).toBeNull();
    expect(getFieldConfidence(result, "tip_document_mediu")).toBe(0);
    expect(getFieldValue(result, "numar_document_mediu")).toBeNull();
    expect(getFieldConfidence(result, "numar_document_mediu")).toBe(0);
    // All 8 fields should be present (with null values)
    const nonRawFields = result.extracted_fields.filter(f => !f.field_key.startsWith("_"));
    expect(nonRawFields.length).toBe(8);
  });
});

// ═══ EXTRAS CONT EXTRACTOR ═══

describe("extrasContExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts bank statement data and checks AFIR freshness", async () => {
    // Use yesterday's date — should be fresh (1 business day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isoDate = yesterday.toISOString().split("T")[0];

    setMockResponse({
      banca: "Banca Transilvania",
      sold_disponibil: 250000.50,
      data_extras: isoDate,
      moneda: "RON",
      iban: "RO12BTRL0000001234567890",
      titular_cont: "AGRO TEST SRL",
      titular_cui: "12345678",
    });

    const result = await extractExtrasCont("mock pdf text");

    expect(result.document_type).toBe("extras_cont");
    expect(getFieldValue(result, "banca")).toBe("Banca Transilvania");
    expect(getFieldValue(result, "sold_disponibil")).toBe(250000.50);
    expect(getFieldValue(result, "iban")).toBe("RO12BTRL0000001234567890");
    // Freshness: yesterday should be valid (≤5 business days)
    expect(getFieldValue(result, "extras_afir_valid")).toBe(true);
    const zileLucratoare = getFieldValue(result, "extras_zile_lucratoare_vechime");
    expect(zileLucratoare).toBeGreaterThanOrEqual(0);
    expect(zileLucratoare).toBeLessThanOrEqual(2); // yesterday = 0 or 1 business day
    // Uses Haiku
    expect(getField(result, "banca")?.extraction_method).toBe("ai_haiku");
  });

  it("flags stale statement (>5 business days)", async () => {
    // Use a date 15 days ago — definitely stale
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 15);
    const isoDate = staleDate.toISOString().split("T")[0];

    setMockResponse({
      banca: "BRD",
      sold_disponibil: 100000,
      data_extras: isoDate,
      moneda: "RON",
    });

    const result = await extractExtrasCont("mock pdf text");

    expect(getFieldValue(result, "extras_afir_valid")).toBe(false);
    const zileLucratoare = getFieldValue(result, "extras_zile_lucratoare_vechime");
    expect(zileLucratoare).toBeGreaterThan(5);
    // Should have a warning field
    const warning = getFieldValue(result, "extras_avertisment");
    expect(warning).toContain("zile lucrătoare");
  });

  it("returns null with confidence 0 for missing fields", async () => {
    setMockResponse({});

    const result = await extractExtrasCont("mock text");

    expect(getFieldValue(result, "banca")).toBeNull();
    expect(getFieldConfidence(result, "banca")).toBe(0);
    expect(getFieldValue(result, "sold_disponibil")).toBeNull();
    expect(getFieldConfidence(result, "sold_disponibil")).toBe(0);
    // No freshness fields since data_extras is null
    expect(getField(result, "extras_afir_valid")).toBeUndefined();
  });
});

// ═══ DECLARAȚIE EXPERT CONTABIL EXTRACTOR ═══

describe("declaratieExtractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts agri-food activity history for CS3 scoring", async () => {
    setMockResponse({
      ani_activitate_agroalimentara: 7,
      coduri_caen_activitate: ["0111", "0112", "1061"],
      cifra_afaceri_agroalimentara: 2500000,
      cifra_afaceri_totala: 3000000,
      ponderea_venituri_agro_in_total: 83.3,
      expert_nume: "Ion Popescu",
      expert_nr_autorizatie: "EC-12345",
      data_declaratie: "2024-06-01",
      firma_nume: "AGRO VEST SRL",
      firma_cui: "12345678",
      ani_detaliati: [
        { an: 2023, cifra_afaceri_agro: 850000, cifra_afaceri_total: 1000000, pondere: 85.0 },
        { an: 2022, cifra_afaceri_agro: 800000, cifra_afaceri_total: 950000, pondere: 84.2 },
      ],
    });

    const result = await extractDeclaratie("mock pdf text");

    expect(result.document_type).toBe("declaratie_expert_contabil");
    expect(getFieldValue(result, "ani_activitate_agroalimentara")).toBe(7);
    expect(getFieldValue(result, "coduri_caen_activitate")).toEqual(["0111", "0112", "1061"]);
    expect(getFieldValue(result, "cifra_afaceri_agroalimentara")).toBe(2500000);
    expect(getFieldValue(result, "cifra_afaceri_totala")).toBe(3000000);
    expect(getFieldValue(result, "ponderea_venituri_agro_in_total")).toBe(83.3);
    expect(getFieldValue(result, "expert_contabil_nume")).toBe("Ion Popescu");
    expect(getFieldValue(result, "expert_contabil_autorizatie")).toBe("EC-12345");
    expect(getFieldValue(result, "firma_nume")).toBe("AGRO VEST SRL");
    expect(getFieldValue(result, "firma_cui")).toBe("12345678");
    // Raw detailed years
    expect(getFieldValue(result, "_raw_ani_detaliati")).toHaveLength(2);
    // Uses Sonnet (complex interpretation document)
    expect(getField(result, "ani_activitate_agroalimentara")?.extraction_method).toBe("ai_sonnet");
  });

  it("returns null with confidence 0 for missing fields", async () => {
    setMockResponse({});

    const result = await extractDeclaratie("mock text");

    expect(getFieldValue(result, "ani_activitate_agroalimentara")).toBeNull();
    expect(getFieldConfidence(result, "ani_activitate_agroalimentara")).toBe(0);
    expect(getFieldValue(result, "coduri_caen_activitate")).toBeNull();
    expect(getFieldConfidence(result, "coduri_caen_activitate")).toBe(0);
    expect(getFieldValue(result, "expert_contabil_nume")).toBeNull();
    expect(getFieldConfidence(result, "expert_contabil_nume")).toBe(0);
  });

  it("handles JSON parse failure gracefully", async () => {
    setMockResponseRaw("```json\n{invalid json\n```");

    const result = await extractDeclaratie("mock text");

    expect(result.document_type).toBe("declaratie_expert_contabil");
    expect(result.extracted_fields).toHaveLength(0);
  });
});
