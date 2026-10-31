import { randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, audit } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";

export const adminRoutes = Router();
const adminOnly = allow("ADMIN");
const roles = z.enum(["ADMIN", "SALES", "SURVEYOR", "WAREHOUSE", "TECHNICIAN", "SUPPORT", "FINANCE"]);
const userFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;
const temporaryPassword = () => randomBytes(18).toString("base64url");

adminRoutes.get("/admin/users", adminOnly, ah(async (req, res) => {
  const query = z.object({
    search: z.string().trim().max(100).optional(),
    role: roles.optional(),
    active: z.enum(["true", "false"]).optional(),
  }).parse(req.query);
  const users = await prisma.user.findMany({
    where: {
      ...(query.role ? { role: query.role } : {}),
      ...(query.active ? { active: query.active === "true" } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ] } : {}),
    },
    select: userFields,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  res.json(users);
}));

adminRoutes.post("/admin/users", adminOnly, ah(async (req, res) => {
  const d = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    role: roles,
  }).parse(req.body);
  const password = temporaryPassword();
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { ...d, email: d.email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12) },
      select: userFields,
    });
    await audit(tx, req.user!.id, "USER_CREATED", "User", created.id, { role: created.role });
    return created;
  });
  res.status(201).json({ user, temporaryPassword: password });
}));

adminRoutes.patch("/admin/users/:id", adminOnly, ah(async (req, res) => {
  const d = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(254).optional(),
    role: roles.optional(),
    active: z.boolean().optional(),
  }).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" }).parse(req.body);
  if (req.params.id === req.user!.id && d.role) throw new AppError(409, "You cannot change your own role");
  if (req.params.id === req.user!.id && d.active === false) throw new AppError(409, "You cannot deactivate your own account");
  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: req.params.id }, select: userFields });
    if (!existing) throw new AppError(404, "User not found");
    if (existing.role === "ADMIN" && existing.active && (d.role !== undefined && d.role !== "ADMIN" || d.active === false)) {
      const activeAdmins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'ADMIN' AND active = true FOR UPDATE`;
      if (activeAdmins.length <= 1) throw new AppError(409, "Cannot remove or deactivate the last active administrator");
    }
    const updated = await tx.user.update({
      where: { id: existing.id },
      data: { ...d, ...(d.email ? { email: d.email.toLowerCase() } : {}) },
      select: userFields,
    });
    await audit(tx, req.user!.id, "USER_UPDATED", "User", updated.id, {
      changes: Object.keys(d),
      ...(d.role ? { fromRole: existing.role, toRole: d.role } : {}),
      ...(d.active !== undefined ? { fromActive: existing.active, toActive: d.active } : {}),
    });
    return updated;
  });
  res.json(saved);
}));

adminRoutes.post("/admin/users/:id/reset-password", adminOnly, ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!user) throw new AppError(404, "User not found");
  const password = temporaryPassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
    await audit(tx, req.user!.id, "USER_PASSWORD_RESET", "User", user.id);
  });
  res.json({ temporaryPassword: password });
}));
