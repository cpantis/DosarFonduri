import "dotenv/config";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  JWT_SECRET: process.env.JWT_SECRET!,
  PROVIDER_JWT_SECRET: process.env.PROVIDER_JWT_SECRET!,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  PORT: parseInt(process.env.PORT || "8080"),
};
