import { Router } from "express";
import { z } from "zod";
import { prisma, audit, n } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
import { round2 } from "../lib/warranty";
export const orderRoutes = Router();

const include = { customer: true, items: true, payments: { orderBy: { paidAt: "asc" as const } }, job: true, subsidy: true, assets: { include: { product: { select: { name: true } }, warranty: true } } };
const view = (o: any) => { const paid = round2(o.payments.reduce((s: number, p: any) => s + n(p.amount), 0)); return { ...o, paid, outstanding: round2(n(o.total) - paid) }; };

orderRoutes.get("/orders", allow("SALES", "WAREHOUSE", "TECHNICIAN", "SUPPORT"), ah(async (req, res) => {
  const where: any = req.query.status ? { status: String(req.query.status) } : {};
  const rows = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, include: { customer: true, payments: true, job: true } });
  const mine = req.user!.role === "TECHNICIAN" ? rows.filter((o) => o.job?.technicianId === req.user!.id) : rows;
  res.json(mine.map(view));
}));
orderRoutes.get("/orders/:id", allow("SALES", "WAREHOUSE", "TECHNICIAN", "SUPPORT"), ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include });
  if (!o) throw new AppError(404, "Order not found"); res.json(view(o));
}));

// Payment: row lock + idempotency key => no double-recording, no overpayment, even with concurrent clicks.
orderRoutes.post("/orders/:id/payments", allow("SALES"), ah(async (req, res) => {
  const d = z.object({ amount: z.coerce.number().positive(), method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD"]), reference: z.string().max(80).optional(), idempotencyKey: z.string().min(8).max(80) }).parse(req.body);
  const out = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${req.params.id} FOR UPDATE`;
    const dup = await tx.payment.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
    if (dup) return { duplicate: true, payment: dup };
    const o = await tx.order.findUnique({ where: { id: req.params.id }, include: { payments: true, quotation: true, items: true } });
    if (!o) throw new AppError(404, "Order not found");
    if (o.status === "CANCELLED") throw new AppError(409, "Order is cancelled");
    const paid = o.payments.reduce((s, p) => s + n(p.amount), 0), balance = round2(n(o.total) - paid);
    if (d.amount > balance + 0.001) throw new AppError(409, `Amount exceeds balance due (₹${balance})`);
    const kind = d.amount >= balance - 0.001 ? "FINAL" : o.payments.length === 0 ? "ADVANCE" : "PARTIAL";
    const payment = await tx.payment.create({ data: { orderId: o.id, amount: d.amount, kind, method: d.method, reference: d.reference, idempotencyKey: d.idempotencyKey, recordedById: req.user!.id } });
    if (o.status === "PENDING_ADVANCE" && paid + d.amount >= n(o.requiredAdvance) - 0.001) {
      await tx.order.update({ where: { id: o.id }, data: { status: "CONFIRMED" } });
      for (const it of o.items) {
        const p = await tx.product.findUnique({ where: { id: it.productId } }); if (!p || p.isService) continue;
        await tx.product.update({ where: { id: p.id }, data: { reserved: { increment: it.qty } } });
        await tx.stockMovement.create({ data: { productId: p.id, type: "RESERVE", qty: it.qty, orderId: o.id, userId: req.user!.id } });
      }
      await tx.enquiry.update({ where: { id: o.quotation.enquiryId }, data: { status: "WON" } });
    }
    await audit(tx, req.user!.id, "PAYMENT", "Order", o.id, { amount: d.amount, kind });
    return { duplicate: false, payment };
  });
  res.status(out.duplicate ? 200 : 201).json(out);
}));

orderRoutes.post("/orders/:id/schedule", allow("SALES"), ah(async (req, res) => {
  const d = z.object({ technicianId: z.string(), scheduledFor: z.coerce.date() }).parse(req.body);
  const o = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!o) throw new AppError(404, "Order not found");
  if (o.status === "PENDING_ADVANCE" || o.status === "CANCELLED") throw new AppError(409, "Record the advance payment before scheduling");
  const t = await prisma.user.findUnique({ where: { id: d.technicianId } });
  if (!t || t.role !== "TECHNICIAN") throw new AppError(400, "Pick a valid technician");
  res.json(await prisma.installationJob.upsert({ where: { orderId: o.id }, create: { orderId: o.id, technicianId: t.id, scheduledFor: d.scheduledFor }, update: { technicianId: t.id, scheduledFor: d.scheduledFor } }));
}));

orderRoutes.get("/subsidies", allow("SALES"), ah(async (_req, res) => res.json(await prisma.subsidy.findMany({ include: { order: { include: { customer: true } } } }))));
orderRoutes.put("/orders/:id/subsidy", allow("SALES"), ah(async (req, res) => {
  const d = z.object({ status: z.enum(["PENDING", "SUBMITTED", "APPROVED", "REJECTED", "PAID"]), reference: z.string().max(60).optional(), claimed: z.coerce.number().min(0).default(0), received: z.coerce.number().min(0).default(0), notes: z.string().max(500).optional(), documents: z.array(z.string().max(100)).max(20).default([]) })
    .refine((v) => v.received <= v.claimed || v.claimed === 0 ? true : false, { message: "Received cannot exceed claimed", path: ["received"] }).parse(req.body);
  const data = { ...d, submittedAt: d.status === "SUBMITTED" ? new Date() : undefined };
  res.json(await prisma.subsidy.upsert({ where: { orderId: req.params.id }, create: { orderId: req.params.id, ...data }, update: data }));
}));
