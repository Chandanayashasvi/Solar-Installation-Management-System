import { round2 } from "./warranty";
export interface BomRule { productId: string; fixedQty: number; qtyPerKw: number }
/** qty = fixed + ceil(perKw * kW). The epsilon avoids 1.0000000002 rounding up. */
export const bomQty = (r: BomRule, kw: number) => r.fixedQty + Math.ceil(r.qtyPerKw * kw - 1e-9);
export interface Line { qty: number; unitPrice: number; taxRate: number }
/** Discount is spread proportionally across lines so tax is charged on the discounted amount. */
export function quoteTotals(lines: Line[], discount: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  if (discount < 0 || discount > subtotal) throw new RangeError("Discount must be between 0 and the subtotal");
  const f = subtotal === 0 ? 0 : discount / subtotal;
  const tax = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - f) * (l.taxRate / 100), 0));
  return { subtotal, discount: round2(discount), tax, total: round2(subtotal - discount + tax) };
}
