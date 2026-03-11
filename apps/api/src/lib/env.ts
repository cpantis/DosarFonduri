import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  JWT_SECRET: requireEnv("JWT_SECRET"),
  PROVIDER_JWT_SECRET: requireEnv("PROVIDER_JWT_SECRET"),
  ANTHROPIC_API_KEY: requireEnv("ANTHROPIC_API_KEY"),
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  PORT: parseInt(process.env.PORT || "8080"),
  LISTAFIRME_API_KEY: process.env.LISTAFIRME_API_KEY || "",
};
