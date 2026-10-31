import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { pinoHttp } from "pino-http";
import fs from "node:fs";
import { config } from "./config";
import { prisma } from "./lib/db";
import { errorHandler, AppError } from "./lib/errors";
import { authenticate } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { crmRoutes, publicRoutes } from "./routes/crm";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { opsRoutes } from "./routes/ops";
import { serviceRoutes } from "./routes/service";
import { reportRoutes } from "./routes/reports";
import { financeOpsRoutes } from "./routes/finance-ops";
import { adminRoutes } from "./routes/admin";

export function buildApp() {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(","), credentials: false }));
  app.use(pinoHttp({ logger: pino({ level: process.env.NODE_ENV === "test" ? "silent" : "info" }) }));
  app.use(express.json({ limit: "25mb" })); // site photos arrive as base64 data URLs
  app.use("/uploads", express.static(config.UPLOAD_DIR, { index: false, dotfiles: "deny" }));
  app.get("/api/health", async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, db: "up" }); } catch { res.status(503).json({ ok: false, db: "down" }); }
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/public", rateLimit({ windowMs: 60_000, limit: 10 }), publicRoutes);
  app.use("/api", authenticate);
  app.use("/api", crmRoutes, catalogRoutes, orderRoutes, opsRoutes, serviceRoutes, reportRoutes, financeOpsRoutes, adminRoutes);
  app.use((_req, _res, next) => next(new AppError(404, "Not found")));
  app.use(errorHandler);
  return app;
}
