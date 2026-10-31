import { Router } from "express";
import { z } from "zod";
import { prisma, audit, n, nextNumber } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
import { config } from "../config";
import { initialSubsidyStage, missingSubsidyDocuments, subsidyStageStatus, subsidyStages, subsidyTransitionError } from "../lib/subsidy";

export const financeOpsRoutes = Router();
const finance = allow("FINANCE");
const subsidyStage = z.enum(subsidyStages);

financeOpsRoutes.get("/finance/invoices", finance, ah(async (_req, res) => {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    include: { order: { include: { customer: true, payments: true } }, items: true },
  });
  res.json(invoices.map((invoice) => {
    const paid = invoice.order.payments.reduce((sum, payment) => sum + n(payment.amount), 0);
    const outstanding = Math.max(0, n(invoice.total) - paid);
    const status = invoice.status === "ISSUED" && invoice.dueAt < new Date() && outstanding > 0 ? "OVERDUE" : invoice.status;
    return { ...invoice, paid, outstanding, status };
  }));
}));

financeOpsRoutes.post("/orders/:id/invoice", finance, ah(async (req, res) => {
  const { dueAt } = z.object({ dueAt: z.coerce.date().optional() }).parse(req.body ?? {});
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${req.params.id} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: req.params.id },
      include: { invoice: true, quotation: { include: { items: true } } },
    });
    if (!order) throw new AppError(404, "Order not found");
    if (order.status === "CANCELLED") throw new AppError(409, "Cannot invoice a cancelled order");
    if (order.invoice) return { invoice: order.invoice, duplicate: true };
    let number = await nextNumber(tx, "invoice", "INV");
    while (await tx.invoice.findUnique({ where: { number }, select: { id: true } })) {
      number = await nextNumber(tx, "invoice", "INV");
    }
    const invoice = await tx.invoice.create({
      data: {
        number,
        orderId: order.id,
        status: "ISSUED",
        subtotal: order.quotation.subtotal,
        discount: order.quotation.discount,
        tax: order.quotation.tax,
        total: order.total,
        dueAt: dueAt ?? new Date(Date.now() + 30 * 86400_000),
        createdById: req.user!.id,
        items: { create: order.quotation.items.map(({ description, qty, unitPrice, taxRate, lineTotal }) => ({ description, qty, unitPrice, taxRate, lineTotal })) },
      },
    });
    await audit(tx, req.user!.id, "INVOICE_ISSUED", "Invoice", invoice.id, { orderId: order.id });
    return { invoice, duplicate: false };
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

financeOpsRoutes.patch("/finance/invoices/:id/status", finance, ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]) }).parse(req.body);
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { order: { include: { payments: true } } } });
  if (!invoice) throw new AppError(404, "Invoice not found");
  const paid = invoice.order.payments.reduce((sum, payment) => sum + n(payment.amount), 0);
  if (status === "PAID" && paid < n(invoice.total)) throw new AppError(409, "Invoice cannot be marked paid before the order balance is cleared");
  if (status === "PARTIALLY_PAID" && (paid <= 0 || paid >= n(invoice.total))) throw new AppError(409, "Invoice must have a partial, non-zero balance to use this status");
  if (status === "OVERDUE" && (invoice.dueAt >= new Date() || paid >= n(invoice.total))) throw new AppError(409, "Only an unpaid invoice past its due date can be marked overdue");
  if (status === "VOID" && paid > 0) throw new AppError(409, "An invoice with recorded payments cannot be voided");
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    await audit(tx, req.user!.id, "INVOICE_STATUS", "Invoice", invoice.id, { from: invoice.status, to: status });
    return saved;
  });
  res.json(updated);
}));

financeOpsRoutes.get("/finance/expenses", finance, ah(async (_req, res) => {
  res.json(await prisma.projectExpense.findMany({
    orderBy: { incurredAt: "desc" },
    include: { order: { include: { customer: true } } },
  }));
}));

financeOpsRoutes.post("/finance/expenses", finance, ah(async (req, res) => {
  const d = z.object({
    orderId: z.string().cuid().nullable().optional(),
    category: z.string().trim().min(2).max(60),
    description: z.string().trim().min(3).max(300),
    amount: z.coerce.number().positive().max(100_000_000),
    reference: z.string().trim().max(100).optional(),
    incurredAt: z.coerce.date().optional(),
  }).parse(req.body);
  if (d.orderId) {
    const order = await prisma.order.findUnique({ where: { id: d.orderId }, select: { id: true } });
    if (!order) throw new AppError(404, "Order not found");
  }
  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.projectExpense.create({ data: { ...d, recordedById: req.user!.id } });
    await audit(tx, req.user!.id, "EXPENSE_RECORDED", "ProjectExpense", created.id, { amount: d.amount, category: d.category });
    return created;
  });
  res.status(201).json(expense);
}));

financeOpsRoutes.get("/finance/technician-payments", finance, ah(async (_req, res) => {
  const rows = await prisma.technicianPayment.findMany({
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    include: { technician: { select: { id: true, name: true, email: true } } },
  });
  res.json(rows.map((payment) => {
    const paidAmount = payment.status === "PAID" && n(payment.paidAmount) === 0 ? n(payment.amount) : n(payment.paidAmount);
    return { ...payment, paidAmount, outstanding: Math.max(0, n(payment.amount) - paidAmount) };
  }));
}));

financeOpsRoutes.get("/finance/technician-payments/dashboard", finance, ah(async (_req, res) => {
  const jobs = await prisma.installationJob.findMany({
    where: { status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 365 * 86400_000) } },
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { completedAt: "desc" },
  });
  const technicians = await prisma.user.findMany({ where: { id: { in: [...new Set(jobs.map((job) => job.technicianId))] } }, select: { id: true, name: true } });
  const names = new Map(technicians.map((technician) => [technician.id, technician.name]));
  res.json({
    hourlyRate: config.LABOUR_RATE_PER_HOUR,
    jobs: jobs.map((job) => ({ id: job.id, orderNumber: job.order.number, customer: job.order.customer.name, technician: names.get(job.technicianId) ?? "Unknown", technicianId: job.technicianId, completedAt: job.completedAt, hours: job.hours ?? 0, labourCost: (job.hours ?? 0) * config.LABOUR_RATE_PER_HOUR })),
  });
}));

financeOpsRoutes.post("/finance/technician-payments", finance, ah(async (req, res) => {
  const d = z.object({
    technicianId: z.string().cuid(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    hours: z.coerce.number().positive().max(744),
    rate: z.coerce.number().positive().max(1_000_000),
    reference: z.string().trim().max(100).optional(),
  }).refine((value) => value.periodEnd >= value.periodStart, { message: "Period end must be on or after period start", path: ["periodEnd"] }).parse(req.body);
  const technician = await prisma.user.findUnique({ where: { id: d.technicianId }, select: { id: true, role: true, active: true } });
  if (!technician || technician.role !== "TECHNICIAN" || !technician.active) throw new AppError(400, "Choose an active technician");
  const amount = Math.round(d.hours * d.rate * 100) / 100;
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.technicianPayment.create({ data: { ...d, amount, recordedById: req.user!.id } });
    await audit(tx, req.user!.id, "TECHNICIAN_PAY_RECORDED", "TechnicianPayment", created.id, { amount });
    return created;
  });
  res.status(201).json(payment);
}));

financeOpsRoutes.patch("/finance/technician-payments/:id/paid", finance, ah(async (req, res) => {
  const d = z.object({
    amount: z.coerce.number().positive().max(100_000_000).optional(),
    method: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"]).optional(),
    reference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
  }).parse(req.body ?? {});
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TechnicianPayment" WHERE id = ${req.params.id} FOR UPDATE`;
    const payment = await tx.technicianPayment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new AppError(404, "Technician payment not found");
    const paidAmount = payment.status === "PAID" && n(payment.paidAmount) === 0 ? n(payment.amount) : n(payment.paidAmount);
    const remaining = Math.max(0, n(payment.amount) - paidAmount);
    if (remaining === 0) return { ...payment, paidAmount, outstanding: 0 };
    const amount = d.amount ?? remaining;
    if (amount > remaining + 0.001) throw new AppError(409, `Amount exceeds remaining payable (₹${remaining.toFixed(2)})`);
    const totalPaid = Math.min(n(payment.amount), paidAmount + amount);
    const fullyPaid = totalPaid >= n(payment.amount) - 0.001;
    const saved = await tx.technicianPayment.update({
      where: { id: payment.id },
      data: {
        paidAmount: totalPaid,
        status: fullyPaid ? "PAID" : "RECORDED",
        paidAt: new Date(),
        ...(d.method ? { paymentMethod: d.method } : {}),
        ...(d.reference ? { reference: d.reference } : {}),
        ...(d.notes ? { notes: d.notes } : {}),
      },
    });
    await audit(tx, req.user!.id, "TECHNICIAN_PAY_RECORDED", "TechnicianPayment", payment.id, { amount, totalPaid, outstanding: n(payment.amount) - totalPaid, method: d.method, reference: d.reference });
    return { ...saved, paidAmount: totalPaid, outstanding: Math.max(0, n(saved.amount) - totalPaid) };
  });
  res.json(updated);
}));

financeOpsRoutes.get("/finance/technician-payments.csv", finance, ah(async (_req, res) => {
  const rows = await prisma.technicianPayment.findMany({
    include: { technician: { select: { name: true, email: true } } },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });
  const csvCell = (value: unknown) => {
    const raw = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    ["Technician", "Email", "Period start", "Period end", "Hours", "Rate", "Payable", "Paid", "Outstanding", "Payment date", "Method", "Reference", "Status", "Notes"].map(csvCell).join(","),
    ...rows.map((payment) => {
      const paid = payment.status === "PAID" && n(payment.paidAmount) === 0 ? n(payment.amount) : n(payment.paidAmount);
      return [
        payment.technician.name, payment.technician.email, payment.periodStart.toISOString().slice(0, 10),
        payment.periodEnd.toISOString().slice(0, 10), payment.hours, n(payment.rate), n(payment.amount), paid,
        Math.max(0, n(payment.amount) - paid), payment.paidAt?.toISOString().slice(0, 10), payment.paymentMethod,
        payment.reference, payment.status, payment.notes,
      ].map(csvCell).join(",");
    }),
  ];
  res.type("text/csv").attachment("technician-payment-records.csv").send(lines.join("\r\n"));
}));

financeOpsRoutes.get("/finance/subsidies", finance, ah(async (req, res) => {
  const query = z.object({
    search: z.string().trim().max(100).optional(),
    stage: subsidyStage.optional(),
  }).parse(req.query);
  const applications = await prisma.subsidy.findMany({
    where: {
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.search ? { OR: [
        { reference: { contains: query.search, mode: "insensitive" } },
        { order: { number: { contains: query.search, mode: "insensitive" } } },
        { order: { customer: { name: { contains: query.search, mode: "insensitive" } } } },
        { order: { customer: { phone: { contains: query.search } } } },
      ] } : {}),
    },
    include: {
      order: {
        include: {
          customer: true,
          quotation: { include: { enquiry: { select: { requestedKw: true, systemType: true } } } },
        },
      },
      attachments: { select: { id: true, name: true, mimeType: true, createdAt: true } },
    },
    orderBy: { applicationDate: "desc" },
  });
  res.json(applications);
}));

financeOpsRoutes.post("/finance/subsidies", finance, ah(async (req, res) => {
  const d = z.object({
    orderId: z.string().cuid(),
    reference: z.string().trim().max(100).optional(),
    claimed: z.coerce.number().min(0).max(100_000_000).default(0),
    requiredDocuments: z.array(z.string().trim().min(2).max(100)).min(1).max(30).default(["Customer identity proof", "System invoice", "Installation proof"]),
    notes: z.string().trim().max(2000).optional(),
    followUpAt: z.coerce.date().optional(),
  }).parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: d.orderId }, select: { id: true } });
    if (!order) throw new AppError(404, "Order not found");
    const existing = await tx.subsidy.findUnique({ where: { orderId: order.id }, select: { id: true } });
    if (existing) throw new AppError(409, "A subsidy application already exists for this order");
    const subsidy = await tx.subsidy.create({
      data: {
        orderId: order.id,
        reference: d.reference,
        claimed: d.claimed,
        requiredDocuments: [...new Set(d.requiredDocuments)],
        receivedDocuments: [],
        documents: [],
        notes: d.notes,
        followUpAt: d.followUpAt,
        stage: initialSubsidyStage,
        status: "PENDING",
      },
    });
    await audit(tx, req.user!.id, "SUBSIDY_APPLICATION_CREATED", "Subsidy", subsidy.id, { orderId: order.id });
    return subsidy;
  });
  res.status(201).json(created);
}));

financeOpsRoutes.patch("/finance/subsidies/:id", finance, ah(async (req, res) => {
  const d = z.object({
    reference: z.string().trim().max(100).nullable().optional(),
    claimed: z.coerce.number().min(0).max(100_000_000).optional(),
    received: z.coerce.number().min(0).max(100_000_000).optional(),
    requiredDocuments: z.array(z.string().trim().min(2).max(100)).max(30).optional(),
    receivedDocuments: z.array(z.string().trim().min(2).max(100)).max(30).optional(),
    stage: subsidyStage.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    followUpAt: z.coerce.date().nullable().optional(),
    applicationDate: z.coerce.date().optional(),
  }).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" }).parse(req.body);
  const saved = await prisma.$transaction(async (tx) => {
    const current = await tx.subsidy.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError(404, "Subsidy application not found");
    const claimed = d.claimed ?? n(current.claimed);
    const received = d.received ?? n(current.received);
    if (received > claimed && claimed !== 0) throw new AppError(400, "Received subsidy cannot exceed the claimed amount");
    const requiredDocuments = d.requiredDocuments ?? current.requiredDocuments;
    const receivedDocuments = d.receivedDocuments ?? current.receivedDocuments;
    if (receivedDocuments.some((document) => !requiredDocuments.includes(document))) throw new AppError(400, "Received documents must be in the required-document checklist");
    if (new Set(requiredDocuments).size !== requiredDocuments.length || new Set(receivedDocuments).size !== receivedDocuments.length) throw new AppError(400, "Document checklist cannot contain duplicates");
    const stage = d.stage ?? current.stage;
    if (d.stage && d.stage !== current.stage) {
      const transitionError = subsidyTransitionError(current.stage, d.stage);
      if (transitionError) throw new AppError(409, transitionError);
    }
    if (stage === "READY_FOR_SUBMISSION" && missingSubsidyDocuments(requiredDocuments, receivedDocuments).length) {
      throw new AppError(409, "Receive every required document before marking ready for submission");
    }
    if (d.received !== undefined && d.received > 0 && stage !== "APPROVED" && stage !== "REJECTED") {
      throw new AppError(409, "Record a received subsidy amount after approval");
    }
    const updated = await tx.subsidy.update({
      where: { id: current.id },
      data: {
        ...d,
        status: subsidyStageStatus(stage) as "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED",
        ...(d.stage === "SUBMITTED" ? { submittedAt: new Date() } : {}),
        ...(d.stage === "APPROVED" || d.stage === "REJECTED" ? { reviewedAt: new Date() } : {}),
      },
    });
    await audit(tx, req.user!.id, "SUBSIDY_APPLICATION_UPDATED", "Subsidy", current.id, {
      ...(d.stage ? { fromStage: current.stage, toStage: d.stage } : {}),
      changedFields: Object.keys(d),
    });
    return updated;
  });
  res.json(saved);
}));

financeOpsRoutes.post("/finance/subsidies/:id/documents", finance, ah(async (req, res) => {
  const d = z.object({
    name: z.string().trim().min(1).max(180),
    dataUrl: z.string().max(7_000_000).regex(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/]+={0,2}$/, "Upload a PDF, PNG, JPEG or WebP file"),
  }).parse(req.body);
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(d.dataUrl)!;
  const content = Buffer.from(match[2], "base64");
  if (!content.length || content.length > 5 * 1024 * 1024) throw new AppError(400, "Document must be between 1 byte and 5 MB");
  const document = await prisma.$transaction(async (tx) => {
    const subsidy = await tx.subsidy.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!subsidy) throw new AppError(404, "Subsidy application not found");
    const created = await tx.subsidyDocument.create({
      data: { subsidyId: subsidy.id, name: d.name, mimeType: match[1], content, uploadedById: req.user!.id },
      select: { id: true, name: true, mimeType: true, createdAt: true },
    });
    await audit(tx, req.user!.id, "SUBSIDY_DOCUMENT_UPLOADED", "SubsidyDocument", created.id, { subsidyId: subsidy.id, mimeType: created.mimeType });
    return created;
  });
  res.status(201).json(document);
}));

financeOpsRoutes.get("/finance/subsidies/:id/documents/:documentId", finance, ah(async (req, res) => {
  const document = await prisma.subsidyDocument.findFirst({
    where: { id: req.params.documentId, subsidyId: req.params.id },
    select: { name: true, mimeType: true, content: true },
  });
  if (!document) throw new AppError(404, "Subsidy document not found");
  const filename = document.name.replace(/[\r\n"\\/]/g, "_");
  res.type(document.mimeType).setHeader("Content-Disposition", `attachment; filename="${filename}"`).send(document.content);
}));

financeOpsRoutes.get("/finance/subsidies.csv", finance, ah(async (_req, res) => {
  const rows = await prisma.subsidy.findMany({
    include: {
      order: {
        include: {
          customer: true,
          quotation: { include: { enquiry: { select: { requestedKw: true, systemType: true } } } },
        },
      },
    },
    orderBy: { applicationDate: "desc" },
  });
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Application date", "Reference", "Order", "Customer", "Phone", "Capacity kW", "System type", "Stage", "Claimed", "Received", "Follow-up", "Remarks"].map(csvCell).join(","),
    ...rows.map((row) => [
      row.applicationDate.toISOString().slice(0, 10), row.reference, row.order.number, row.order.customer.name,
      row.order.customer.phone, row.order.quotation.enquiry.requestedKw, row.order.quotation.enquiry.systemType,
      row.stage, n(row.claimed), n(row.received), row.followUpAt?.toISOString().slice(0, 10), row.notes,
    ].map(csvCell).join(",")),
  ];
  res.type("text/csv").attachment("subsidy-applications.csv").send(lines.join("\r\n"));
}));