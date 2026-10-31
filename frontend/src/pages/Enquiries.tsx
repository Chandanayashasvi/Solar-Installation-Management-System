import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, dt, inr, run, User } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

function Survey({ e, user, done }: { e: any; user: User; done: () => void }) {
  const s = e.survey; const [assignedSurveyorId, setAssignedSurveyorId] = useState(s?.assignedSurveyorId ?? "");
  const [scheduledFor, setScheduledFor] = useState(s?.scheduledFor ? new Date(new Date(s.scheduledFor).getTime() - new Date(s.scheduledFor).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const surveyors = useLoad(() => ["ADMIN", "SALES"].includes(user.role) ? api("/users?role=SURVEYOR") : Promise.resolve([]), [user.role]);
  const [f, setF] = useState({ roofArea: s?.roofArea ?? "", shadowFreeArea: s?.shadowFreeArea ?? "", direction: s?.direction ?? "South", tilt: s?.tilt ?? 15, cableDistance: s?.cableDistance ?? 15, monthlyBill: s?.monthlyBill ?? "", gridSuitable: s?.gridSuitable ?? true, notes: s?.notes ?? "" });
  const set = (k: string) => (ev: any) => setF({ ...f, [k]: ev.target.type === "checkbox" ? ev.target.checked : ev.target.value });
  if (user.role === "SALES") return <form className="grid gap-2 md:grid-cols-3" onSubmit={async (ev) => {
    ev.preventDefault();
    if (await run(() => api(`/enquiries/${e.id}/survey`, { method: "PUT", body: { status: "IN_PROGRESS", assignedSurveyorId: assignedSurveyorId || null, ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}) } }), "Survey request saved")) done();
  }}>
    <Select label="Assigned surveyor" value={assignedSurveyorId} onChange={(ev) => setAssignedSurveyorId(ev.target.value)}><option value="">Unassigned</option>{(surveyors.data ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
    <Field label="Site visit" type="datetime-local" value={scheduledFor} onChange={(ev) => setScheduledFor(ev.target.value)} />
    <Btn className="self-end">Save survey assignment</Btn>
  </form>;
  return (<form className="grid gap-2 md:grid-cols-3" onSubmit={async (ev) => { ev.preventDefault(); if (await run(() => api(`/enquiries/${e.id}/survey`, { method: "PUT", body: { ...f, roofArea: +f.roofArea, shadowFreeArea: +f.shadowFreeArea, tilt: +f.tilt, cableDistance: +f.cableDistance, monthlyBill: +f.monthlyBill, ...(assignedSurveyorId ? { assignedSurveyorId } : {}) } }), "Survey submitted")) done(); }}>
    <Field label="Roof area (m²)" type="number" value={f.roofArea} onChange={set("roofArea")} required /><Field label="Shadow-free area (m²)" type="number" value={f.shadowFreeArea} onChange={set("shadowFreeArea")} required />
    <Field label="Direction" value={f.direction} onChange={set("direction")} required /><Field label="Tilt (°)" type="number" value={f.tilt} onChange={set("tilt")} /><Field label="Cable distance (m)" type="number" value={f.cableDistance} onChange={set("cableDistance")} />
    <Field label="Monthly bill (₹)" type="number" value={f.monthlyBill} onChange={set("monthlyBill")} required />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.gridSuitable} onChange={set("gridSuitable")} />Grid connection suitable</label>
    {["ADMIN", "SALES"].includes(user.role) && <Select label="Assigned surveyor" value={assignedSurveyorId} onChange={(ev) => setAssignedSurveyorId(ev.target.value)}><option value="">Unassigned</option>{(surveyors.data ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>}
    <Btn className="self-end">Submit survey</Btn></form>);
}
function Detail({ e, user, reload }: { e: any; user: User; reload: () => void }) {
  const nav = useNavigate(); const pk = useLoad(() => api("/packages"), []); const [pkg, setPkg] = useState(""); const [disc, setDisc] = useState("0"); const [why, setWhy] = useState("");
  const [decisionComment, setDecisionComment] = useState("");
  const packages = (pk.data ?? []).filter((p: any) => p.systemType === e.systemType);
  const approved = e.survey?.status === "APPROVED";
  return (<Card title={`${e.customer.name} — ${e.requestedKw} kW ${e.systemType.replace("_", "-")}`} right={<Badge v={e.status} />}>
    <p className="mb-3 text-sm text-slate-600">{e.reference && <><b>{e.reference}</b> · </>}{e.customer.phone} · {e.customer.address}{e.monthlyBill != null && ` · monthly bill ${inr(e.monthlyBill)}`}{e.notes && ` · ${e.notes}`}</p>
    <div className="mb-2 flex flex-wrap gap-2">{["CONTACTED", "SURVEY_SCHEDULED", "LOST"].map((s) => <Btn key={s} kind={s === "LOST" ? "danger" : "ghost"} disabled={e.status === s || ["WON", "LOST"].includes(e.status)} onClick={() => run(async () => { await api(`/enquiries/${e.id}/status`, { method: "PATCH", body: { status: s } }); reload(); })}>Mark {s.replace("_", " ").toLowerCase()}</Btn>)}</div>
    <h3 className="mt-3 font-medium">Roof survey {e.survey && <Badge v={e.survey.status} />}</h3>
    {e.survey?.decisionComment && <p className="mb-2 rounded bg-amber-50 p-2 text-sm">Review comment: {e.survey.decisionComment}</p>}
    {e.survey?.status !== "APPROVED" && <Survey e={e} user={user} done={reload} />}
    {user.role === "ADMIN" && ["PENDING", "SUBMITTED"].includes(e.survey?.status) && <div className="mt-2 space-y-2"><Field label="Approval or correction comment" value={decisionComment} onChange={(ev) => setDecisionComment(ev.target.value)} />
      <div className="flex gap-2"><Btn disabled={decisionComment.trim().length < 3 || !e.survey.gridSuitable} onClick={() => run(async () => { await api(`/surveys/${e.survey.id}/decision`, { body: { status: "APPROVED", comment: decisionComment } }); reload(); }, "Survey approved")}>Approve survey</Btn>
        <Btn kind="danger" disabled={decisionComment.trim().length < 3} onClick={() => run(async () => { await api(`/surveys/${e.survey.id}/decision`, { body: { status: "REJECTED", comment: decisionComment } }); reload(); }, "Corrections requested")}>Request corrections</Btn></div></div>}
    <h3 className="mt-4 font-medium">Quotation</h3>
    {e.quotations.map((q: any) => <div key={q.id} className="flex items-center justify-between border-t py-1 text-sm"><Link className="text-solar-700 underline" to={`/quotes/${q.id}`}>{q.number} v{q.version}</Link><span>{inr(q.total)}</span><Badge v={q.status} />
      {q.status === "ISSUED" && <Btn onClick={() => run(async () => { const o = await api(`/quotations/${q.id}/accept`, { body: {} }); nav("/orders?open=" + o.id); }, "Order created")}>Accept → order</Btn>}</div>)}
    {!["WON", "LOST"].includes(e.status) && <div className="mt-2 grid items-end gap-2 md:grid-cols-4">
      <Select label="Package" value={pkg} onChange={(ev) => setPkg(ev.target.value)}><option value="">Select…</option>{packages.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Field label="Discount (₹)" type="number" value={disc} onChange={(ev) => setDisc(ev.target.value)} />
      {!approved && user.role === "ADMIN" && <Field label="Director override reason" value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="Only if survey not approved" />}
      <Btn disabled={!pkg || (!approved && (user.role !== "ADMIN" || why.trim().length < 5))} onClick={() => run(async () => { await api(`/enquiries/${e.id}/quotations`, { body: { packageId: pkg, discount: +disc, ...(why ? { overrideReason: why } : {}) } }); reload(); }, "Quotation generated")}>Generate quotation</Btn></div>}
  </Card>);
}
export default function Enquiries({ user }: { user: User }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1); const [sel, setSel] = useState<string | null>(null); const [showNew, setShowNew] = useState(false);
  const { data, loading, reload } = useLoad(() => api(`/enquiries?page=${page}&q=${encodeURIComponent(q)}&status=${status}`), [q, status, page]);
  const cur = data?.data.find((x: any) => x.id === sel);
  const [nf, setNf] = useState({ name: "", phone: "", email: "", address: "", requestedKw: "3", systemType: "ON_GRID", monthlyBill: "", subsidyRequirement: "GUIDANCE" });
  return (<div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-xl font-bold">Enquiries</h1>
    <div className="flex gap-2"><input aria-label="Search" placeholder="Search name or phone" className="rounded-lg border px-3 py-1.5 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <select aria-label="Status" className="rounded-lg border px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option>{["NEW", "CONTACTED", "SURVEY_SCHEDULED", "QUALIFIED", "QUOTED", "WON", "LOST"].map((s) => <option key={s}>{s}</option>)}</select><Btn onClick={() => setShowNew(!showNew)}>New enquiry</Btn></div></div>
    {showNew && <Card title="Log an enquiry"><p className="mb-3 text-sm text-slate-500">Enter the customer's own contact details. Example values are hints only; do not use them as real customer data.</p><form className="grid gap-2 md:grid-cols-3" onSubmit={async (ev) => { ev.preventDefault(); if (await run(() => api("/enquiries", { body: { ...nf, requestedKw: +nf.requestedKw, monthlyBill: nf.monthlyBill ? +nf.monthlyBill : undefined, source: "CALL" } }), "Enquiry added")) { setShowNew(false); reload(); } }}>
      <Field label="Full name" hint="Enter the customer's full name." placeholder="Example: Priya Sharma" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} required />
      <Field label="Mobile (10 digits)" hint="Use an Indian mobile number beginning 6–9." placeholder="9876543210" inputMode="numeric" pattern="[6-9][0-9]{9}" value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} required />
      <Field label="Email (optional)" type="email" placeholder="name@example.com" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
      <Field label="Installation address" hint="Enter the full installation location." placeholder="Street, area, city and PIN code" value={nf.address} onChange={(e) => setNf({ ...nf, address: e.target.value })} required />
      <Select label="System type" hint="Choose what the customer is considering." value={nf.systemType} onChange={(e) => setNf({ ...nf, systemType: e.target.value })}><option value="ON_GRID">On-Grid</option><option value="OFF_GRID">Off-Grid</option><option value="PANEL_SET">Panel set</option></Select>
      <Field label="Monthly electricity bill (₹)" hint="Example: ₹2,500." type="number" min="0" step="1" value={nf.monthlyBill} onChange={(e) => setNf({ ...nf, monthlyBill: e.target.value })} />
      <Select label="Subsidy requirement" value={nf.subsidyRequirement} onChange={(e) => setNf({ ...nf, subsidyRequirement: e.target.value })}><option value="YES">Yes</option><option value="NO">No</option><option value="GUIDANCE">Needs guidance</option></Select>
      <Select label="kW" value={nf.requestedKw} onChange={(e) => setNf({ ...nf, requestedKw: e.target.value })}>{[1, 2, 3, 4, 5].map((k) => <option key={k}>{k}</option>)}</Select><Btn>Add</Btn></form></Card>}
    <Card>{loading ? <Skeleton /> : !data?.data.length ? <Empty text="No enquiries yet. Select “New enquiry” or share the public Apply page with a customer." /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Reference</Th><Th>Customer</Th><Th>Phone</Th><Th>System</Th><Th>Source</Th><Th>Status</Th><Th>Created</Th></tr></thead>
      <tbody>{data.data.map((e: any) => <tr key={e.id} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && setSel(e.id)} onClick={() => setSel(e.id)} className={`cursor-pointer border-t hover:bg-solar-50 ${sel === e.id ? "bg-solar-50" : ""}`}><td className="px-2 py-2 font-mono text-xs">{e.reference}</td><td className="px-2">{e.customer.name}</td><td className="px-2">{e.customer.phone}</td><td className="px-2">{e.requestedKw} kW {e.systemType.replace("_", "-")}</td><td className="px-2">{e.source}</td><td className="px-2"><Badge v={e.status} /></td><td className="px-2">{dt(e.createdAt)}</td></tr>)}</tbody></table></div>}
      <div className="mt-2 flex items-center justify-between text-sm text-slate-500"><span>{data?.total ?? 0} total</span><div className="flex gap-2"><Btn kind="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn><Btn kind="ghost" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</Btn></div></div></Card>
    {cur && <Detail e={cur} user={user} reload={reload} />}</div>);
}
