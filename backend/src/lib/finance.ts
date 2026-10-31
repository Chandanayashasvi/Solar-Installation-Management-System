import { round2 } from "./warranty";
/** Each payment row is counted once. Advance + final are separate rows, never re-added. */
export function jobFinancials(o: { total: number; payments: number[]; items: { qty: number; unitCost: number }[]; labourHours: number; labourRate: number }) {
  const collected = round2(o.payments.reduce((s, p) => s + p, 0));
  const materialCost = round2(o.items.reduce((s, i) => s + i.qty * i.unitCost, 0));
  const labourCost = round2(o.labourHours * o.labourRate);
  const cost = round2(materialCost + labourCost);
  return { invoiced: o.total, collected, outstanding: round2(Math.max(0, o.total - collected)), materialCost, labourCost, cost, estimatedProfit: round2(o.total - cost) };
}
