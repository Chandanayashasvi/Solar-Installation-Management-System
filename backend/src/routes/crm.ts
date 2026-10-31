import { Router } from "express";
import { z } from "zod";
import { prisma, audit, nextNumber, n } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
import { bomQty, quoteTotals } from "../lib/bom";
import { config } from "../config";

export const publicRoutes = Router();
export const crmRoutes = Router();

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
const enquiryInput = z.object({
  name: z.string().trim().min(2).max(100), phone, email: z.string().email().optional().or(z.literal("")),
  address: z.string().trim().min(5).max(300), requestedKw: z.coerce.number().int().min(1).max(5),
  systemType: z.enum(["ON_GRID", "OFF_GRID", "PANEL_SET"]), notes: z.string().max(500).optional(), source: z.string().max(30).optional(),
});
async function createEnquiry(d: z.infer<typeof enquiryInput>, source: string) {
  const customer = await prisma.customer.upsert({ where: { phone: d.phone }, update: {}, create: { name: d.name, phone: d.phone, email: d.email || null, address: d.address } });
  return prisma.enquiry.create({ data: { customerId: customer.id, requestedKw: d.requestedKw, systemType: d.systemType, notes: d.notes, source }, include: { customer: true } });
}
// Public web form: lands straight in the sales pipeline.
publicRoutes.post("/enquiry", ah(async (req, res) => { const e = await createEnquiry(enquiryInput.parse(req.body), "WEB"); res.status(201).json({ id: e.id }); }));

const sales = allow("SALES");
crmRoutes.post("/enquiries", sales, ah(async (req, res) => {
  const d = enquiryInput.parse(req.body); const e = await createEnquiry(d, d.source ?? "CALL");
  await audit(prisma, req.user!.id, "CREATE", "Enquiry", e.id); res.status(201).json(e);
}));
crmRoutes.get("/enquiries", allow("SALES", "TECHNICIAN"), ah(async (req, res) => {
  const q = z.object({ q: z.string().optional(), status: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const where: any = {};
  if (q.status) where.status = q.status;
  if (q.q) where.customer = { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] };
  const [total, data] = await Promise.all([prisma.enquiry.count({ where }), prisma.enquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { customer: true, survey: true, quotations: { select: { id: true, number: true, status: true, total: true, version: true }, orderBy: { version: "desc" } } } })]);
  res.json({ data, total, page: q.page, pageSize: q.pageSize });
}));
// Only human-driven transitions here. QUALIFIED / QUOTED / WON are driven by survey approval, quotation and payment.
crmRoutes.patch("/enquiries/:id/status", sales, ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(["CONTACTED", "SURVEY_SCHEDULED", "LOST"]) }).parse(req.body);
  const e = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
  if (!e) throw new AppError(404, "Enquiry not found");
  if (["WON", "LOST"].includes(e.status)) throw new AppError(409, `Enquiry already ${e.status}`);
  res.json(await prisma.enquiry.update({ where: { id: e.id }, data: { status } }));
}));
crmRoutes.post("/enquiries/:id/followups", sales, ah(async (req, res) => {
  const d = z.object({ note: z.string().trim().min(2).max(500), dueAt: z.coerce.date().optional() }).parse(req.body);
  const [f] = await prisma.$transaction([prisma.followUp.create({ data: { enquiryId: req.params.id, note: d.note, dueAt: d.dueAt, userId: req.user!.id } }), prisma.enquiry.update({ where: { id: req.params.id }, data: { nextFollowUp: d.dueAt } })]);
  res.status(201).json(f);
}));
crmRoutes.get("/enquiries/:id/followups", sales, ah(async (req, res) => res.json(await prisma.followUp.findMany({ where: { enquiryId: req.params.id }, orderBy: { createdAt: "desc" } }))));

const surveyInput = z.object({
  roofArea: z.coerce.number().positive().max(10000), shadowFreeArea: z.coerce.number().positive().max(10000), direction: z.string().trim().min(1).max(20),
  tilt: z.coerce.number().min(0).max(90), cableDistance: z.coerce.number().min(0).max(500), monthlyBill: z.coerce.number().min(0).max(10_000_000),
  gridSuitable: z.boolean(), notes: z.string().max(500).optional(),
}).refine((v) => v.shadowFreeArea <= v.roofArea, { message: "Shadow-free area cannot exceed roof area", path: ["shadowFreeArea"] });
crmRoutes.put("/enquiries/:id/survey", allow("SALES", "TECHNICIAN"), ah(async (req, res) => {
  const d = surveyInput.parse(req.body);
  const e = await prisma.enquiry.findUnique({ where: { id: req.params.id }, include: { survey: true } });
  if (!e) throw new AppError(404, "Enquiry not found");
  if (e.survey?.status === "APPROVED") throw new AppError(409, "Survey already approved");
  const s = await prisma.survey.upsert({ where: { enquiryId: e.id }, create: { ...d, enquiryId: e.id, technicianId: req.user!.id }, update: { ...d, status: "PENDING", technicianId: req.user!.id } });
  if (e.status === "NEW" || e.status === "CONTACTED") await prisma.enquiry.update({ where: { id: e.id }, data: { status: "SURVEY_SCHEDULED" } });
  res.json(s);
}));
crmRoutes.post("/surveys/:id/decision", sales, ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body);
  const s = await prisma.survey.findUnique({ where: { id: req.params.id } });
  if (!s) throw new AppError(404, "Survey not found");
  if (status === "APPROVED" && !s.gridSuitable) throw new AppError(409, "Cannot approve: grid connection is not suitable");
  await prisma.$transaction([prisma.survey.update({ where: { id: s.id }, data: { status, decidedAt: new Date() } }),
    prisma.enquiry.update({ where: { id: s.enquiryId }, data: { status: status === "APPROVED" ? "QUALIFIED" : "LOST" } }),
    prisma.auditLog.create({ data: { userId: req.user!.id, action: "SURVEY_" + status, entity: "Survey", entityId: s.id } })]);
  res.json({ ok: true });
}));

// ---- quotations ----
crmRoutes.post("/enquiries/:id/quotations", sales, ah(async (req, res) => {
  const d = z.object({ packageId: z.string(), discount: z.coerce.number().min(0).default(0), overrideReason: z.string().trim().min(5).optional() }).parse(req.body);
  const e = await prisma.enquiry.findUnique({ where: { id: req.params.id }, include: { survey: true } });
  if (!e) throw new AppError(404, "Enquiry not found");
  if (e.survey?.status !== "APPROVED") {
    if (!d.overrideReason) throw new AppError(409, "Quotation blocked: roof survey is not approved");
    if (req.user!.role !== "ADMIN") throw new AppError(403, "Only a director can override the survey requirement");
  }
  const pkg = await prisma.package.findUnique({ where: { id: d.packageId }, include: { items: { include: { product: true } } } });
  if (!pkg || !pkg.active) throw new AppError(404, "Package not found");
  const install = await prisma.product.findFirst({ where: { isService: true, sku: "INSTALL-SVC" } });
  if (!install) throw new AppError(500, "Installation service product missing from catalog");
  const lines = pkg.items.map((i) => ({ productId: i.productId, description: i.product.name, qty: bomQty({ productId: i.productId, fixedQty: i.fixedQty, qtyPerKw: n(i.qtyPerKw) }, pkg.capacityKw), unitPrice: n(i.product.price), taxRate: n(i.product.taxRate) })).filter((l) => l.qty > 0);
  lines.push({ productId: install.id, description: `Installation – ${pkg.capacityKw} kW`, qty: 1, unitPrice: n(pkg.installationCharge), taxRate: n(install.taxRate) });
  let t; try { t = quoteTotals(lines, d.discount); } catch (err: any) { throw new AppError(400, err.message); }
  const q = await prisma.$transaction(async (tx) => {
    const version = (await tx.quotation.count({ where: { enquiryId: e.id } })) + 1;
    const number = await nextNumber(tx, "quote", "QT");
    const created = await tx.quotation.create({ data: { number, enquiryId: e.id, packageName: pkg.name, version, ...t, validUntil: new Date(Date.now() + 30 * 86400_000), overrideReason: d.overrideReason, createdById: req.user!.id,
      items: { create: lines.map((l) => ({ ...l, lineTotal: l.qty * l.unitPrice })) } }, include: { items: true } });
    await tx.enquiry.update({ where: { id: e.id }, data: { status: "QUOTED" } });
    if (d.overrideReason && e.survey?.status !== "APPROVED") await audit(tx, req.user!.id, "SURVEY_OVERRIDE", "Quotation", created.id, { reason: d.overrideReason });
    return created;
  });
  res.status(201).json(q);
}));
crmRoutes.get("/quotations/:id", allow("SALES", "WAREHOUSE", "SUPPORT"), ah(async (req, res) => {
  const q = await prisma.quotation.findUnique({ where: { id: req.params.id }, include: { items: true, enquiry: { include: { customer: true } } } });
  if (!q) throw new AppError(404, "Quotation not found"); res.json(q);
}));
crmRoutes.post("/quotations/:id/reject", sales, ah(async (req, res) => { await prisma.quotation.update({ where: { id: req.params.id }, data: { status: "REJECTED" } }); res.json({ ok: true }); }));
crmRoutes.post("/quotations/:id/accept", sales, ah(async (req, res) => {
  const order = await prisma.$transaction(async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id: req.params.id }, include: { items: { include: {} }, enquiry: true } });
    if (!q) throw new AppError(404, "Quotation not found");
    if (q.status !== "ISSUED") throw new AppError(409, `Quotation is ${q.status}`);
    if (q.validUntil < new Date()) { await tx.quotation.update({ where: { id: q.id }, data: { status: "EXPIRED" } }); throw new AppError(409, "Quotation has expired"); }
    const products = await tx.product.findMany({ where: { id: { in: q.items.map((i) => i.productId) } } });
    const cost = new Map(products.map((p) => [p.id, n(p.cost)]));
    const number = await nextNumber(tx, "order", "ORD");
    const total = n(q.total);
    const o = await tx.order.create({ data: { number, quotationId: q.id, customerId: q.enquiry.customerId, total, requiredAdvance: Math.round(total * config.ADVANCE_PERCENT) / 100,
      items: { create: q.items.map((i) => ({ productId: i.productId, description: i.description, qty: i.qty, unitPrice: i.unitPrice, unitCost: cost.get(i.productId) ?? 0 })) } } });
    await tx.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
    return o;
  });
  res.status(201).json(order);
}));
