import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth";
import { providerRoutes } from "./routes/provider";
import { companyRoutes } from "./routes/companies";
import { documentRoutes } from "./routes/documents";
import { ruleRoutes } from "./routes/rules";
import { templateRoutes } from "./routes/templates";
import { projectRoutes } from "./routes/projects";
import { dashboardRoutes } from "./routes/dashboard";
import { solomonRoutes } from "./routes/solomon";
import { neemiaRoutes } from "./routes/neemia";
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Public routes
app.route("/api/auth", authRoutes);
app.route("/api/provider", providerRoutes);

// Protected routes
app.use("/api/*", authMiddleware);
app.use("/api/*", auditMiddleware);
app.route("/api/companies", companyRoutes);
app.route("/api/documents", documentRoutes);
app.route("/api/rules", ruleRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/solomon", solomonRoutes);
app.route("/api/neemia", neemiaRoutes);

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

const port = parseInt(process.env.PORT || "8080");
console.log(`DosarFonduri API running on port ${port}`);
serve({ fetch: app.fetch, port });
