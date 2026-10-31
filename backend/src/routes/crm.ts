import { Router } from "express";
import { Prisma } from "@prisma/client";
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
  systemType: z.enum(["ON_GRID", "OFF_GRID", "PANEL_SET"]),
  monthlyBill: z.coerce.number().min(0).max(10_000_000).optional(),
  subsidyRequirement: z.enum(["YES", "NO", "GUIDANCE"]).optional(),
  notes: z.string().trim().max(500).optional(), source: z.string().max(30).optional(),
});
const enquiryReference = (id: string) => `SP-ENQ-${id.toUpperCase()}`;
async function createEnquiry(d: z.infer<typeof enquiryInput>, source: string, publicSubmissionKey?: string) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: d.phone },
      update: {},
      create: { name: d.name, phone: d.phone, email: d.email || null, address: d.address },
    });
    const enquiry = await tx.enquiry.create({
      data: {
        customerId: customer.id,
        requestedKw: d.requestedKw,
        systemType: d.systemType,
        monthlyBill: d.monthlyBill,
        subsidyRequirement: d.subsidyRequirement,
        notes: d.notes,
        source,
        publicSubmissionKey,
      },
      include: { customer: true },
    });
    return { ...enquiry, reference: enquiryReference(enquiry.id) };
  });
}
// Public web form: lands straight in the sales pipeline.
publicRoutes.post("/enquiry", ah(async (req, res) => {
  const d = enquiryInput.extend({
    submissionKey: z.string().uuid(),
    website: z.string().max(200).default(""),
  }).parse(req.body);
  if (d.website.trim()) throw new AppError(400, "Unable to submit enquiry");
  const { submissionKey, ...enquiry } = d;
  const existing = await prisma.enquiry.findUnique({ where: { publicSubmissionKey: submissionKey }, select: { id: true } });
  if (existing) return res.status(200).json({ reference: enquiryReference(existing.id), duplicate: true });
  try {
    const created = await createEnquiry(enquiry, "WEB", submissionKey);
    return res.status(201).json({ reference: created.reference, duplicate: false });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.enquiry.findUnique({ where: { publicSubmissionKey: submissionKey }, select: { id: true } });
      if (duplicate) return res.status(200).json({ reference: enquiryReference(duplicate.id), duplicate: true });
    }
    throw error;
  }
}));

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
  const [total, enquiries] = await Promise.all([prisma.enquiry.count({ where }), prisma.enquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { customer: true, survey: true, quotations: { select: { id: true, number: true, status: true, total: true, version: true }, orderBy: { version: "desc" } } } })]);
  res.json({ data: enquiries.map((enquiry) => ({ ...enquiry, reference: enquiryReference(enquiry.id) })), total, page: q.page, pageSize: q.pageSize });
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
  status: z.enum(["IN_PROGRESS", "SUBMITTED"]).default("SUBMITTED"),
  roofArea: z.coerce.number().positive().max(10000).optional(),
  shadowFreeArea: z.coerce.number().positive().max(10000).optional(),
  direction: z.string().trim().min(1).max(20).optional(),
  tilt: z.coerce.number().min(0).max(90).optional(),
  cableDistance: z.coerce.number().min(0).max(500).optional(),
  monthlyBill: z.coerce.number().min(0).max(10_000_000).optional(),
  gridSuitable: z.boolean().optional(),
  shading: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  photos: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  scheduledFor: z.coerce.date().optional(),
  assignedSurveyorId: z.string().cuid().nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.roofArea !== undefined && v.shadowFreeArea !== undefined && v.shadowFreeArea > v.roofArea) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Shadow-free area cannot exceed roof area", path: ["shadowFreeArea"] });
  }
  if (v.status === "SUBMITTED") {
    for (const field of ["roofArea", "shadowFreeArea", "direction", "tilt", "cableDistance", "monthlyBill", "gridSuitable"] as const) {
      if (v[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required before submitting", path: [field] });
    }
  }
});

const surveyInclude = { enquiry: { include: { customer: true } }, assignedSurveyor: { select: { id: true, name: true } } };
const ownsSurvey = (userId: string, survey: { assignedSurveyorId: string | null; technicianId: string | null }) =>
  survey.assignedSurveyorId === userId || survey.technicianId === userId;

crmRoutes.get("/surveys", allow("SALES", "SURVEYOR"), ah(async (req, res) => {
  const where = req.user!.role === "SURVEYOR"
    ? { OR: [{ assignedSurveyorId: req.user!.id }, { assignedSurveyorId: null, technicianId: req.user!.id }] }
    : {};
  const surveys = await prisma.survey.findMany({ where, orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }], include: surveyInclude });
  res.json(surveys.map((survey) => ({ ...survey, assignedSurveyorId: survey.assignedSurveyorId ?? survey.technicianId })));
}));
crmRoutes.get("/surveys/:id", allow("SALES", "SURVEYOR"), ah(async (req, res) => {
  const survey = await prisma.survey.findUnique({ where: { id: req.params.id }, include: surveyInclude });
  if (!survey) throw new AppError(404, "Survey not found");
  if (req.user!.role === "SURVEYOR" && !ownsSurvey(req.user!.id, survey)) throw new AppError(403, "This survey is not assigned to you");
  const history = await prisma.auditLog.findMany({ where: { entity: "Survey", entityId: survey.id }, orderBy: { createdAt: "desc" } });
  const actors = await prisma.user.findMany({ where: { id: { in: history.flatMap((item) => item.userId ? [item.userId] : []) } }, select: { id: true, name: true } });
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  res.json({ ...survey, assignedSurveyorId: survey.assignedSurveyorId ?? survey.technicianId, history: history.map((item) => ({ ...item, actorName: item.userId ? actorNames.get(item.userId) ?? "Former user" : "System" })) });
}));

crmRoutes.put("/enquiries/:id/survey", allow("SALES", "SURVEYOR", "TECHNICIAN"), ah(async (req, res) => {
  const d = surveyInput.parse(req.body);
  const e = await prisma.enquiry.findUnique({ where: { id: req.params.id }, include: { survey: true } });
  if (!e) throw new AppError(404, "Enquiry not found");
  if (e.survey?.status === "APPROVED") throw new AppError(409, "Survey already approved");
  const user = req.user!;
  if (user.role === "SALES" && (
    d.status !== "IN_PROGRESS" || d.roofArea !== undefined || d.shadowFreeArea !== undefined ||
    d.direction !== undefined || d.tilt !== undefined || d.cableDistance !== undefined ||
    d.monthlyBill !== undefined || d.gridSuitable !== undefined || d.shading !== undefined ||
    d.notes !== undefined || d.photos !== undefined
  )) throw new AppError(403, "Sales can assign and schedule surveys but cannot submit site measurements");
  if (["SURVEYOR", "TECHNICIAN"].includes(user.role) && (!e.survey || !ownsSurvey(user.id, e.survey))) {
    throw new AppError(403, "This survey is not assigned to you");
  }
  if (d.assignedSurveyorId && !["ADMIN", "SALES"].includes(user.role)) throw new AppError(403, "Only sales or admin can assign a surveyor");
  if (d.assignedSurveyorId) {
    const surveyor = await prisma.user.findUnique({ where: { id: d.assignedSurveyorId }, select: { role: true, active: true } });
    if (!surveyor || !surveyor.active || surveyor.role !== "SURVEYOR") throw new AppError(400, "Choose an active surveyor");
  }
  const status = d.status;
  const fields = {
    roofArea: d.roofArea, shadowFreeArea: d.shadowFreeArea, direction: d.direction, tilt: d.tilt,
    cableDistance: d.cableDistance, monthlyBill: d.monthlyBill, gridSuitable: d.gridSuitable,
    shading: d.shading, notes: d.notes, photos: d.photos, scheduledFor: d.scheduledFor,
  };
  const prior = e.survey;
  const effective = { ...prior, ...fields };
  if (status === "SUBMITTED" && (
    effective.roofArea == null || effective.shadowFreeArea == null || effective.direction == null ||
    effective.tilt == null || effective.cableDistance == null || effective.monthlyBill == null || effective.gridSuitable == null
  )) throw new AppError(400, "Complete all required survey measurements before submitting");
  if (status === "SUBMITTED" && effective.shadowFreeArea! > effective.roofArea!) throw new AppError(400, "Shadow-free area cannot exceed roof area");
  const assignedSurveyorId = d.assignedSurveyorId !== undefined ? d.assignedSurveyorId : prior?.assignedSurveyorId ?? null;
  const legacyTechnicianId = user.role === "TECHNICIAN" ? user.id : prior?.technicianId ?? null;
  const submittedById = status === "SUBMITTED" ? user.id : prior?.submittedById ?? null;
  const submittedAt = status === "SUBMITTED" ? new Date() : prior?.submittedAt ?? null;
  const survey = await prisma.$transaction(async (tx) => {
    const saved = await tx.survey.upsert({
      where: { enquiryId: e.id },
      create: { ...fields, enquiryId: e.id, status, assignedSurveyorId, technicianId: legacyTechnicianId, submittedById, submittedAt },
      update: { ...fields, status, assignedSurveyorId, technicianId: legacyTechnicianId, submittedById, submittedAt, decidedAt: null, decidedById: null, decisionComment: null },
      include: surveyInclude,
    });
    await tx.auditLog.create({ data: { userId: user.id, action: status === "SUBMITTED" ? "SURVEY_SUBMITTED" : "SURVEY_DRAFT_SAVED", entity: "Survey", entityId: saved.id } });
    if (e.status === "NEW" || e.status === "CONTACTED") await tx.enquiry.update({ where: { id: e.id }, data: { status: "SURVEY_SCHEDULED" } });
    return saved;
  });
  res.json({ ...survey, assignedSurveyorId: survey.assignedSurveyorId ?? survey.technicianId });
}));
crmRoutes.post("/surveys/:id/decision", allow("SURVEYOR"), ah(async (req, res) => {
  const { status, comment } = z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string().trim().min(3).max(500),
  }).parse(req.body);
  const survey = await prisma.survey.findUnique({ where: { id: req.params.id } });
  if (!survey) throw new AppError(404, "Survey not found");
  const user = req.user!;
  if (user.role === "SURVEYOR" && !ownsSurvey(user.id, survey)) throw new AppError(403, "Only the assigned surveyor can review this survey");
  if (!["SUBMITTED", "PENDING"].includes(survey.status)) throw new AppError(409, "Only submitted surveys can be reviewed");
  if (status === "APPROVED" && (
    !survey.gridSuitable || survey.roofArea == null || survey.roofArea <= 0 ||
    survey.shadowFreeArea == null || survey.shadowFreeArea <= 0 ||
    survey.direction == null || !survey.direction.trim() ||
    survey.tilt == null || survey.cableDistance == null || survey.monthlyBill == null
  )) {
    throw new AppError(409, "Cannot approve: survey measurements must be complete and grid connection suitable");
  }
  await prisma.$transaction(async (tx) => {
    await tx.survey.update({ where: { id: survey.id }, data: { status, decidedAt: new Date(), decidedById: user.id, decisionComment: comment } });
    await tx.enquiry.update({ where: { id: survey.enquiryId }, data: { status: status === "APPROVED" ? "QUALIFIED" : "SURVEY_SCHEDULED" } });
    await tx.auditLog.create({ data: { userId: user.id, action: `SURVEY_${status}`, entity: "Survey", entityId: survey.id, detail: { comment } } });
  });
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
