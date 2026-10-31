/** Add calendar months (UTC), clamping the day (31 Jan + 1 month -> 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const day = d.getUTCDate();
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}
export const isWarrantyActive = (endsAt: Date, at: Date = new Date()) => at.getTime() <= endsAt.getTime();
export const warrantyStatus = (endsAt: Date | null | undefined, at = new Date()) => (!endsAt ? "NO_WARRANTY" : isWarrantyActive(endsAt, at) ? "ACTIVE" : "EXPIRED");
export const daysLeft = (endsAt: Date, at = new Date()) => Math.ceil((endsAt.getTime() - at.getTime()) / 86_400_000);
export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Covered repairs cost the customer nothing. Chargeable = parts + labour + call-out. */
export function billTicket(o: { covered: boolean; partsCost: number; labourCost: number; serviceCall: number }) {
  if (o.covered) return { covered: true, partsCharge: 0, labourCharge: 0, serviceCall: 0, total: 0 };
  return { covered: false, partsCharge: o.partsCost, labourCharge: o.labourCost, serviceCall: o.serviceCall, total: round2(o.partsCost + o.labourCost + o.serviceCall) };
}
