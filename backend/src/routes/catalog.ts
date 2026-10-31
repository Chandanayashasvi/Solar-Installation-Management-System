import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
export const catalogRoutes = Router();

catalogRoutes.get("/products", ah(async (_req, res) => res.json(await prisma.product.findMany({ include: { category: true, policy: true }, orderBy: { name: "asc" } }))));
catalogRoutes.post("/products", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({ sku: z.string().trim().min(2).max(40).toUpperCase(), name: z.string().trim().min(2).max(120), categoryId: z.string(), unit: z.string().default("pcs"),
    price: z.coerce.number().min(0), cost: z.coerce.number().min(0), taxRate: z.coerce.number().min(0).max(40).default(5), trackSerial: z.boolean().default(false), lowStockLevel: z.coerce.number().int().min(0).default(0) }).parse(req.body);
  res.status(201).json(await prisma.product.create({ data: d }));
}));
// Price changes affect new quotations only; issued quotations keep their snapshot prices.
catalogRoutes.patch("/products/:id", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({ price: z.coerce.number().min(0).optional(), cost: z.coerce.number().min(0).optional(), lowStockLevel: z.coerce.number().int().min(0).optional(), active: z.boolean().optional() }).parse(req.body);
  res.json(await prisma.product.update({ where: { id: req.params.id }, data: d }));
}));
catalogRoutes.get("/packages", ah(async (_req, res) => res.json(await prisma.package.findMany({ where: { active: true }, orderBy: [{ systemType: "asc" }, { capacityKw: "asc" }], include: { items: { include: { product: { select: { name: true } } } } } }))));
catalogRoutes.get("/users", allow("SALES", "WAREHOUSE", "SUPPORT", "SURVEYOR", "FINANCE"), ah(async (req, res) => {
  const role = z.enum(["TECHNICIAN", "SALES", "SURVEYOR", "SUPPORT", "WAREHOUSE", "FINANCE"]).optional().parse(req.query.role);
  res.json(await prisma.user.findMany({ where: { active: true, ...(role ? { role } : {}) }, select: { id: true, name: true, role: true } }));
}));
catalogRoutes.get("/warranty-policies", ah(async (_req, res) => res.json(await prisma.warrantyPolicy.findMany({ include: { product: { select: { name: true } } } }))));
catalogRoutes.patch("/warranty-policies/:id", allow(), ah(async (req, res) => {
  const { months } = z.object({ months: z.coerce.number().int().min(1).max(600) }).parse(req.body);
  res.json(await prisma.warrantyPolicy.update({ where: { id: req.params.id }, data: { months } })); // applies to future deliveries only
}));
