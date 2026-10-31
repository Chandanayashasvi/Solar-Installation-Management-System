import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res, next).catch(next); };
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: "Validation failed", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return res.status(409).json({ error: "Duplicate value: " + String((err.meta as any)?.target ?? "record") });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
