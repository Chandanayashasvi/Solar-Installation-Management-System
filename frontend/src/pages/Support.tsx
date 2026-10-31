import { useState } from "react";
import { api, dt, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";
function TicketRow({ t, reload }: { t: any; reload: () => void }) {
  const [d, setD] = useState({ diagnosis: t.diagnosis ?? "", partsCost: String(t.partsCost ?? 0), labourCost: String(t.labourCost ?? 0), replacementSerial: t.replacementSerial ?? "" }); const [bill, setBill] = useState<any>(null);
  const editable = t.status === "OPEN" || t.status === "IN_PROGRESS";
  return (<Card title={`${t.number} — ${t.asset.product.name} (${t.asset.serial})`} right={<Badge v={t.status} />}>
    <p className="text-sm text-slate-600">{t.customer.name} · {t.customer.phone} · fault {t.faultCode ?? "—"} · {t.complaint}</p>
    {editable && <div className="mt-2 grid items-end gap-2 md:grid-cols-5"><Field label="Diagnosis" value={d.diagnosis} onChange={(e) => setD({ ...d, diagnosis: e.target.value })} /><Field label="Parts cost (₹)" type="number" value={d.partsCost} onChange={(e) => setD({ ...d, partsCost: e.target.value })} /><Field label="Labour (₹)" type="number" value={d.labourCost} onChange={(e) => setD({ ...d, labourCost: e.target.value })} /><Field label="New serial" value={d.replacementSerial} onChange={(e) => setD({ ...d, replacementSerial: e.target.value })} />
      <Btn kind="ghost" onClick={() => run(async () => { await api(`/service/tickets/${t.id}`, { method: "PATCH", body: { diagnosis: d.diagnosis || undefined, partsCost: +d.partsCost, labourCost: +d.labourCost, replacementSerial: d.replacementSerial || undefined, status: "IN_PROGRESS" } }); reload(); }, "Saved")}>Save</Btn></div>}
    {editable && <Btn className="mt-2" onClick={() => run(async () => { const r = await api(`/service/tickets/${t.id}/resolve`, { body: {} }); setBill(r.bill); reload(); })}>Resolve & calculate billing</Btn>}
    {(bill || t.covered !== null) && <p className={`mt-2 rounded-lg p-2 text-sm ${(bill?.covered ?? t.covered) ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{(bill?.covered ?? t.covered) ? "Covered under warranty — customer charged ₹0." : `Out of warranty — customer billed ${inr(bill?.total ?? t.billedAmount)} (parts + labour + call-out).`}</p>}
    {t.status === "RESOLVED" && <Btn className="mt-2" onClick={() => run(async () => { await api(`/service/tickets/${t.id}/confirm`, { body: {} }); reload(); }, "Closed – customer confirmed")}>Customer confirmed it works</Btn>}</Card>);
}
export default function Support() {
  const [serial, setSerial] = useState(""); const [res, setRes] = useState<any>(null); const [t, setT] = useState({ complaint: "", faultCode: "", priority: "NORMAL" });
  const tickets = useLoad(() => api("/service/tickets"), []);
  const lookup = async (e?: React.FormEvent) => { e?.preventDefault(); await run(async () => setRes(await api(`/service/lookup/${encodeURIComponent(serial.trim())}`))); };
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Warranty & service</h1>
    <Card title="Look up a serial number"><form className="flex gap-2" onSubmit={lookup}><input aria-label="Serial number" className="flex-1 rounded-lg border px-3 py-2 font-mono uppercase" placeholder="e.g. DEMO-INV2-0001" value={serial} onChange={(e) => setSerial(e.target.value)} /><Btn>Search</Btn></form>
      {res && <div className="mt-3 space-y-2 text-sm"><div className="flex items-center gap-2"><b>{res.product}</b><Badge v={res.warranty.status} /></div>
        <p>Customer: {res.customer?.name} · {res.customer?.phone} · {res.customer?.address}</p>
        <p>Order {res.order?.number} · delivered {dt(res.order?.deliveredAt)} · installed {dt(res.order?.installedAt)}</p>
        {res.warranty.endsAt && <p>Warranty {dt(res.warranty.startsAt)} → <b>{dt(res.warranty.endsAt)}</b> ({res.warranty.months} months, {res.warranty.daysLeft >= 0 ? `${res.warranty.daysLeft} days left` : `expired ${-res.warranty.daysLeft} days ago`})</p>}
        {res.tickets.length > 0 && <div><p className="font-medium">Previous tickets</p>{res.tickets.map((x: any) => <p key={x.id}>{x.number} · {x.complaint} · <Badge v={x.status} /> · {x.covered === null ? "" : x.covered ? "covered" : `billed ${inr(x.billedAmount)}`}</p>)}</div>}
        <form className="grid items-end gap-2 border-t pt-3 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/service/tickets", { body: { serial: res.serial, ...t, faultCode: t.faultCode || undefined } }), "Ticket created")) { setT({ complaint: "", faultCode: "", priority: "NORMAL" }); tickets.reload(); lookup(); } }}>
          <Field label="Complaint" value={t.complaint} onChange={(e) => setT({ ...t, complaint: e.target.value })} required /><Field label="Fault code" value={t.faultCode} onChange={(e) => setT({ ...t, faultCode: e.target.value })} />
          <Select label="Priority" value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>{["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => <option key={p}>{p}</option>)}</Select><Btn>Open ticket</Btn></form></div>}</Card>
    <h2 className="font-semibold">Tickets</h2>{tickets.loading ? <Skeleton /> : !tickets.data?.length ? <Empty text="No tickets" /> : tickets.data.map((x: any) => <TicketRow key={x.id + x.status} t={x} reload={tickets.reload} />)}</div>);
}
