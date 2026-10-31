import { round2 } from "./warranty";
/** Each payment row is counted once. Advance + final are separate rows, never re-added. */
export function jobFinancials(o: { total: number; invoiceTotal?: number; payments: number[]; items: { qty: number; unitCost: number }[]; labourHours: number; labourRate: number; projectExpenses?: number }) {
  const collected = round2(o.payments.reduce((s, p) => s + p, 0));
  const materialCost = round2(o.items.reduce((s, i) => s + i.qty * i.unitCost, 0));
  const labourCost = round2(o.labourHours * o.labourRate);
  const expenses = round2(o.projectExpenses ?? 0);
  const invoiced = round2(o.invoiceTotal ?? o.total);
  const cost = round2(materialCost + labourCost + expenses);
  return { orderValue: o.total, invoiced, collected, outstanding: round2(Math.max(0, o.total - collected)), invoiceOutstanding: round2(Math.max(0, invoiced - collected)), materialCost, labourCost, expenses, cost, estimatedProfit: round2(o.total - cost) };
}
