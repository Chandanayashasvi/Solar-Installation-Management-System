import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AppError } from "../lib/errors";
import { canAccessRole, type Role } from "../lib/roles";
export type { Role } from "../lib/roles";
export interface AuthUser { id: string; role: Role; name: string }
declare global { namespace Express { interface Request { user?: AuthUser } } }
export const signToken = (u: AuthUser) => jwt.sign(u, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as any });
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return next(new AppError(401, "Login required"));
  try { const p = jwt.verify(h.slice(7), config.JWT_SECRET) as any; req.user = { id: p.id, role: p.role, name: p.name }; next(); }
  catch { next(new AppError(401, "Session expired, please log in again")); }
}
/** ADMIN may do everything; other roles must be listed. Enforced server-side on every route. */
export const allow = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) =>
  req.user && canAccessRole(req.user.role, roles) ? next() : next(new AppError(403, "Your role cannot do this"));
