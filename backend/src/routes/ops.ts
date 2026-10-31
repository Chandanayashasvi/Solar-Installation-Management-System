import { Router } from "express";
import { Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma, audit, n, nextNumber } from "../lib/db";
import { ah, AppError } from "../lib/errors";
import { allow } from "../middleware/auth";
import { addMonths } from "../lib/warranty";
import { config } from "../config";
import { receiptFingerprint } from "../lib/procurement";
export const opsRoutes = Router();

const serial = z.string().trim().toUpperCase().min(3).max(60).regex(/^[A-Z0-9][A-Z0-9\-_./]*$/, "Serial may contain letters, digits and - _ . /");

// ---- inventory ----
opsRoutes.get("/inventory", allow("WAREHOUSE", "SALES"), ah(async (_req, res) => {
  const ps = await prisma.product.findMany({ where: { isService: false }, include: { category: true }, orderBy: { name: "asc" } });
  res.json(ps.map((p) => ({ ...p, available: p.stock - p.reserved, low: p.stock - p.reserved <= p.lowStockLevel, value: n(p.cost) * p.stock })));
}));
opsRoutes.get("/inventory/movements", allow("WAREHOUSE"), ah(async (_req, res) => res.json(await prisma.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))));
opsRoutes.post("/inventory/receive", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({ productId: z.string(), qty: z.coerce.number().int().min(1).max(5000), unitCost: z.coerce.number().min(0).optional(), supplier: z.string().trim().max(100).optional(), serials: z.array(serial).default([]) }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id: d.productId } });
    if (!p || p.isService) throw new AppError(404, "Product not found");
    if (p.trackSerial) {
      if (d.serials.length !== d.qty) throw new AppError(400, `Provide exactly ${d.qty} serial number(s)`);
      if (new Set(d.serials).size !== d.serials.length) throw new AppError(400, "Duplicate serials in this request");
      const clash = await tx.asset.findMany({ where: { serial: { in: d.serials } }, select: { serial: true } });
      if (clash.length) throw new AppError(409, `Serial already exists: ${clash.map((c) => c.serial).join(", ")}`);
    } else if (d.serials.length) throw new AppError(400, "This product is not serial-tracked");
    const sup = d.supplier ? await tx.supplier.upsert({ where: { name: d.supplier }, update: {}, create: { name: d.supplier } }) : null;
    if (p.trackSerial) await tx.asset.createMany({ data: d.serials.map((s) => ({ serial: s, productId: p.id, supplierId: sup?.id })) });
    await tx.product.update({ where: { id: p.id }, data: { stock: { increment: d.qty }, ...(d.unitCost !== undefined ? { cost: d.unitCost } : {}) } });
    await tx.stockMovement.create({ data: { productId: p.id, type: "RECEIPT", qty: d.qty, unitCost: d.unitCost ?? p.cost, userId: req.user!.id, note: d.supplier } });
  });
  res.status(201).json({ ok: true });
}));
opsRoutes.get("/purchase-orders", allow("WAREHOUSE"), ah(async (_req, res) => {
  res.json(await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { supplier: true, items: { include: { product: { select: { id: true, sku: true, name: true, trackSerial: true } } } } },
  }));
}));
opsRoutes.post("/purchase-orders", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({
    supplier: z.string().trim().min(2).max(100),
    supplierPhone: z.string().trim().max(30).optional(),
    expectedAt: z.coerce.date().optional(),
    items: z.array(z.object({
      productId: z.string().cuid(),
      qty: z.coerce.number().int().min(1).max(5000),
      unitCost: z.coerce.number().min(0).max(100_000_000),
    })).min(1).max(100),
  }).superRefine((value, ctx) => {
    if (new Set(value.items.map((item) => item.productId)).size !== value.items.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each product may only appear once in a purchase order", path: ["items"] });
    }
  }).parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: d.items.map((item) => item.productId) }, active: true, isService: false }, select: { id: true } });
    if (products.length !== d.items.length) throw new AppError(400, "Every purchase order item must be an active stock product");
    const supplier = await tx.supplier.upsert({
      where: { name: d.supplier },
      update: d.supplierPhone ? { phone: d.supplierPhone } : {},
      create: { name: d.supplier, phone: d.supplierPhone },
    });
    let number = await nextNumber(tx, "purchase-order", "PO");
    while (await tx.purchaseOrder.findUnique({ where: { number }, select: { id: true } })) number = await nextNumber(tx, "purchase-order", "PO");
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: supplier.id,
        expectedAt: d.expectedAt,
        createdById: req.user!.id,
        items: { create: d.items },
      },
      include: { supplier: true, items: { include: { product: { select: { id: true, sku: true, name: true, trackSerial: true } } } } },
    });
    await audit(tx, req.user!.id, "PURCHASE_ORDER_CREATED", "PurchaseOrder", purchaseOrder.id, { number, itemCount: d.items.length });
    return purchaseOrder;
  });
  res.status(201).json(created);
}));
opsRoutes.post("/purchase-orders/:id/order", allow("WAREHOUSE"), ah(async (req, res) => {
  const purchaseOrder = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${req.params.id} FOR UPDATE`;
    const current = await tx.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!current) throw new AppError(404, "Purchase order not found");
    if (current.status === "ORDERED" || current.status === "PARTIALLY_RECEIVED") return current;
    if (current.status !== "DRAFT") throw new AppError(409, `Cannot order a purchase order in ${current.status} status`);
    const updated = await tx.purchaseOrder.update({ where: { id: current.id }, data: { status: "ORDERED", orderedAt: new Date() } });
    await audit(tx, req.user!.id, "PURCHASE_ORDER_PLACED", "PurchaseOrder", current.id);
    return updated;
  });
  res.json(purchaseOrder);
}));
opsRoutes.post("/purchase-orders/:id/items/:itemId/receive", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({
    qty: z.coerce.number().int().min(1).max(5000),
    serials: z.array(serial).max(5000).default([]),
    idempotencyKey: z.string().trim().min(8).max(100),
  }).parse(req.body);
  const receiptNote = `purchase-order-item:${req.params.itemId}:${receiptFingerprint(d.serials)}`;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${req.params.id} FOR UPDATE`;
    const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
    if (existing) {
      if (existing.purchaseOrderId !== req.params.id || existing.note !== receiptNote || existing.qty !== d.qty) {
        throw new AppError(409, "This receipt key was already used for a different receipt");
      }
      return { duplicate: true, purchaseOrderId: req.params.id };
    }
    const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!purchaseOrder) throw new AppError(404, "Purchase order not found");
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) throw new AppError(409, "Only an ordered purchase order can receive stock");
    const item = await tx.purchaseOrderItem.findFirst({
      where: { id: req.params.itemId, purchaseOrderId: purchaseOrder.id },
      include: { product: true },
    });
    if (!item) throw new AppError(404, "Purchase order item not found");
    const remaining = item.qty - item.receivedQty;
    if (d.qty > remaining) throw new AppError(409, `Receipt exceeds remaining quantity (${remaining})`);
    if (item.product.trackSerial) {
      if (d.serials.length !== d.qty) throw new AppError(400, `Provide exactly ${d.qty} serial number(s)`);
      if (new Set(d.serials).size !== d.serials.length) throw new AppError(400, "Duplicate serials in this request");
      const conflicts = await tx.asset.findMany({ where: { serial: { in: d.serials } }, select: { serial: true } });
      if (conflicts.length) throw new AppError(409, `Serial already exists: ${conflicts.map((asset) => asset.serial).join(", ")}`);
    } else if (d.serials.length) {
      throw new AppError(400, "This product is not serial-tracked");
    }
    const supplier = await tx.supplier.findUnique({ where: { id: purchaseOrder.supplierId } });
    if (item.product.trackSerial) {
      await tx.asset.createMany({
        data: d.serials.map((serialNumber) => ({ serial: serialNumber, productId: item.productId, supplierId: supplier?.id })),
      });
    }
    const updatedItem = await tx.purchaseOrderItem.update({
      where: { id: item.id },
      data: { receivedQty: { increment: d.qty } },
    });
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: d.qty }, cost: item.unitCost },
    });
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        type: "RECEIPT",
        qty: d.qty,
        unitCost: item.unitCost,
        purchaseOrderId: purchaseOrder.id,
        idempotencyKey: d.idempotencyKey,
        note: receiptNote,
        userId: req.user!.id,
      },
    });
    const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id }, select: { qty: true, receivedQty: true } });
    const allReceived = allItems.every((purchaseItem) => purchaseItem.receivedQty === purchaseItem.qty);
    const anyReceived = allItems.some((purchaseItem) => purchaseItem.receivedQty > 0);
    const status = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED";
    await tx.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: { status, ...(allReceived ? { receivedAt: new Date() } : {}) },
    });
    await audit(tx, req.user!.id, "PURCHASE_ORDER_RECEIPT", "PurchaseOrder", purchaseOrder.id, { itemId: item.id, qty: d.qty, receiptKey: d.idempotencyKey });
    return { duplicate: false, purchaseOrderId: purchaseOrder.id, item: updatedItem, status };
  }).catch(async (error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.stockMovement.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
      if (existing) {
        if (existing.purchaseOrderId !== req.params.id || existing.note !== receiptNote || existing.qty !== d.qty) {
          throw new AppError(409, "This receipt key was already used for a different receipt");
        }
        return { duplicate: true, purchaseOrderId: req.params.id };
      }
      const conflicts = await prisma.asset.findMany({ where: { serial: { in: d.serials } }, select: { serial: true } });
      if (conflicts.length) throw new AppError(409, `Serial already exists: ${conflicts.map((asset) => asset.serial).join(", ")}`);
    }
    throw error;
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));
opsRoutes.post("/inventory/damage", allow("WAREHOUSE"), ah(async (req, res) => {
  const d = z.object({ serial: serial.optional(), productId: z.string().optional(), qty: z.coerce.number().int().min(1).default(1), note: z.string().trim().min(3).max(300) }).refine((v) => v.serial || v.productId, { message: "Provide a serial or a product" }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    let productId = d.productId!, qty = d.qty;
    if (d.serial) {
      const a = await tx.asset.findUnique({ where: { serial: d.serial } });
      if (!a || a.status !== "IN_STOCK") throw new AppError(409, "Only in-stock serials can be written off");
      await tx.asset.update({ where: { id: a.id }, data: { status: "DAMAGED" } }); productId = a.productId; qty = 1;
    }
    const p = await tx.product.findUnique({ where: { id: productId } });
    if (!p || p.stock - p.reserved < qty) throw new AppError(409, "Not enough available stock to write off");
    await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: qty } } });
    await tx.stockMovement.create({ data: { productId: p.id, type: "DAMAGE", qty, serial: d.serial, note: d.note, userId: req.user!.id } });
  });
  res.json({ ok: true });
}));

// ---- dispatch ----
opsRoutes.get("/orders/:id/dispatch-checklist", allow("WAREHOUSE"), ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!o) throw new AppError(404, "Order not found");
  const ps = await prisma.product.findMany({ where: { id: { in: o.items.map((i) => i.productId) }, isService: false } });
  res.json({ status: o.status, items: ps.map((p) => ({ productId: p.id, name: p.name, qty: o.items.find((i) => i.productId === p.id)!.qty, trackSerial: p.trackSerial, available: p.stock })) });
}));
opsRoutes.post("/orders/:id/dispatch", allow("WAREHOUSE"), ah(async (req, res) => {
  const { serials } = z.object({ serials: z.record(z.string(), z.array(serial)).default({}) }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${req.params.id} FOR UPDATE`;
    const o = await tx.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!o) throw new AppError(404, "Order not found");
    if (o.status !== "CONFIRMED") throw new AppError(409, o.status === "PENDING_ADVANCE" ? "Advance payment not recorded – cannot dispatch" : `Order is ${o.status}`);
    const all = Object.values(serials).flat();
    if (new Set(all).size !== all.length) throw new AppError(400, "The same serial was scanned twice");
    for (const it of o.items) {
      const p = await tx.product.findUnique({ where: { id: it.productId } });
      if (!p || p.isService) continue;
      if (p.stock < it.qty) throw new AppError(409, `Insufficient stock for ${p.name} (have ${p.stock}, need ${it.qty})`);
      if (p.trackSerial) {
        const list = serials[p.id] ?? [];
        if (list.length !== it.qty) throw new AppError(400, `Scan exactly ${it.qty} serial(s) for ${p.name}`);
        const found = await tx.asset.findMany({ where: { serial: { in: list } } });
        for (const s of list) {
          const a = found.find((f) => f.serial === s);
          if (!a) throw new AppError(409, `Serial ${s} is not in inventory`);
          if (a.productId !== p.id) throw new AppError(409, `Serial ${s} belongs to a different product`);
          if (a.status !== "IN_STOCK") throw new AppError(409, `Serial ${s} is already ${a.status}`);
        }
        await tx.asset.updateMany({ where: { serial: { in: list } }, data: { status: "DISPATCHED", orderId: o.id } });
        await tx.stockMovement.createMany({ data: list.map((s) => ({ productId: p.id, type: "DISPATCH" as const, qty: 1, orderId: o.id, serial: s, userId: req.user!.id })) });
      } else await tx.stockMovement.create({ data: { productId: p.id, type: "DISPATCH", qty: it.qty, orderId: o.id, userId: req.user!.id } });
      await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: it.qty }, reserved: { decrement: Math.min(it.qty, p.reserved) } } });
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "DISPATCHED", dispatchedAt: new Date(), dispatchedById: req.user!.id } });
    await audit(tx, req.user!.id, "DISPATCH", "Order", o.id);
  });
  res.json({ ok: true });
}));
// Delivery confirmation starts the warranty clock for every covered item, automatically.
opsRoutes.post("/orders/:id/deliver", allow("WAREHOUSE"), ah(async (req, res) => {
  const out = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: req.params.id }, include: { assets: true, items: true } });
    if (!o) throw new AppError(404, "Order not found");
    if (o.status !== "DISPATCHED") throw new AppError(409, `Order must be DISPATCHED (now ${o.status})`);
    const at = new Date(); let started = 0;
    const policies = await tx.warrantyPolicy.findMany({ include: { product: true } });
    for (const a of o.assets) {
      const pol = policies.find((p) => p.productId === a.productId); if (!pol) continue;
      await tx.warranty.create({ data: { assetId: a.id, policyId: pol.id, customerId: o.customerId, startsAt: at, endsAt: addMonths(at, pol.months) } }); started++;
    }
    // Non-serialised covered goods (e.g. panels) get one lot record per order so they can still be looked up.
    for (const pol of policies.filter((p) => !p.product.trackSerial && o.items.some((i) => i.productId === p.productId))) {
      const lot = await tx.asset.create({ data: { serial: `LOT-${o.number}-${pol.product.sku}`, productId: pol.productId, status: "DISPATCHED", orderId: o.id } });
      await tx.warranty.create({ data: { assetId: lot.id, policyId: pol.id, customerId: o.customerId, startsAt: at, endsAt: addMonths(at, pol.months) } }); started++;
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "DELIVERED", deliveredAt: at } });
    return started;
  });
  res.json({ ok: true, warrantiesStarted: out });
}));

// ---- installation jobs ----
opsRoutes.get("/jobs", allow("TECHNICIAN", "SALES"), ah(async (req, res) => {
  const where = req.user!.role === "TECHNICIAN" ? { technicianId: req.user!.id } : {};
  res.json(await prisma.installationJob.findMany({ where, orderBy: { scheduledFor: "asc" }, include: { order: { include: { customer: true, items: true } } } }));
}));
const dataUrl = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
function savePhoto(jobId: string, i: number, url: string) {
  const m = dataUrl.exec(url); if (!m) throw new AppError(400, "Photos must be PNG, JPEG or WebP");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 5 * 1024 * 1024) throw new AppError(400, "Each photo must be under 5 MB");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const name = `job-${jobId}-${i}-${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(config.UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
opsRoutes.post("/jobs/:id/complete", allow("TECHNICIAN"), ah(async (req, res) => {
  const d = z.object({ startedAt: z.coerce.date(), finishedAt: z.coerce.date(), systemKw: z.coerce.number().min(0.5).max(10), testPassed: z.literal(true, { errorMap: () => ({ message: "Power-generation test must pass" }) }),
    checklist: z.object({ mounting: z.literal(true), wiring: z.literal(true), safety: z.literal(true), earthing: z.literal(true) }, { errorMap: () => ({ message: "Complete every checklist item" }) }),
    signature: z.string().startsWith("data:image/").max(500_000), photos: z.array(z.string()).min(1, "Upload at least one site photo").max(6) })
    .refine((v) => v.finishedAt > v.startedAt, { message: "Finish must be after start", path: ["finishedAt"] }).parse(req.body);
  const job = await prisma.installationJob.findUnique({ where: { id: req.params.id }, include: { order: true } });
  if (!job) throw new AppError(404, "Job not found");
  if (req.user!.role === "TECHNICIAN" && job.technicianId !== req.user!.id) throw new AppError(403, "This job is assigned to another technician");
  if (job.status === "COMPLETED") throw new AppError(409, "Job already completed");
  if (job.order.status !== "DELIVERED") throw new AppError(409, "Equipment has not been delivered yet");
  const paths = d.photos.map((p, i) => savePhoto(job.id, i, p));
  await prisma.$transaction([
    prisma.installationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", startedAt: d.startedAt, finishedAt: d.finishedAt, hours: (d.finishedAt.getTime() - d.startedAt.getTime()) / 3_600_000, systemKw: d.systemKw, testPassed: true, checklist: d.checklist, photos: paths, customerSignature: d.signature, completedAt: new Date() } }),
    prisma.order.update({ where: { id: job.orderId }, data: { status: "INSTALLED" } }),
    prisma.asset.updateMany({ where: { orderId: job.orderId, status: "DISPATCHED" }, data: { status: "INSTALLED" } }),
  ]);
  res.json({ ok: true });
}));
