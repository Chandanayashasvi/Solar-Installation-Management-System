import { useParams } from "react-router-dom";
import { api, dt, inr } from "../api";
import { Btn, Skeleton, useLoad } from "../ui";
export default function Quote() {
  const { id } = useParams(); const { data: q, loading, err } = useLoad(() => api(`/quotations/${id}`), [id]);
  if (loading) return <Skeleton />; if (err || !q) return <p className="text-red-600">{err}</p>;
  return (<div className="mx-auto max-w-3xl rounded-xl border bg-white p-6">
    <div className="no-print mb-4 text-right"><Btn onClick={() => window.print()}>Print / Save as PDF</Btn></div>
    <h1 className="text-2xl font-bold text-solar-800">SunPower Solutions — Quotation {q.number} (v{q.version})</h1>
    <p className="mt-1 text-sm text-slate-600">For {q.enquiry.customer.name}, {q.enquiry.customer.address} · {q.packageName} · valid until {dt(q.validUntil)}</p>
    <table className="mt-4 w-full text-sm"><thead><tr className="border-b text-left"><th>Item</th><th>Qty</th><th className="text-right">Unit price</th><th className="text-right">Tax %</th><th className="text-right">Amount</th></tr></thead>
      <tbody>{q.items.map((i: any) => <tr key={i.id} className="border-b"><td className="py-1">{i.description}</td><td>{i.qty}</td><td className="text-right">{inr(i.unitPrice)}</td><td className="text-right">{i.taxRate}</td><td className="text-right">{inr(i.lineTotal)}</td></tr>)}</tbody></table>
    <dl className="ml-auto mt-4 w-64 space-y-1 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(q.subtotal)}</dd></div><div className="flex justify-between"><dt>Discount</dt><dd>−{inr(q.discount)}</dd></div><div className="flex justify-between"><dt>Tax</dt><dd>{inr(q.tax)}</dd></div><div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Total</dt><dd>{inr(q.total)}</dd></div></dl>
    <p className="mt-6 text-xs text-slate-400">Prices are illustrative demo values.</p></div>);
}
