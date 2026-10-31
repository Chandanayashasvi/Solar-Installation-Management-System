import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import CameraScanner from "../components/CameraScanner";
import { api, dt, inr, run, User } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

function Pay({ o, reload }: { o: any; reload: () => void }) {
  const [amount, setAmount] = useState(String(Math.max(0, Number(o.requiredAdvance) - o.paid) || o.outstanding)); const [method, setMethod] = useState("UPI"); const [ref, setRef] = useState(""); const [key, setKey] = useState(() => crypto.randomUUID());
  return (<form className="grid items-end gap-2 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/orders/${o.id}/payments`, { body: { amount: +amount, method, reference: ref || undefined, idempotencyKey: key } }), "Payment recorded")) { setKey(crypto.randomUUID()); reload(); } }}>
    <Field label="Amount (₹)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /><Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>{["UPI", "CASH", "BANK_TRANSFER", "CHEQUE", "CARD"].map((m) => <option key={m}>{m}</option>)}</Select>
    <Field label="Reference" value={ref} onChange={(e) => setRef(e.target.value)} /><Btn>Record payment</Btn></form>);
}
function Dispatch({ o, reload }: { o: any; reload: () => void }) {
  const cl = useLoad(() => api(`/orders/${o.id}/dispatch-checklist`), [o.id]); const [s, setS] = useState<Record<string, string[]>>({});
  if (!cl.data) return <Skeleton />;
  const setSerial = (productId: string, index: number, value: string) => {
    const serials = [...(s[productId] ?? [])];
    serials[index] = value.trim().toUpperCase();
    setS({ ...s, [productId]: serials });
  };
  return (<div className="space-y-2">{cl.data.items.map((it: any) => <div key={it.productId} className="rounded-lg border p-2 text-sm"><div className="flex justify-between"><b>{it.name}</b><span>need {it.qty} · in stock {it.available}</span></div>
    {it.trackSerial && Array.from({ length: it.qty }, (_, i) => <div key={i} className="mt-2"><input aria-label={`${it.name} serial ${i + 1}`} placeholder={`Type serial ${i + 1}`} className="w-full rounded border px-2 py-1 uppercase" value={s[it.productId]?.[i] ?? ""} onChange={(e) => setSerial(it.productId, i, e.target.value)} /><CameraScanner onScan={(value) => setSerial(it.productId, i, value)} /></div>)}</div>)}
    <Btn onClick={() => run(async () => { await api(`/orders/${o.id}/dispatch`, { body: { serials: s } }); reload(); }, "Dispatched – serials recorded")}>Confirm dispatch</Btn></div>);
}
function Detail({ id, user, onChange }: { id: string; user: User; onChange: () => void }) {
  const { data: o, reload } = useLoad(() => api(`/orders/${id}`), [id]); const techs = useLoad(() => (user.role === "ADMIN" || user.role === "SALES" ? api("/users?role=TECHNICIAN") : Promise.resolve([])), []);
  const [tech, setTech] = useState(""); const [when, setWhen] = useState("");
  const done = () => { reload(); onChange(); };
  if (!o) return <Skeleton />;
  const canSales = ["ADMIN", "SALES", "FINANCE"].includes(user.role), canSchedule = ["ADMIN", "SALES"].includes(user.role), canStore = ["ADMIN", "WAREHOUSE"].includes(user.role);
  return (<Card title={`${o.number} — ${o.customer.name}`} right={<Badge v={o.status} />}>
    <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4"><div>Total <b>{inr(o.total)}</b></div><div>Required advance <b>{inr(o.requiredAdvance)}</b></div><div>Paid <b>{inr(o.paid)}</b></div><div>Outstanding <b>{inr(o.outstanding)}</b></div></div>
    <ul className="my-2 text-sm text-slate-600">{o.payments.map((p: any) => <li key={p.id}>{dt(p.paidAt)} · {p.kind} · {inr(p.amount)} · {p.method} {p.reference ?? ""}</li>)}</ul>
    {canSales && o.outstanding > 0 && <Pay o={o} reload={done} />}
    {canSchedule && o.status !== "PENDING_ADVANCE" && o.status !== "INSTALLED" && <div className="mt-3 grid items-end gap-2 md:grid-cols-3"><Select label="Technician" value={tech} onChange={(e) => setTech(e.target.value)}><option value="">{o.job ? "Reassign…" : "Select…"}</option>{(techs.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select><Field label="Install date" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><Btn disabled={!tech || !when} onClick={() => run(async () => { await api(`/orders/${o.id}/schedule`, { body: { technicianId: tech, scheduledFor: new Date(when).toISOString() } }); done(); }, "Installation scheduled")}>Schedule</Btn></div>}
    {o.job && <p className="mt-2 text-sm">Installation: <Badge v={o.job.status} /> {dt(o.job.scheduledFor)}</p>}
    {canStore && o.status === "CONFIRMED" && <div className="mt-3"><h3 className="mb-1 font-medium">Dispatch checklist</h3><Dispatch o={o} reload={done} /></div>}
    {canStore && o.status === "DISPATCHED" && <Btn className="mt-3" onClick={() => run(async () => { const r = await api(`/orders/${o.id}/deliver`, { body: {} }); toastWarr(r.warrantiesStarted); done(); })}>Confirm delivery (starts warranty)</Btn>}
    {o.assets.length > 0 && <table className="mt-3 w-full text-sm"><thead><tr><Th>Serial</Th><Th>Item</Th><Th>Status</Th><Th>Warranty ends</Th></tr></thead><tbody>{o.assets.map((a: any) => <tr key={a.id} className="border-t"><td className="px-2 py-1 font-mono">{a.serial}</td><td className="px-2">{a.product.name}</td><td className="px-2"><Badge v={a.status} /></td><td className="px-2">{dt(a.warranty?.endsAt)}</td></tr>)}</tbody></table>}
  </Card>);
}
const toastWarr = (n: number) => window.dispatchEvent(new CustomEvent("toast", { detail: { msg: `Delivered. Warranty started on ${n} item(s).`, ok: true } }));
export default function Orders({ user, title = "Orders" }: { user: User; title?: string }) {
  const [sp] = useSearchParams(); const [sel, setSel] = useState<string | null>(sp.get("open")); const { data, loading, reload } = useLoad(() => api("/orders"), []);
  return (<div className="space-y-4"><h1 className="text-xl font-bold">{title}</h1>
    <Card>{loading ? <Skeleton /> : !data?.length ? <Empty text="No orders yet" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Order</Th><Th>Customer</Th><Th>Total</Th><Th>Paid</Th><Th>Status</Th><Th>Created</Th></tr></thead><tbody>{data.map((o: any) => <tr key={o.id} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && setSel(o.id)} onClick={() => setSel(o.id)} className="cursor-pointer border-t hover:bg-solar-50"><td className="px-2 py-2">{o.number}</td><td className="px-2">{o.customer.name}</td><td className="px-2">{inr(o.total)}</td><td className="px-2">{inr(o.paid)}</td><td className="px-2"><Badge v={o.status} /></td><td className="px-2">{dt(o.createdAt)}</td></tr>)}</tbody></table></div>}</Card>
    {sel && <Detail key={sel} id={sel} user={user} onChange={reload} />}</div>);
}
