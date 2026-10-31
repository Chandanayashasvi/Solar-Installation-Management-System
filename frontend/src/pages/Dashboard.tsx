import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { api, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Skeleton, Th, useLoad } from "../ui";
const Kpi = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{hint && <p className="text-xs text-slate-400">{hint}</p>}</div>;
export default function Dashboard() {
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to: to + "T23:59:59" }) }).toString();
  const { data: d, loading, err } = useLoad(() => api("/reports/dashboard?" + qs), [qs]);
  const csv = () => run(async () => { const b: Blob = await api("/reports/jobs.csv?" + qs, { raw: true }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "job-profitability.csv"; a.click(); });
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-xl font-bold">Business overview</h1>
      <div className="flex items-end gap-2 text-sm"><label>From <input type="date" className="rounded border px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To <input type="date" className="rounded border px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} /></label><Btn kind="ghost" onClick={csv}><Download size={14} className="mr-1 inline" />CSV</Btn></div></div>
    {err && <p className="text-red-600">{err}</p>}{loading || !d ? <Skeleton /> : (<>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Enquiries" value={d.funnel.enquiries} hint={`${d.funnel.conversionPct}% won`} /><Kpi label="Quotes awaiting" value={d.pipeline.quotesAwaitingAcceptance} />
        <Kpi label="Awaiting dispatch" value={d.pipeline.ordersAwaitingDispatch} /><Kpi label="Open tickets" value={d.pipeline.openTickets} />
        <Kpi label="Invoiced" value={inr(d.money.invoiced)} /><Kpi label="Collected" value={inr(d.money.collected)} /><Kpi label="Outstanding" value={inr(d.money.outstanding)} /><Kpi label="Est. job profit" value={inr(d.money.estimatedJobProfit)} hint="invoiced − material − labour" />
        <Kpi label="Installs scheduled" value={d.pipeline.installationsScheduled} hint={`${d.pipeline.installationsOverdue} overdue`} /><Kpi label="Stock purchases" value={inr(d.money.stockPurchaseCost)} /><Kpi label="Technician labour" value={inr(d.money.technicianLabourCost)} /><Kpi label="Inventory value" value={inr(d.inventory.valuation)} />
        <Kpi label="Service billed" value={inr(d.money.serviceBilled)} /><Kpi label="Service cost" value={inr(d.money.serviceCost)} hint={`${inr(d.money.warrantyAbsorbedCost)} warranty absorbed`} />
      </div>
      <Card title="Invoiced vs collected by month">{d.monthly.length === 0 ? <Empty text="No data in this range" /> : <div className="h-64"><ResponsiveContainer><BarChart data={d.monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v) => "₹" + v / 1000 + "k"} /><Tooltip formatter={(v: number) => inr(v)} /><Legend /><Bar dataKey="invoiced" fill="#1f7a43" /><Bar dataKey="collected" fill="#d99a1e" /></BarChart></ResponsiveContainer></div>}</Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Profitability by installation"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Order</Th><Th>Customer</Th><Th>Status</Th><Th>Invoiced</Th><Th>Profit</Th></tr></thead><tbody>{d.jobs.map((j: any) => <tr key={j.number} className="border-t"><td className="px-2 py-1">{j.number}</td><td className="px-2">{j.customer}</td><td className="px-2"><Badge v={j.status} /></td><td className="px-2">{inr(j.invoiced)}</td><td className={`px-2 font-medium ${j.estimatedProfit < 0 ? "text-red-600" : "text-green-700"}`}>{inr(j.estimatedProfit)}</td></tr>)}</tbody></table></div></Card>
        <Card title="Low stock">{d.inventory.lowStock.length === 0 ? <Empty text="All stock above thresholds" /> : <ul className="space-y-1 text-sm">{d.inventory.lowStock.map((s: any) => <li key={s.name} className="flex justify-between"><span>{s.name}</span><span className="text-red-600">{s.available} left (min {s.threshold})</span></li>)}</ul>}</Card>
      </div></>)}</div>);
}
