import { Router } from "express";
import { z } from "zod";
import { prisma, n } from "../lib/db";
import { ah } from "../lib/errors";
import { allow } from "../middleware/auth";
import { jobFinancials } from "../lib/finance";
import { config } from "../config";
export const reportRoutes = Router();
const admin = allow(); // ADMIN only
const range = (q: any) => { const p = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(q);
  return { gte: p.from ?? new Date(Date.now() - 180 * 86400_000), lte: p.to ?? new Date() }; };

async function jobRows(r: { gte: Date; lte: Date }) {
  const orders = await prisma.order.findMany({ where: { status: { not: "CANCELLED" }, createdAt: r }, include: { customer: true, items: true, payments: true, job: true } });
  return orders.map((o) => ({ number: o.number, customer: o.customer.name, status: o.status, ...jobFinancials({ total: n(o.total), payments: o.payments.map((p) => n(p.amount)), items: o.items.map((i) => ({ qty: i.qty, unitCost: n(i.unitCost) })), labourHours: o.job?.hours ?? 0, labourRate: config.LABOUR_RATE_PER_HOUR }) }));
}
reportRoutes.get("/reports/dashboard", admin, ah(async (req, res) => {
  const r = range(req.query); const now = new Date();
  const [enq, won, quotesOpen, awaitingDispatch, scheduled, overdue, openTickets, receipts, jobs, tix, products, rows, monthly] = await Promise.all([
    prisma.enquiry.count({ where: { createdAt: r } }), prisma.enquiry.count({ where: { createdAt: r, status: "WON" } }),
    prisma.quotation.count({ where: { status: "ISSUED" } }), prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.installationJob.count({ where: { status: "SCHEDULED" } }), prisma.installationJob.count({ where: { status: "SCHEDULED", scheduledFor: { lt: now } } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.stockMovement.findMany({ where: { type: "RECEIPT", createdAt: r } }),
    prisma.installationJob.findMany({ where: { status: "COMPLETED", completedAt: r }, select: { hours: true } }),
    prisma.ticket.findMany({ where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: r } }),
    prisma.product.findMany({ where: { isService: false } }), jobRows(r),
    prisma.$queryRaw<any[]>`SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS month, COALESCE(SUM(invoiced),0)::float8 AS invoiced, COALESCE(SUM(collected),0)::float8 AS collected FROM (
      SELECT "createdAt" AS d, total::float8 AS invoiced, 0::float8 AS collected FROM "Order" WHERE status <> 'CANCELLED' AND "createdAt" BETWEEN ${r.gte} AND ${r.lte}
      UNION ALL SELECT "paidAt", 0, amount::float8 FROM "Payment" WHERE "paidAt" BETWEEN ${r.gte} AND ${r.lte}) x GROUP BY 1 ORDER BY 1`,
  ]);
  const sum = (k: "invoiced" | "collected" | "outstanding" | "estimatedProfit") => rows.reduce((s, x) => s + x[k], 0);
  res.json({
    funnel: { enquiries: enq, won, conversionPct: enq ? Math.round((won / enq) * 1000) / 10 : 0 },
    pipeline: { quotesAwaitingAcceptance: quotesOpen, ordersAwaitingDispatch: awaitingDispatch, installationsScheduled: scheduled, installationsOverdue: overdue, openTickets },
    money: { invoiced: sum("invoiced"), collected: sum("collected"), outstanding: sum("outstanding"), stockPurchaseCost: receipts.reduce((s, m) => s + m.qty * n(m.unitCost), 0),
      technicianLabourCost: jobs.reduce((s, j) => s + (j.hours ?? 0) * config.LABOUR_RATE_PER_HOUR, 0), estimatedJobProfit: sum("estimatedProfit"),
      serviceBilled: tix.reduce((s, t) => s + n(t.billedAmount), 0), serviceCost: tix.reduce((s, t) => s + n(t.partsCost) + n(t.labourCost), 0), warrantyAbsorbedCost: tix.filter((t) => t.covered).reduce((s, t) => s + n(t.partsCost) + n(t.labourCost), 0) },
    inventory: { valuation: products.reduce((s, p) => s + p.stock * n(p.cost), 0), lowStock: products.filter((p) => p.stock - p.reserved <= p.lowStockLevel).map((p) => ({ name: p.name, available: p.stock - p.reserved, threshold: p.lowStockLevel })) },
    monthly, jobs: rows,
  });
}));
const csvCell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
reportRoutes.get("/reports/jobs.csv", admin, ah(async (req, res) => {
  const rows = await jobRows(range(req.query)); const cols = ["number", "customer", "status", "invoiced", "collected", "outstanding", "materialCost", "labourCost", "estimatedProfit"] as const;
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", "attachment; filename=job-profitability.csv");
  res.send([cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
}));
