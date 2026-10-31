import { describe, it, expect } from "vitest";
import { addMonths, billTicket, isWarrantyActive, warrantyStatus } from "../src/lib/warranty";
import { bomQty, quoteTotals } from "../src/lib/bom";
import { jobFinancials } from "../src/lib/finance";

describe("warranty", () => {
  it("adds 24 and 240 months", () => {
    const d = new Date("2024-03-15T00:00:00Z");
    expect(addMonths(d, 24).toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(addMonths(d, 240).toISOString().slice(0, 10)).toBe("2044-03-15");
  });
  it("clamps month-end", () => expect(addMonths(new Date("2024-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2024-02-29"));
  it("active until end date, expired after", () => {
    const end = new Date("2026-03-15T00:00:00Z");
    expect(isWarrantyActive(end, new Date("2026-03-14T00:00:00Z"))).toBe(true);
    expect(warrantyStatus(end, new Date("2026-03-16T00:00:00Z"))).toBe("EXPIRED");
    expect(warrantyStatus(null)).toBe("NO_WARRANTY");
  });
  it("covered repair is free; expired repair is charged parts + labour + call-out", () => {
    expect(billTicket({ covered: true, partsCost: 6500, labourCost: 800, serviceCall: 1500 }).total).toBe(0);
    expect(billTicket({ covered: false, partsCost: 6500, labourCost: 800, serviceCall: 1500 }).total).toBe(8800);
  });
});
describe("bom + quotation", () => {
  it("scales per-kW and fixed quantities", () => {
    expect(bomQty({ productId: "p", fixedQty: 0, qtyPerKw: 2 }, 3)).toBe(6);
    expect(bomQty({ productId: "i", fixedQty: 1, qtyPerKw: 0 }, 3)).toBe(1);
    expect(bomQty({ productId: "x", fixedQty: 0, qtyPerKw: 0.1 }, 10)).toBe(1);
  });
  it("totals with tax and discount", () => {
    const t = quoteTotals([{ qty: 2, unitPrice: 1000, taxRate: 12 }, { qty: 1, unitPrice: 500, taxRate: 18 }], 250);
    expect(t.subtotal).toBe(2500);
    expect(t.total).toBe(2250 + t.tax);
    expect(t.tax).toBeCloseTo((2000 * 0.9 * 0.12) + (500 * 0.9 * 0.18), 2);
  });
  it("rejects discount above subtotal", () => expect(() => quoteTotals([{ qty: 1, unitPrice: 100, taxRate: 0 }], 101)).toThrow());
});
describe("finance", () => {
  it("does not double count advance + final", () => {
    const f = jobFinancials({ total: 100000, payments: [30000, 70000], items: [{ qty: 2, unitCost: 20000 }], labourHours: 6, labourRate: 500 });
    expect(f.collected).toBe(100000); expect(f.outstanding).toBe(0); expect(f.cost).toBe(43000); expect(f.estimatedProfit).toBe(57000);
  });
});
