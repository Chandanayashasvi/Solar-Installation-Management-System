// Idempotent demo seed. All names, phones and prices are FICTIONAL / ILLUSTRATIVE.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { bomQty, quoteTotals } from "../src/lib/bom";
import { addMonths } from "../src/lib/warranty";
const prisma = new PrismaClient();
const PASSWORD = "Demo@12345"; // demo-only credential
const monthsAgo = (m: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d; };

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = [["admin", "Director Demo", "ADMIN"], ["sales", "Sales Demo", "SALES"], ["surveyor", "Surveyor Demo", "SURVEYOR"], ["store", "Warehouse Demo", "WAREHOUSE"], ["tech", "Technician Demo", "TECHNICIAN"], ["support", "Support Demo", "SUPPORT"], ["finance", "Finance Demo", "FINANCE"]] as const;
  for (const [u, name, role] of users) await prisma.user.upsert({ where: { email: `${u}@sunpower.demo` }, update: {}, create: { email: `${u}@sunpower.demo`, name, role, passwordHash: hash } });

  const cats: Record<string, string> = {};
  for (const c of ["Panels", "Inverters", "Batteries", "Controllers", "Mounting", "Electrical", "Services"]) cats[c] = (await prisma.category.upsert({ where: { name: c }, update: {}, create: { name: c } })).id;
  type P = [sku: string, name: string, cat: string, price: number, cost: number, tax: number, serial: boolean, stock: number, low: number, warrantyMonths?: number];
  const catalog: P[] = [
    ["PANEL-540", "Solar Panel 540W", "Panels", 9000, 7500, 12, false, 120, 20, 240],
    ...[1, 2, 3, 4, 5].map((k): P => [`INV-${k}KW`, `Solar Inverter ${k} kW`, "Inverters", 12000 * k, 9000 * k, 12, true, 0, 1, 24]),
    ["BAT-150", "Battery 150Ah", "Batteries", 28000, 22000, 18, true, 0, 2, 24],
    ["CC-MPPT", "Battery Charge Controller", "Controllers", 4000, 3000, 12, true, 0, 2, 24],
    ["STAND-KW", "Metal Stand Set (per kW)", "Mounting", 3000, 2200, 18, false, 60, 10],
    ["BOX-WIRING", "Wiring / Switch Box", "Electrical", 2500, 1800, 18, false, 30, 5],
    ["EARTH-KIT", "Safety Earthing Kit", "Electrical", 1500, 1000, 18, false, 30, 5],
    ["CABLE-DC", "DC Cable & Connectors (per kW)", "Electrical", 1200, 900, 18, false, 80, 10],
    ["INSTALL-SVC", "Installation Service", "Services", 0, 0, 18, false, 0, 0],
  ];
  const prod: Record<string, string> = {};
  for (const [sku, name, cat, price, cost, tax, serial, stock, low, wm] of catalog) {
    const isService = sku === "INSTALL-SVC";
    const ex = await prisma.product.findUnique({ where: { sku } });
    const p = ex ?? (await prisma.product.create({ data: { sku, name, categoryId: cats[cat], price, cost, taxRate: tax, trackSerial: serial, isService, stock, lowStockLevel: low } }));
    prod[sku] = p.id;
    if (!ex && stock > 0) await prisma.stockMovement.create({ data: { productId: p.id, type: "RECEIPT", qty: stock, unitCost: cost, note: "Opening stock (demo)" } });
    if (wm) await prisma.warrantyPolicy.upsert({ where: { productId: p.id }, update: {}, create: { productId: p.id, months: wm, name: `${name} warranty` } });
  }
  // serial-numbered stock
  const supplier = await prisma.supplier.upsert({ where: { name: "Demo Solar Distributors" }, update: {}, create: { name: "Demo Solar Distributors" } });
  const stockSerials: [string, number][] = [["INV-1KW", 2], ["INV-2KW", 3], ["INV-3KW", 4], ["INV-4KW", 2], ["INV-5KW", 2], ["BAT-150", 10], ["CC-MPPT", 12]];
  for (const [sku, qty] of stockSerials) {
    const prefix = sku.replace(/[^A-Z0-9]/g, "");
    if (await prisma.asset.count({ where: { productId: prod[sku], serial: { startsWith: `${prefix}-S` } } })) continue; // keeps re-seeding idempotent
    await prisma.asset.createMany({ data: Array.from({ length: qty }, (_, i) => ({ serial: `${prefix}-S${String(i + 1).padStart(4, "0")}`, productId: prod[sku], supplierId: supplier.id })), skipDuplicates: true });
    const p = (await prisma.product.findUnique({ where: { id: prod[sku] } }))!;
    await prisma.product.update({ where: { id: p.id }, data: { stock: { increment: qty } } });
    await prisma.stockMovement.create({ data: { productId: p.id, type: "RECEIPT", qty, unitCost: p.cost, note: "Serial stock (demo)" } });
  }
  // packages + BOM
  const pkgDefs: { name: string; type: "ON_GRID" | "OFF_GRID" | "PANEL_SET"; kw: number }[] = [];
  for (const kw of [1, 2, 3, 4, 5]) pkgDefs.push({ name: `On-Grid ${kw} kW`, type: "ON_GRID", kw }, { name: `Off-Grid ${kw} kW`, type: "OFF_GRID", kw }, { name: `Solar Panel Set ${kw} kW`, type: "PANEL_SET", kw });
  for (const d of pkgDefs) {
    if (await prisma.package.findUnique({ where: { name: d.name } })) continue;
    const items = [{ p: "PANEL-540", f: 0, k: 2 }, { p: "CABLE-DC", f: 0, k: 1 }];
    if (d.type !== "PANEL_SET") items.push({ p: `INV-${d.kw}KW`, f: 1, k: 0 }, { p: "CC-MPPT", f: 1, k: 0 }, { p: "STAND-KW", f: 0, k: 1 }, { p: "BOX-WIRING", f: 1, k: 0 }, { p: "EARTH-KIT", f: 1, k: 0 });
    if (d.type === "OFF_GRID") items.push({ p: "BAT-150", f: 0, k: 1 });
    await prisma.package.create({ data: { name: d.name, systemType: d.type, capacityKw: d.kw, installationCharge: d.type === "PANEL_SET" ? 0 : 8000 * d.kw, items: { create: items.map((i) => ({ productId: prod[i.p], fixedQty: i.f, qtyPerKw: i.k })) } } });
  }

  // ---- demo business history (skipped if already present) ----
  if (await prisma.customer.findUnique({ where: { phone: "9000000001" } })) { console.log("Seed: demo history already present – skipped."); return; }
  const sales = (await prisma.user.findUnique({ where: { email: "sales@sunpower.demo" } }))!;
  const tech = (await prisma.user.findUnique({ where: { email: "tech@sunpower.demo" } }))!;
  const policies = await prisma.warrantyPolicy.findMany();
  let seq = 0;

  async function installed(phone: string, name: string, address: string, pkgName: string, monthsSinceDelivery: number, serials: Record<string, string>, payFull: boolean) {
    const pkg = await prisma.package.findUniqueOrThrow({ where: { name: pkgName }, include: { items: { include: { product: true } } } });
    const cust = await prisma.customer.create({ data: { name, phone, address } });
    const enq = await prisma.enquiry.create({ data: { customerId: cust.id, requestedKw: pkg.capacityKw, systemType: pkg.systemType, monthlyBill: 2500, subsidyRequirement: "YES", isDemo: true, status: "WON", source: "WEB", createdAt: monthsAgo(monthsSinceDelivery + 2) } });
    await prisma.survey.create({ data: { enquiryId: enq.id, roofArea: 40, shadowFreeArea: 28, direction: "South", tilt: 18, cableDistance: 15, monthlyBill: 4200, gridSuitable: true, status: "APPROVED", technicianId: tech.id, decidedAt: monthsAgo(monthsSinceDelivery + 1) } });
    const lines = pkg.items.map((i) => ({ productId: i.productId, description: i.product.name, qty: bomQty({ productId: i.productId, fixedQty: i.fixedQty, qtyPerKw: Number(i.qtyPerKw) }, pkg.capacityKw), unitPrice: Number(i.product.price), taxRate: Number(i.product.taxRate) }));
    lines.push({ productId: prod["INSTALL-SVC"], description: `Installation – ${pkg.capacityKw} kW`, qty: 1, unitPrice: Number(pkg.installationCharge), taxRate: 18 });
    const t = quoteTotals(lines, 0); seq++;
    const q = await prisma.quotation.create({ data: { number: `QT-DEMO-${seq}`, enquiryId: enq.id, packageName: pkg.name, version: 1, status: "ACCEPTED", ...t, validUntil: monthsAgo(monthsSinceDelivery - 1), createdById: sales.id, createdAt: monthsAgo(monthsSinceDelivery + 1), items: { create: lines.map((l) => ({ ...l, lineTotal: l.qty * l.unitPrice })) } } });
    const delivered = monthsAgo(monthsSinceDelivery);
    const order = await prisma.order.create({ data: { number: `ORD-DEMO-${seq}`, quotationId: q.id, customerId: cust.id, status: "INSTALLED", total: t.total, requiredAdvance: Math.round(t.total * 0.3), deliveredAt: delivered, dispatchedAt: delivered, createdAt: monthsAgo(monthsSinceDelivery + 1),
      items: { create: lines.map((l) => ({ productId: l.productId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, unitCost: Number(pkg.items.find((i) => i.productId === l.productId)?.product.cost ?? 0) })) } } });
    await prisma.payment.createMany({ data: payFull ? [{ orderId: order.id, amount: Math.round(t.total * 0.3), kind: "ADVANCE", method: "UPI", idempotencyKey: `demo-adv-${seq}`, recordedById: sales.id, paidAt: monthsAgo(monthsSinceDelivery + 1) }, { orderId: order.id, amount: t.total - Math.round(t.total * 0.3), kind: "FINAL", method: "BANK_TRANSFER", idempotencyKey: `demo-fin-${seq}`, recordedById: sales.id, paidAt: delivered }] : [{ orderId: order.id, amount: Math.round(t.total * 0.3), kind: "ADVANCE", method: "UPI", idempotencyKey: `demo-adv-${seq}`, recordedById: sales.id, paidAt: monthsAgo(monthsSinceDelivery + 1) }] });
    await prisma.installationJob.create({ data: { orderId: order.id, technicianId: tech.id, scheduledFor: delivered, status: "COMPLETED", startedAt: delivered, finishedAt: new Date(delivered.getTime() + 6 * 3600_000), hours: 6, systemKw: pkg.capacityKw, testPassed: true, checklist: { mounting: true, wiring: true, safety: true, earthing: true }, photos: [], completedAt: delivered } });
    const out: Record<string, string> = {};
    for (const [sku, serial] of Object.entries(serials)) {
      const a = await prisma.asset.create({ data: { serial, productId: prod[sku], status: "INSTALLED", orderId: order.id, supplierId: supplier.id } });
      const pol = policies.find((p) => p.productId === prod[sku])!;
      await prisma.warranty.create({ data: { assetId: a.id, policyId: pol.id, customerId: cust.id, startsAt: delivered, endsAt: addMonths(delivered, pol.months) } }); out[sku] = a.id;
    }
    const lot = await prisma.asset.create({ data: { serial: `LOT-${order.number}-PANEL-540`, productId: prod["PANEL-540"], status: "INSTALLED", orderId: order.id } });
    const pp = policies.find((p) => p.productId === prod["PANEL-540"])!;
    await prisma.warranty.create({ data: { assetId: lot.id, policyId: pp.id, customerId: cust.id, startsAt: delivered, endsAt: addMonths(delivered, pp.months) } });
    await prisma.subsidy.create({ data: { orderId: order.id, status: payFull ? "PAID" : "SUBMITTED", reference: `SUB-DEMO-${seq}`, claimed: 78000, received: payFull ? 78000 : 0, documents: ["aadhaar-copy", "electricity-bill"] } });
    return { order, cust, assets: out };
  }
  const a = await installed("9000000001", "Ravi Kumar (demo)", "Plot 12, Demo Colony, Hyderabad", "On-Grid 3 kW", 30, { "INV-3KW": "DEMO-INV3-0001", "CC-MPPT": "DEMO-CC-0001" }, true);
  const b = await installed("9000000002", "Anita Rao (demo)", "Flat 4B, Sample Heights, Hyderabad", "Off-Grid 2 kW", 3, { "INV-2KW": "DEMO-INV2-0001", "BAT-150": "DEMO-BAT-0001", "CC-MPPT": "DEMO-CC-0002" }, false);
  const mk = async (assetId: string, customerId: string, num: string, complaint: string, fault: string, createdAt: Date, parts: number, labour: number, covered: boolean, status: "CLOSED" | "OPEN") =>
    prisma.ticket.create({ data: { number: num, assetId, customerId, complaint, faultCode: fault, covered: status === "OPEN" ? null : covered, partsCost: parts, labourCost: labour, billedAmount: status === "OPEN" || covered ? 0 : parts + labour + 1500, status, createdAt, resolvedAt: status === "CLOSED" ? createdAt : null, customerConfirmedAt: status === "CLOSED" ? createdAt : null } });
  await mk(a.assets["INV-3KW"], a.cust.id, "TKT-DEMO-1", "No output after rain, display blank", "E04", monthsAgo(1), 6500, 800, false, "CLOSED");
  await mk(b.assets["INV-2KW"], b.cust.id, "TKT-DEMO-2", "Inverter shows fault code and zero power", "F21", new Date(), 0, 0, true, "OPEN");

  // pipeline examples
  const s = await prisma.customer.create({ data: { name: "Suresh Reddy (demo)", phone: "9000000003", address: "H.No 8-2, Demo Nagar, Secunderabad" } });
  const e1 = await prisma.enquiry.create({ data: { customerId: s.id, requestedKw: 3, systemType: "ON_GRID", monthlyBill: 5100, subsidyRequirement: "YES", isDemo: true, status: "QUALIFIED", source: "CALL", notes: "Demo enquiry — requests subsidy guidance" } });
  await prisma.survey.create({ data: { enquiryId: e1.id, roofArea: 36, shadowFreeArea: 30, direction: "South-West", tilt: 15, cableDistance: 18, monthlyBill: 5100, gridSuitable: true, status: "APPROVED", technicianId: tech.id, decidedAt: new Date() } });
  const m = await prisma.customer.create({ data: { name: "Meena Iyer (demo)", phone: "9000000004", address: "Road 5, Sample Layout, Hyderabad" } });
  await prisma.enquiry.create({ data: { customerId: m.id, requestedKw: 5, systemType: "OFF_GRID", monthlyBill: 7200, subsidyRequirement: "GUIDANCE", isDemo: true, status: "NEW", source: "WEB" } });
  const k = await prisma.customer.create({ data: { name: "Karthik N (demo)", phone: "9000000005", address: "Villa 22, Demo Gardens, Hyderabad" } });
  const e3 = await prisma.enquiry.create({ data: { customerId: k.id, requestedKw: 2, systemType: "ON_GRID", monthlyBill: 2800, subsidyRequirement: "NO", isDemo: true, status: "SURVEY_SCHEDULED", source: "WHATSAPP" } });
  await prisma.survey.create({ data: { enquiryId: e3.id, roofArea: 24, shadowFreeArea: 14, direction: "East", tilt: 10, cableDistance: 25, monthlyBill: 2800, gridSuitable: true, status: "PENDING", technicianId: tech.id } });
  console.log("Seed complete. Demo logins: <role>@sunpower.demo (admin, sales, store, tech, support) / " + PASSWORD);
}
main().finally(() => prisma.$disconnect());
