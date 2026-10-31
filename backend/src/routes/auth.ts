import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { authenticate, signToken } from "../middleware/auth";
export const authRoutes = Router();
const DUMMY = bcrypt.hashSync("not-a-real-password", 10); // equalises timing for unknown emails
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, message: { error: "Too many login attempts, try again later" } });
authRoutes.post("/login", limiter, ah(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY);
  if (!u || !u.active || !ok) throw new AppError(401, "Invalid email or password");
  const user = { id: u.id, role: u.role, name: u.name };
  res.json({ token: signToken(user), user });
}));
authRoutes.get("/me", authenticate, (req, res) => res.json({ user: req.user }));
