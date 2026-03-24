import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  cui: z.string().optional(),
  cabinetCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const validateCodeSchema = z.object({
  code: z.string().min(1),
});

export const createCompanySchema = z.object({
  formaJuridica: z.enum(["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]),
  denumire: z.string().min(1),
  cui: z.string().min(1),
  regCom: z.string().optional(),
  euid: z.string().optional(),
  adresa: z.string().optional(),
  localitate: z.string().optional(),
  judet: z.string().optional(),
  codPostal: z.string().optional(),
  telefon: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
});

export const createProjectSchema = z.object({
  companyId: z.string().uuid(),
  folderId: z.string().uuid(),
  name: z.string().min(1),
  valoare: z.number().optional(),
});

export const generateCodeSchema = z.object({
  plan: z.enum(["starter", "professional", "enterprise"]),
  maxUsers: z.number().min(1).max(100),
  trialDays: z.number().min(0).max(90),
});

// ─── Auth ───
export const lookupCuiSchema = z.object({
  cui: z.string().min(1),
});

export const checkInvitedSchema = z.object({
  email: z.string().email(),
});

export const preferencesSchema = z.object({
  theme: z.enum(["dark", "light"]),
});

export const providerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── Companies ───
export const updateCompanySchema = z.object({
  denumire: z.string().min(1).max(500).optional(),
  formaJuridica: z.enum(["SRL", "SA", "SNC", "SCS", "SCA", "PFA", "II", "IF", "SC", "RA", "SA_BVB"]).optional(),
  caen: z.string().max(10).optional().nullable(),
  adresa: z.string().max(500).optional().nullable(),
  localitate: z.string().max(200).optional().nullable(),
  judet: z.string().max(100).optional().nullable(),
  telefon: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  capitalSocial: z.string().max(50).optional().nullable(),
  moneda: z.string().max(10).optional().nullable(),
  partiSociale: z.number().int().optional().nullable(),
  valoareParte: z.string().max(50).optional().nullable(),
});

// ─── Projects ───
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  status: z.enum(["draft", "in_progress", "review", "submitted", "approved", "rejected"]).optional(),
  valoare: z.string().max(50).optional().nullable(),
  programFinantare: z.string().max(255).optional().nullable(),
  codMasura: z.string().max(100).optional().nullable(),
  codSesiune: z.string().max(100).optional().nullable(),
  codNomenclator: z.string().max(100).optional().nullable(),
  prefixDocumente: z.string().max(50).optional().nullable(),
  codMysmis: z.string().max(100).optional().nullable(),
  structuraDosar: z.any().optional(),
  tipProiect: z.string().max(100).optional().nullable(),
});

export const updateElementSchema = z.object({
  value: z.string().max(50000).optional().nullable(),
  source: z.enum(["onrc", "solomon", "manual", "calculated", "ghid", "document_extracted", "onrc_auto", "anaf_auto", "solomon_chat", "consultant_manual", "derived"]).optional(),
  confirmed: z.boolean().optional(),
});

export const createProjectElementSchema = z.object({
  key: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  value: z.string().max(50000).optional().nullable(),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]).default("text"),
});

export const bulkConfirmElementsSchema = z.object({
  elementIds: z.array(z.string().uuid()).min(1).max(500),
});

export const overrideEligibilitySchema = z.object({
  overrideResult: z.enum(["passed", "failed", "pending", "not_applicable"]),
  notes: z.string().max(5000).optional(),
});

export const createChecklistItemSchema = z.object({
  name: z.string().min(1).max(500),
  category: z.string().max(200).optional(),
});

export const updateChecklistItemSchema = z.object({
  done: z.boolean().optional(),
  templateId: z.string().uuid().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  category: z.string().max(200).optional().nullable(),
});

// ─── Solomon ───
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  useET: z.boolean().optional(),
});

export const refineSchema = z.object({
  selectedText: z.string().min(1).max(10000),
  instruction: z.string().min(1).max(5000),
});

export const updateModelSchema = z.object({
  model: z.string().min(1).max(100),
});

// ─── Neemia ───
export const templateDocIdSchema = z.object({
  templateDocumentId: z.string().uuid(),
});

export const generationModeSchema = z.object({
  mode: z.enum(["fill", "compose"]),
});

export const sectionBlueprintSchema = z.object({
  sectionId: z.string().min(1).max(255),
  title: z.string().max(500),
  purpose: z.string().max(5000),
  requiredElementKeys: z.array(z.string()),
  optionalElementKeys: z.array(z.string()),
  referenceTableIds: z.array(z.string()),
  tone: z.enum(["formal", "technical", "narrative"]),
  targetLength: z.object({ min: z.number().int().min(0), max: z.number().int().min(1) }),
  keywords: z.array(z.string()),
  evaluatorChecklist: z.array(z.string()),
  structureHint: z.string().max(2000).optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
});

export const documentBlueprintSchema = z.object({
  templateId: z.string().uuid(),
  documentPurpose: z.string().max(5000),
  evaluatorExpectations: z.string().max(10000),
  generatedAt: z.string(),
  generatedBy: z.string().max(100),
  sections: z.array(sectionBlueprintSchema),
});

export const composeConfigSchema = z.object({
  sections: z.array(z.object({
    marker: z.string().min(1).max(255),
    title: z.string().max(500).optional(),
    aiModel: z.string().max(100).optional(),
    promptTemplate: z.string().max(10000).optional(),
    elementKeys: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
  aiModel: z.string().max(100).optional(),
  language: z.string().max(20).optional(),
});

export const updateSectionContentSchema = z.object({
  content: z.string().max(100000),
});

export const composeGenerateSchema = z.object({
  templateDocumentId: z.string().uuid(),
  editedSections: z.record(z.string(), z.string().max(100000)).optional(),
});

// ─── Documents ───
export const updateDocElementSchema = z.object({
  validated: z.boolean().optional(),
  label: z.string().max(255).optional(),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]).optional(),
  group: z.string().max(100).optional().nullable(),
});

export const validatePageSchema = z.object({
  pageNum: z.number().int().min(0),
  validated: z.boolean(),
});

export const createDocElementSchema = z.object({
  key: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  fieldType: z.enum(["text", "number", "textarea", "date", "table", "signature", "select"]).default("text"),
  pageNum: z.number().int().optional(),
  lineNum: z.number().int().optional(),
  group: z.string().max(100).optional(),
});

// ─── Reference Tables ───
export const updateRefTableSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  tableType: z.enum(["lookup", "classification", "list", "matrix"]).optional(),
  schema: z.any().optional(),
  data: z.any().optional(),
  lookupKey: z.string().max(100).optional().nullable(),
  validated: z.boolean().optional(),
});

export const createRuleRefLinkSchema = z.object({
  ruleId: z.string().uuid(),
  referenceTableId: z.string().uuid(),
  usage: z.enum(["validates", "scores", "classifies"]),
  description: z.string().max(5000).optional(),
});

export const createElementRuleLinkSchema = z.object({
  templateElementId: z.string().uuid().optional(),
  elementDefId: z.string().uuid().optional(),
  ruleId: z.string().uuid(),
  role: z.enum(["input", "output", "constraint"]),
  description: z.string().max(5000).optional(),
});

export const validateElementSchema = z.object({
  elementId: z.string().uuid(),
  value: z.string().max(50000),
  projectId: z.string().uuid(),
});

// ─── Type exports ───
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type GenerateCodeInput = z.infer<typeof generateCodeSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateElementInput = z.infer<typeof updateElementSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
