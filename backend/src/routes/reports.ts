import { Router } from "express";
import { z } from "zod";
import { prisma, n } from "../lib/db";
import { ah } from "../lib/errors";
import { allow } from "../middleware/auth";
import { jobFinancials } from "../lib/finance";
import { config } from "../config";
export const reportRoutes = Router();
const admin = allow("FINANCE");
const range = (q: any) => { const p = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(q);
  return { gte: p.from ?? new Date(Date.now() - 180 * 86400_000), lte: p.to ?? new Date() }; };

async function jobRows(r: { gte: Date; lte: Date }) {
  const orders = await prisma.order.findMany({ where: { status: { not: "CANCELLED" }, createdAt: r }, include: { customer: true, items: true, payments: true, job: true, invoice: true, projectExpenses: { where: { incurredAt: r } } } });
  return orders.map((o) => ({ number: o.number, customer: o.customer.name, status: o.status, ...jobFinancials({
    total: n(o.total),
    invoiceTotal: o.invoice?.status === "VOID" ? 0 : o.invoice ? n(o.invoice.total) : 0,
    payments: o.payments.map((p) => n(p.amount)),
    items: o.items.map((i) => ({ qty: i.qty, unitCost: n(i.unitCost) })),
    labourHours: o.job?.hours ?? 0,
    labourRate: config.LABOUR_RATE_PER_HOUR,
    projectExpenses: o.projectExpenses.reduce((sum, expense) => sum + n(expense.amount), 0),
  }) }));
}
reportRoutes.get("/reports/dashboard", admin, ah(async (req, res) => {
  const r = range(req.query); const now = new Date();
  const [enq, won, quotesOpen, awaitingDispatch, scheduled, overdue, openTickets, receipts, jobs, tix, products, rows, expenses, technicianPayments, invoicesIssued, paymentReceipts, monthly] = await Promise.all([
    prisma.enquiry.count({ where: { createdAt: r } }), prisma.enquiry.count({ where: { createdAt: r, status: "WON" } }),
    prisma.quotation.count({ where: { status: "ISSUED" } }), prisma.order.count({ where: { status: "CONFIRMED" } }),
    prisma.installationJob.count({ where: { status: "SCHEDULED" } }), prisma.installationJob.count({ where: { status: "SCHEDULED", scheduledFor: { lt: now } } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.stockMovement.findMany({ where: { type: "RECEIPT", createdAt: r } }),
    prisma.installationJob.findMany({ where: { status: "COMPLETED", completedAt: r }, select: { hours: true } }),
    prisma.ticket.findMany({ where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: r } }),
    prisma.product.findMany({ where: { isService: false } }), jobRows(r),
    prisma.projectExpense.findMany({ where: { incurredAt: r }, select: { amount: true } }),
    prisma.technicianPayment.findMany({ where: { periodStart: r }, select: { amount: true, paidAmount: true, status: true } }),
    prisma.invoice.findMany({ where: { issuedAt: r, status: { not: "VOID" } }, select: { total: true } }),
    prisma.payment.findMany({ where: { paidAt: r }, select: { amount: true } }),
    prisma.$queryRaw<any[]>`SELECT to_char(date_trunc('month', d), 'YYYY-MM') AS month, COALESCE(SUM(invoiced),0)::float8 AS invoiced, COALESCE(SUM(collected),0)::float8 AS collected, COALESCE(SUM(expenses),0)::float8 AS expenses FROM (
      SELECT "issuedAt" AS d, total::float8 AS invoiced, 0::float8 AS collected, 0::float8 AS expenses FROM "Invoice" WHERE status <> 'VOID' AND "issuedAt" BETWEEN ${r.gte} AND ${r.lte}
      UNION ALL SELECT "paidAt", 0, amount::float8, 0 FROM "Payment" WHERE "paidAt" BETWEEN ${r.gte} AND ${r.lte}
      UNION ALL SELECT "incurredAt", 0, 0, amount::float8 FROM "ProjectExpense" WHERE "incurredAt" BETWEEN ${r.gte} AND ${r.lte}) x GROUP BY 1 ORDER BY 1`,
  ]);
  const [installationStatuses, recentActivity] = await Promise.all([
    prisma.installationJob.groupBy({ by: ["status"], where: { scheduledFor: r }, _count: { status: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, entity: true, createdAt: true, userId: true, detail: true } }),
  ]);
  const activityUsers = await prisma.user.findMany({
    where: { id: { in: [...new Set(recentActivity.flatMap((item) => item.userId ? [item.userId] : []))] } },
    select: { id: true, name: true },
  });
  const activityNames = new Map(activityUsers.map((user) => [user.id, user.name]));
  const sum = (k: "invoiced" | "collected" | "outstanding" | "invoiceOutstanding" | "estimatedProfit") => rows.reduce((s, x) => s + x[k], 0);
  const paySummary = technicianPayments.reduce((total, payment) => {
    const paid = payment.status === "PAID" && n(payment.paidAmount) === 0 ? n(payment.amount) : n(payment.paidAmount);
    total.recorded += n(payment.amount);
    total.paid += paid;
    total.due += Math.max(0, n(payment.amount) - paid);
    return total;
  }, { recorded: 0, paid: 0, due: 0 });
  res.json({
    funnel: { enquiries: enq, won, conversionPct: enq ? Math.round((won / enq) * 1000) / 10 : 0 },
    pipeline: { quotesAwaitingAcceptance: quotesOpen, ordersAwaitingDispatch: awaitingDispatch, installationsScheduled: scheduled, installationsOverdue: overdue, openTickets },
    money: { orderValue: rows.reduce((s, row) => s + row.orderValue, 0), invoiced: invoicesIssued.reduce((s, invoice) => s + n(invoice.total), 0), collected: paymentReceipts.reduce((s, payment) => s + n(payment.amount), 0), outstanding: sum("outstanding"), invoiceOutstanding: sum("invoiceOutstanding"), recordedExpenses: expenses.reduce((s, expense) => s + n(expense.amount), 0),
      technicianPayRecorded: paySummary.recorded, technicianPayPaid: paySummary.paid, technicianPayDue: paySummary.due,
      stockPurchaseCost: receipts.reduce((s, m) => s + m.qty * n(m.unitCost), 0),
      technicianLabourCost: jobs.reduce((s, j) => s + (j.hours ?? 0) * config.LABOUR_RATE_PER_HOUR, 0), estimatedJobProfit: sum("estimatedProfit"),
      serviceBilled: tix.reduce((s, t) => s + n(t.billedAmount), 0), serviceCost: tix.reduce((s, t) => s + n(t.partsCost) + n(t.labourCost), 0), warrantyAbsorbedCost: tix.filter((t) => t.covered).reduce((s, t) => s + n(t.partsCost) + n(t.labourCost), 0) },
    inventory: { valuation: products.reduce((s, p) => s + p.stock * n(p.cost), 0), lowStock: products.filter((p) => p.stock - p.reserved <= p.lowStockLevel).map((p) => ({ name: p.name, available: p.stock - p.reserved, threshold: p.lowStockLevel })) },
    monthly, jobs: rows,
    installationStatuses: installationStatuses.map((item) => ({ status: item.status, count: item._count.status })),
    recentActivity: recentActivity.map((item) => ({
      id: item.id,
      action: item.action,
      entity: item.entity,
      createdAt: item.createdAt,
      actor: item.userId ? activityNames.get(item.userId) ?? "Former user" : "System",
    })),
  });
}));
const csvCell = (v: unknown) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
reportRoutes.get("/reports/jobs.csv", admin, ah(async (req, res) => {
  const rows = await jobRows(range(req.query)); const cols = ["number", "customer", "status", "orderValue", "invoiced", "collected", "outstanding", "invoiceOutstanding", "materialCost", "labourCost", "expenses", "estimatedProfit"] as const;
  res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", "attachment; filename=job-profitability.csv");
  res.send([cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n"));
}));
