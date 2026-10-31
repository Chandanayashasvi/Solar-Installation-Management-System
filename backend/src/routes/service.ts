import { Router } from "express";
import { z } from "zod";
import { prisma, nextNumber, audit, n } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
import { billTicket, daysLeft, warrantyStatus } from "../lib/warranty";
import { config } from "../config";
export const serviceRoutes = Router();
const support = allow("SUPPORT");

async function findAsset(serial: string) {
  const a = await prisma.asset.findUnique({ where: { serial: serial.trim().toUpperCase() }, include: { product: true, warranty: { include: { policy: true } }, order: { include: { customer: true, job: true } }, tickets: { orderBy: { createdAt: "desc" } } } });
  if (!a) throw new AppError(404, "Serial number not found"); return a;
}
// Signature feature: serial -> customer, installation, warranty decision, repair history.
serviceRoutes.get("/service/lookup/:serial", support, ah(async (req, res) => {
  const a = await findAsset(req.params.serial); const w = a.warranty;
  res.json({ serial: a.serial, status: a.status, product: a.product.name, customer: a.order?.customer ?? null, order: a.order ? { id: a.order.id, number: a.order.number, deliveredAt: a.order.deliveredAt, installedAt: a.order.job?.completedAt ?? null } : null,
    warranty: w ? { policy: w.policy.name, months: w.policy.months, startsAt: w.startsAt, endsAt: w.endsAt, status: warrantyStatus(w.endsAt), daysLeft: daysLeft(w.endsAt) } : { status: "NO_WARRANTY" },
    tickets: a.tickets.map((t) => ({ id: t.id, number: t.number, complaint: t.complaint, status: t.status, covered: t.covered, billedAmount: n(t.billedAmount), createdAt: t.createdAt })) });
}));
serviceRoutes.get("/service/tickets", support, ah(async (_req, res) => res.json(await prisma.ticket.findMany({ orderBy: { createdAt: "desc" }, include: { asset: { include: { product: { select: { name: true } } } }, customer: { select: { name: true, phone: true } } } }))));
serviceRoutes.post("/service/tickets", support, ah(async (req, res) => {
  const d = z.object({ serial: z.string().min(3), complaint: z.string().trim().min(3).max(500), faultCode: z.string().trim().max(30).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"), assignedToId: z.string().optional() }).parse(req.body);
  const a = await findAsset(d.serial);
  if (!a.order) throw new AppError(409, "This serial is not linked to a customer yet");
  const t = await prisma.$transaction(async (tx) => tx.ticket.create({ data: { number: await nextNumber(tx, "ticket", "TKT"), assetId: a.id, customerId: a.order!.customerId, complaint: d.complaint, faultCode: d.faultCode, priority: d.priority, assignedToId: d.assignedToId } }));
  res.status(201).json(t);
}));
serviceRoutes.patch("/service/tickets/:id", support, ah(async (req, res) => {
  const d = z.object({ diagnosis: z.string().max(500).optional(), resolutionNotes: z.string().max(500).optional(), partsCost: z.coerce.number().min(0).optional(), labourCost: z.coerce.number().min(0).optional(), replacementSerial: z.string().trim().toUpperCase().max(60).optional(), status: z.enum(["IN_PROGRESS"]).optional(), assignedToId: z.string().optional() }).parse(req.body);
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!t) throw new AppError(404, "Ticket not found"); if (t.status === "CLOSED") throw new AppError(409, "Ticket is closed");
  res.json(await prisma.ticket.update({ where: { id: t.id }, data: d }));
}));
// Billing decision is made server-side from the persisted warranty end date at the time the complaint was logged.
serviceRoutes.post("/service/tickets/:id/resolve", support, ah(async (req, res) => {
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: { asset: { include: { warranty: true } } } });
  if (!t) throw new AppError(404, "Ticket not found");
  if (t.status === "RESOLVED" || t.status === "CLOSED") throw new AppError(409, `Ticket already ${t.status}`);
  const w = t.asset.warranty; const covered = !!w && w.startsAt <= t.createdAt && t.createdAt <= w.endsAt;
  const bill = billTicket({ covered, partsCost: n(t.partsCost), labourCost: n(t.labourCost), serviceCall: config.SERVICE_CALL_CHARGE });
  const u = await prisma.ticket.update({ where: { id: t.id }, data: { status: "RESOLVED", covered, billedAmount: bill.total, resolvedAt: new Date() } });
  await audit(prisma, req.user!.id, "TICKET_RESOLVED", "Ticket", t.id, bill);
  res.json({ ticket: u, bill });
}));
serviceRoutes.post("/service/tickets/:id/confirm", support, ah(async (req, res) => {
  const t = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!t) throw new AppError(404, "Ticket not found");
  if (t.status !== "RESOLVED") throw new AppError(409, "Resolve the ticket before customer confirmation");
  res.json(await prisma.ticket.update({ where: { id: t.id }, data: { status: "CLOSED", customerConfirmedAt: new Date() } }));
}));
