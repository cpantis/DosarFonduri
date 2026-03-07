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

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type GenerateCodeInput = z.infer<typeof generateCodeSchema>;
