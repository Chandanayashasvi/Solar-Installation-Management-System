import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, dt, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

function Survey({ e, done }: { e: any; done: () => void }) {
  const s = e.survey; const [f, setF] = useState({ roofArea: s?.roofArea ?? "", shadowFreeArea: s?.shadowFreeArea ?? "", direction: s?.direction ?? "South", tilt: s?.tilt ?? 15, cableDistance: s?.cableDistance ?? 15, monthlyBill: s?.monthlyBill ?? "", gridSuitable: s?.gridSuitable ?? true, notes: s?.notes ?? "" });
  const set = (k: string) => (ev: any) => setF({ ...f, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value });
  return (<form className="grid gap-2 md:grid-cols-3" onSubmit={async (ev) => { ev.preventDefault(); if (await run(() => api(`/enquiries/${e.id}/survey`, { method: "PUT", body: { ...f, roofArea: +f.roofArea, shadowFreeArea: +f.shadowFreeArea, tilt: +f.tilt, cableDistance: +f.cableDistance, monthlyBill: +f.monthlyBill } }), "Survey saved")) done(); }}>
    <Field label="Roof area (m²)" type="number" value={f.roofArea} onChange={set("roofArea")} required /><Field label="Shadow-free area (m²)" type="number" value={f.shadowFreeArea} onChange={set("shadowFreeArea")} required />
    <Field label="Direction" value={f.direction} onChange={set("direction")} required /><Field label="Tilt (°)" type="number" value={f.tilt} onChange={set("tilt")} /><Field label="Cable distance (m)" type="number" value={f.cableDistance} onChange={set("cableDistance")} />
    <Field label="Monthly bill (₹)" type="number" value={f.monthlyBill} onChange={set("monthlyBill")} required />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.gridSuitable} onChange={set("gridSuitable")} />Grid connection suitable</label><Btn className="self-end">Save survey</Btn></form>);
}
function Detail({ e, reload }: { e: any; reload: () => void }) {
  const nav = useNavigate(); const pk = useLoad(() => api("/packages"), []); const [pkg, setPkg] = useState(""); const [disc, setDisc] = useState("0"); const [why, setWhy] = useState("");
  const packages = (pk.data ?? []).filter((p: any) => p.systemType === e.systemType);
  const approved = e.survey?.status === "APPROVED";
  return (<Card title={`${e.customer.name} — ${e.requestedKw} kW ${e.systemType.replace("_", "-")}`} right={<Badge v={e.status} />}>
    <p className="mb-3 text-sm text-slate-600">{e.customer.phone} · {e.customer.address}{e.notes && ` · ${e.notes}`}</p>
    <div className="mb-2 flex flex-wrap gap-2">{["CONTACTED", "SURVEY_SCHEDULED", "LOST"].map((s) => <Btn key={s} kind={s === "LOST" ? "danger" : "ghost"} disabled={e.status === s || ["WON", "LOST"].includes(e.status)} onClick={() => run(async () => { await api(`/enquiries/${e.id}/status`, { method: "PATCH", body: { status: s } }); reload(); })}>Mark {s.replace("_", " ").toLowerCase()}</Btn>)}</div>
    <h3 className="mt-3 font-medium">Roof survey {e.survey && <Badge v={e.survey.status} />}</h3>
    {e.survey?.status !== "APPROVED" && <Survey e={e} done={reload} />}
    {e.survey?.status === "PENDING" && <div className="mt-2 flex gap-2"><Btn onClick={() => run(async () => { await api(`/surveys/${e.survey.id}/decision`, { body: { status: "APPROVED" } }); reload(); }, "Survey approved")}>Approve survey</Btn><Btn kind="danger" onClick={() => run(async () => { await api(`/surveys/${e.survey.id}/decision`, { body: { status: "REJECTED" } }); reload(); })}>Reject</Btn></div>}
    <h3 className="mt-4 font-medium">Quotation</h3>
    {e.quotations.map((q: any) => <div key={q.id} className="flex items-center justify-between border-t py-1 text-sm"><Link className="text-solar-700 underline" to={`/quotes/${q.id}`}>{q.number} v{q.version}</Link><span>{inr(q.total)}</span><Badge v={q.status} />
      {q.status === "ISSUED" && <Btn onClick={() => run(async () => { const o = await api(`/quotations/${q.id}/accept`, { body: {} }); nav("/orders?open=" + o.id); }, "Order created")}>Accept → order</Btn>}</div>)}
    {!["WON", "LOST"].includes(e.status) && <div className="mt-2 grid items-end gap-2 md:grid-cols-4">
      <Select label="Package" value={pkg} onChange={(ev) => setPkg(ev.target.value)}><option value="">Select…</option>{packages.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Field label="Discount (₹)" type="number" value={disc} onChange={(ev) => setDisc(ev.target.value)} />
      {!approved && <Field label="Director override reason" value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="Only if survey not approved" />}
      <Btn disabled={!pkg} onClick={() => run(async () => { await api(`/enquiries/${e.id}/quotations`, { body: { packageId: pkg, discount: +disc, ...(why ? { overrideReason: why } : {}) } }); reload(); }, "Quotation generated")}>Generate quotation</Btn></div>}
  </Card>);
}
export default function Enquiries() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1); const [sel, setSel] = useState<string | null>(null); const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useLoad(() => api(`/enquiries?page=${page}&q=${encodeURIComponent(q)}&status=${status}`), [q, status, page]);
  const cur = data?.data.find((x: any) => x.id === sel);
  const [nf, setNf] = useState({ name: "", phone: "", address: "", requestedKw: "3", systemType: "ON_GRID" });
  return (<div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-xl font-bold">Enquiries</h1>
    <div className="flex gap-2"><input aria-label="Search" placeholder="Search name or phone" className="rounded-lg border px-3 py-1.5 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <select aria-label="Status" className="rounded-lg border px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{["NEW", "CONTACTED", "SURVEY_SCHEDULED", "QUALIFIED", "QUOTED", "WON", "LOST"].map((s) => <option key={s}>{s}</option>)}</select><Btn onClick={() => setShowNew(!showNew)}>New enquiry</Btn></div></div>
    {showNew && <Card title="Log an enquiry"><form className="grid gap-2 md:grid-cols-5" onSubmit={async (ev) => { ev.preventDefault(); if (await run(() => api("/enquiries", { body: { ...nf, requestedKw: +nf.requestedKw, source: "CALL" } }), "Enquiry added")) { setShowNew(false); reload(); } }}>
      <Field label="Name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} required /><Field label="Mobile" value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} required /><Field label="Address" value={nf.address} onChange={(e) => setNf({ ...nf, address: e.target.value })} required />
      <Select label="Type" value={nf.systemType} onChange={(e) => setNf({ ...nf, systemType: e.target.value })}><option value="ON_GRID">On-Grid</option><option value="OFF_GRID">Off-Grid</option><option value="PANEL_SET">Panel set</option></Select>
      <Select label="kW" value={nf.requestedKw} onChange={(e) => setNf({ ...nf, requestedKw: e.target.value })}>{[1, 2, 3, 4, 5].map((k) => <option key={k}>{k}</option>)}</Select><Btn>Add</Btn></form></Card>}
    <Card>{loading ? <Skeleton /> : !data?.data.length ? <Empty text="No enquiries match" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Customer</Th><Th>Phone</Th><Th>System</Th><Th>Source</Th><Th>Status</Th><Th>Created</Th></tr></thead>
      <tbody>{data.data.map((e: any) => <tr key={e.id} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && setSel(e.id)} onClick={() => setSel(e.id)} className={`cursor-pointer border-t hover:bg-solar-50 ${sel === e.id ? "bg-solar-50" : ""}`}><td className="px-2 py-2">{e.customer.name}</td><td className="px-2">{e.customer.phone}</td><td className="px-2">{e.requestedKw} kW {e.systemType.replace("_", "-")}</td><td className="px-2">{e.source}</td><td className="px-2"><Badge v={e.status} /></td><td className="px-2">{dt(e.createdAt)}</td></tr>)}</tbody></table></div>}
      <div className="mt-2 flex items-center justify-between text-sm text-slate-500"><span>{data?.total ?? 0} total</span><div className="flex gap-2"><Btn kind="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn><Btn kind="ghost" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Btn></div></div></Card>
    {cur && <Detail e={cur} reload={reload} />}</div>);
}
