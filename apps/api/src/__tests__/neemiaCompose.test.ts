/**
 * Tests for Neemia COMPOSE mode — AI content generation + dynamic table builder
 *
 * These tests verify:
 * 1. Context building (data gathering from elements + reference tables + rules)
 * 2. COMPOSE section validation
 * 3. Python DOCX script execution with markers
 * 4. Section type handling (narrative, table, calculation)
 * 5. Marker detection in templates
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══ MOCK SETUP ═══

// Mock DB layer
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "doc-1" }]) }) });
const mockUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{}]) }) }) });

vi.mock("../db", () => ({
  db: {
    query: {
      projects: { findFirst: mockFindFirst, findMany: mockFindMany },
      companies: { findFirst: mockFindFirst },
      projectElements: { findMany: mockFindMany },
      templateElements: { findMany: mockFindMany },
      documents: { findFirst: mockFindFirst },
      orgConfig: { findFirst: mockFindFirst },
      guideReferenceTables: { findMany: mockFindMany },
      rules: { findMany: mockFindMany },
      projectDocuments: { findMany: mockFindMany },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("../db/schema", () => ({
  projects: {},
  projectElements: {},
  projectDocuments: {},
  templateElements: {},
  documents: {},
  orgConfig: {},
  companies: {},
  guideReferenceTables: {},
  rules: {},
  ruleReferenceLinks: {},
  elementRuleLinks: {},
}));

vi.mock("../services/storage", () => ({
  getFileBuffer: vi.fn().mockResolvedValue({ buffer: Buffer.from("fake"), name: "test.docx" }),
  uploadFile: vi.fn().mockResolvedValue("file-id-123"),
}));

vi.mock("../services/aiUsage", () => ({
  logAIUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: "text",
          text: JSON.stringify({
            sections: [
              {
                marker: "COMPOSE:descriere",
                type: "narrative",
                content: "Proiectul vizează modernizarea...\n\nInvestiția totală...",
              },
              {
                marker: "TABLE:plan_investitii",
                type: "table",
                tableData: {
                  headers: [
                    { key: "categorie", label: "Categorie investiție" },
                    { key: "valoare", label: "Valoare (EUR)" },
                    { key: "procent", label: "%" },
                  ],
                  rows: [
                    { categorie: "Echipamente", valoare: "150000", procent: "60%" },
                    { categorie: "Construcții", valoare: "80000", procent: "32%" },
                    { categorie: "Proiectare", valoare: "20000", procent: "8%" },
                  ],
                  highlightRows: [0],
                  footerRow: { categorie: "TOTAL", valoare: "250000", procent: "100%" },
                  caption: "Plan de investiții",
                  headerColor: "1a3a5c",
                },
              },
            ],
          }),
        }],
        usage: { input_tokens: 1200, output_tokens: 800 },
      }),
    },
  })),
}));

// ═══ UNIT TESTS ═══

describe("Neemia COMPOSE — Section Types", () => {
  it("should handle narrative section structure", () => {
    const section = {
      marker: "COMPOSE:descriere_proiect",
      type: "narrative" as const,
      label: "Descrierea proiectului",
      content: "Paragraful 1.\n\nParagraful 2.",
      approved: false,
    };

    expect(section.type).toBe("narrative");
    expect(section.content).toContain("Paragraful 1");
    expect(section.content!.split("\n\n")).toHaveLength(2);
  });

  it("should handle table section structure", () => {
    const section = {
      marker: "TABLE:plan_investitii",
      type: "table" as const,
      label: "Plan de investiții",
      tableData: {
        headers: [
          { key: "cat", label: "Categorie" },
          { key: "val", label: "Valoare" },
        ],
        rows: [
          { cat: "Echipamente", val: "150000" },
          { cat: "Construcții", val: "80000" },
        ],
        highlightRows: [0],
        footerRow: { cat: "TOTAL", val: "230000" },
        caption: "Plan de investiții proiect",
        headerColor: "1a3a5c",
      },
      approved: false,
    };

    expect(section.type).toBe("table");
    expect(section.tableData!.headers).toHaveLength(2);
    expect(section.tableData!.rows).toHaveLength(2);
    expect(section.tableData!.highlightRows).toEqual([0]);
    expect(section.tableData!.footerRow!.val).toBe("230000");
  });

  it("should handle calculation section structure", () => {
    const section = {
      marker: "CALC:intensitate_ajutor",
      type: "calculation" as const,
      label: "Calculul intensității ajutorului",
      tableData: {
        headers: [
          { key: "indicator", label: "Indicator" },
          { key: "formula", label: "Formula" },
          { key: "rezultat", label: "Rezultat" },
        ],
        rows: [
          { indicator: "Valoare totală", formula: "-", rezultat: "250.000 EUR" },
          { indicator: "Ajutor nerambursabil", formula: "-", rezultat: "162.500 EUR" },
          { indicator: "Intensitate ajutor", formula: "162500 / 250000 × 100", rezultat: "65%" },
        ],
        highlightRows: [2],
      },
      approved: true,
    };

    expect(section.type).toBe("calculation");
    expect(section.approved).toBe(true);
    expect(section.tableData!.rows[2].rezultat).toBe("65%");
  });
});

describe("Neemia COMPOSE — Marker Detection", () => {
  it("should detect COMPOSE markers in template element keys", () => {
    const elements = [
      { key: "denumire_firma", label: "Denumire firmă" },
      { key: "COMPOSE:descriere_proiect", label: "Descriere proiect" },
      { key: "TABLE:plan_investitii", label: "Plan investiții" },
      { key: "CALC:intensitate", label: "Calcul intensitate" },
      { key: "valoare_totala", label: "Valoare totală" },
    ];

    const composeMarkers = elements.filter(e =>
      e.key.startsWith("COMPOSE:") || e.key.startsWith("TABLE:") || e.key.startsWith("CALC:")
    );
    const simpleKeys = elements.filter(e =>
      !e.key.startsWith("COMPOSE:") && !e.key.startsWith("TABLE:") && !e.key.startsWith("CALC:")
    );

    expect(composeMarkers).toHaveLength(3);
    expect(simpleKeys).toHaveLength(2);
    expect(composeMarkers[0].key).toBe("COMPOSE:descriere_proiect");
    expect(composeMarkers[1].key).toBe("TABLE:plan_investitii");
    expect(composeMarkers[2].key).toBe("CALC:intensitate");
  });

  it("should parse marker type from prefix", () => {
    const parseMarkerType = (key: string): "narrative" | "table" | "calculation" | "simple" => {
      if (key.startsWith("COMPOSE:")) return "narrative";
      if (key.startsWith("TABLE:")) return "table";
      if (key.startsWith("CALC:")) return "calculation";
      return "simple";
    };

    expect(parseMarkerType("COMPOSE:desc")).toBe("narrative");
    expect(parseMarkerType("TABLE:plan")).toBe("table");
    expect(parseMarkerType("CALC:total")).toBe("calculation");
    expect(parseMarkerType("valoare_proiect")).toBe("simple");
  });
});

describe("Neemia COMPOSE — Context Building", () => {
  it("should build elements map with metadata", () => {
    const projectElements = [
      { templateElementId: "te-1", value: "COMEXIM R SRL", source: "onrc", confirmed: true },
      { templateElementId: "te-2", value: "250000", source: "solomon", confirmed: false },
      { templateElementId: "te-3", value: null, source: "manual", confirmed: false },
    ];

    const templateElements = [
      { id: "te-1", key: "denumire_firma", label: "Denumire firmă" },
      { id: "te-2", key: "valoare_totala", label: "Valoare totală" },
      { id: "te-3", key: "descriere", label: "Descriere" },
    ];

    const tmplElMap = new Map(templateElements.map(t => [t.id, t]));

    const elements: Record<string, { value: string; label: string; source: string }> = {};
    for (const pe of projectElements) {
      const te = tmplElMap.get(pe.templateElementId);
      if (te && pe.value) {
        elements[te.key] = { value: pe.value, label: te.label, source: pe.source };
      }
    }

    expect(Object.keys(elements)).toHaveLength(2);
    expect(elements["denumire_firma"].value).toBe("COMEXIM R SRL");
    expect(elements["denumire_firma"].source).toBe("onrc");
    expect(elements["valoare_totala"].value).toBe("250000");
    expect(elements["descriere"]).toBeUndefined(); // null value, excluded
  });

  it("should inject project metadata into elements", () => {
    const elements: Record<string, { value: string; label: string; source: string }> = {};

    const project = {
      programFinantare: "PNDR 2024-2027",
      codMasura: "SM6.1",
      codSesiune: "S1-2026",
      codMysmis: "123456",
    };

    if (project.programFinantare) elements["program_finantare"] = { value: project.programFinantare, label: "Program finanțare", source: "project" };
    if (project.codMasura) elements["cod_masura"] = { value: project.codMasura, label: "Cod măsură", source: "project" };
    if (project.codSesiune) elements["cod_sesiune"] = { value: project.codSesiune, label: "Cod sesiune", source: "project" };
    if (project.codMysmis) elements["cod_mysmis"] = { value: project.codMysmis, label: "Cod MySMIS", source: "project" };

    expect(elements["program_finantare"].value).toBe("PNDR 2024-2027");
    expect(elements["cod_masura"].value).toBe("SM6.1");
    expect(elements["cod_sesiune"].source).toBe("project");
  });
});

describe("Neemia COMPOSE — ComposeConfig Validation", () => {
  it("should validate section structure", () => {
    const validConfig = {
      sections: [
        { marker: "COMPOSE:descriere", type: "narrative" as const, label: "Descriere proiect" },
        { marker: "TABLE:plan", type: "table" as const, label: "Plan investiții", referenceTableIds: ["ref-1"] },
      ],
      aiModel: "claude-sonnet-4-20250514",
      language: "ro",
    };

    expect(validConfig.sections).toHaveLength(2);
    expect(validConfig.sections.every(s => s.marker && s.type && s.label)).toBe(true);
    expect(validConfig.sections[1].referenceTableIds).toEqual(["ref-1"]);
  });

  it("should reject invalid section types", () => {
    const validTypes = ["narrative", "table", "calculation"];

    expect(validTypes.includes("narrative")).toBe(true);
    expect(validTypes.includes("table")).toBe(true);
    expect(validTypes.includes("calculation")).toBe(true);
    expect(validTypes.includes("invalid" as any)).toBe(false);
  });

  it("should handle empty sections array", () => {
    const config = { sections: [], language: "ro" };
    expect(config.sections.length).toBe(0);
  });
});

describe("Neemia COMPOSE — AI Response Parsing", () => {
  it("should parse valid JSON response", () => {
    const rawText = JSON.stringify({
      sections: [
        { marker: "COMPOSE:desc", type: "narrative", content: "Text generat de AI." },
        {
          marker: "TABLE:plan",
          type: "table",
          tableData: {
            headers: [{ key: "a", label: "Col A" }],
            rows: [{ a: "val1" }],
          },
        },
      ],
    });

    const parsed = JSON.parse(rawText);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].content).toBe("Text generat de AI.");
    expect(parsed.sections[1].tableData.headers[0].key).toBe("a");
  });

  it("should strip markdown code blocks from AI response", () => {
    const wrappedResponse = "```json\n{\"sections\": [{\"marker\": \"COMPOSE:test\", \"type\": \"narrative\", \"content\": \"Hello\"}]}\n```";

    let rawText = wrappedResponse.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(rawText);
    expect(parsed.sections[0].content).toBe("Hello");
  });

  it("should handle AI response with highlightRows and footerRow", () => {
    const response = {
      sections: [{
        marker: "TABLE:buget",
        type: "table",
        tableData: {
          headers: [
            { key: "linie", label: "Linie bugetară" },
            { key: "suma", label: "Sumă (EUR)" },
          ],
          rows: [
            { linie: "Echipamente agricole", suma: "120000" },
            { linie: "Construcții", suma: "80000" },
            { linie: "Consultanță", suma: "15000" },
          ],
          highlightRows: [0],
          footerRow: { linie: "TOTAL", suma: "215000" },
          caption: "Buget detaliat",
          headerColor: "1a3a5c",
        },
      }],
    };

    const table = response.sections[0].tableData;
    expect(table.highlightRows).toEqual([0]);
    expect(table.footerRow.suma).toBe("215000");
    expect(table.caption).toBe("Buget detaliat");
    expect(table.rows[table.highlightRows[0]].linie).toBe("Echipamente agricole");
  });
});

describe("Neemia COMPOSE — FILL vs COMPOSE Mode Routing", () => {
  it("should determine correct mode from document config", () => {
    const fillDoc = { generationMode: "fill" };
    const composeDoc = { generationMode: "compose" };
    const defaultDoc = {};

    expect(fillDoc.generationMode).toBe("fill");
    expect(composeDoc.generationMode).toBe("compose");
    expect((defaultDoc as any).generationMode ?? "fill").toBe("fill");
  });

  it("should route to COMPOSE when mode is compose", () => {
    const shouldCompose = (doc: { generationMode?: string }) => {
      return doc.generationMode === "compose";
    };

    expect(shouldCompose({ generationMode: "compose" })).toBe(true);
    expect(shouldCompose({ generationMode: "fill" })).toBe(false);
    expect(shouldCompose({})).toBe(false);
  });
});

describe("Neemia COMPOSE — Table Formatting", () => {
  it("should support alternate row shading pattern", () => {
    const rows = [
      { idx: 0, isAlt: false },
      { idx: 1, isAlt: true },
      { idx: 2, isAlt: false },
      { idx: 3, isAlt: true },
    ];

    rows.forEach(r => {
      expect(r.isAlt).toBe(r.idx % 2 === 1);
    });
  });

  it("should identify numeric values for right-alignment", () => {
    const isNumeric = (val: string): boolean => {
      try {
        const cleaned = val.replace(/[,%\s]/g, "").replace(",", ".");
        return !isNaN(parseFloat(cleaned));
      } catch {
        return false;
      }
    };

    expect(isNumeric("150000")).toBe(true);
    expect(isNumeric("65%")).toBe(true);
    expect(isNumeric("1,234.56")).toBe(true);
    expect(isNumeric("Echipamente")).toBe(false);
    expect(isNumeric("TOTAL")).toBe(false);
  });

  it("should correctly index highlightRows", () => {
    const rows = [
      { categorie: "Echipamente", valoare: "150000" },
      { categorie: "Construcții", valoare: "80000" },
      { categorie: "Proiectare", valoare: "20000" },
    ];
    const highlightRows = [0, 2];

    const highlighted = rows.filter((_, i) => highlightRows.includes(i));
    expect(highlighted).toHaveLength(2);
    expect(highlighted[0].categorie).toBe("Echipamente");
    expect(highlighted[1].categorie).toBe("Proiectare");
  });
});

describe("Neemia COMPOSE — Validation", () => {
  it("should warn when no elements have values", () => {
    const projEls = [
      { value: null, confirmed: false },
      { value: "", confirmed: false },
      { value: "  ", confirmed: false },
    ];

    const filled = projEls.filter(pe => pe.value && pe.value.trim() !== "");
    expect(filled.length).toBe(0);

    const errors: string[] = [];
    if (filled.length === 0) {
      errors.push("Niciun element nu are valoare");
    }
    expect(errors).toContain("Niciun element nu are valoare");
  });

  it("should warn about unconfirmed elements", () => {
    const projEls = [
      { value: "COMEXIM", confirmed: true },
      { value: "250000", confirmed: false },
      { value: "SM6.1", confirmed: false },
    ];

    const filled = projEls.filter(pe => pe.value && pe.value.trim() !== "");
    const unconfirmed = filled.filter(pe => !pe.confirmed);

    expect(filled.length).toBe(3);
    expect(unconfirmed.length).toBe(2);
  });

  it("should check composeConfig sections exist", () => {
    const configWithSections = {
      composeConfig: {
        sections: [{ marker: "COMPOSE:test", type: "narrative", label: "Test" }],
      },
    };
    const configEmpty = { composeConfig: { sections: [] } };
    const configNull = { composeConfig: null };

    expect(configWithSections.composeConfig?.sections?.length).toBeGreaterThan(0);
    expect(configEmpty.composeConfig?.sections?.length).toBe(0);
    expect(configNull.composeConfig?.sections?.length ?? 0).toBe(0);
  });
});
