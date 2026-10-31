import { useMemo, useState } from "react";
import { Download, FileCheck2, Landmark, Upload } from "lucide-react";
import { api, dt, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, useLoad } from "../ui";

const stages = ["DRAFT", "DOCUMENTS_PENDING", "READY_FOR_SUBMISSION", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];
const nextStages: Record<string, string[]> = {
  DRAFT: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["READY_FOR_SUBMISSION"],
  READY_FOR_SUBMISSION: ["DOCUMENTS_PENDING", "SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["DOCUMENTS_PENDING"],
};
const label = (stage: string) => stage.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const Kpi = ({ title, value }: { title: string; value: string | number }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-500">{title}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;

export default function Subsidies() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [create, setCreate] = useState({ orderId: "", reference: "", claimed: "", followUpAt: "", notes: "" });
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(stage ? { stage } : {}) }).toString();
  const { data: applications, loading, err, reload } = useLoad<any[]>(() => api(`/finance/subsidies?${query}`), [query]);
  const { data: orders } = useLoad<any[]>(() => api("/orders"), []);
  const { data: allApplications, reload: reloadAll } = useLoad<any[]>(() => api("/finance/subsidies"), []);
  const metrics = useMemo(() => {
    const all = allApplications ?? [];
    return {
      total: all.length,
      pending: all.filter((application) => ["DRAFT", "DOCUMENTS_PENDING", "READY_FOR_SUBMISSION", "SUBMITTED", "UNDER_REVIEW"].includes(application.stage)).length,
      documents: all.reduce((count, application) => count + application.requiredDocuments.filter((document: string) => !application.receivedDocuments.includes(document)).length, 0),
      submitted: all.filter((application) => ["SUBMITTED", "UNDER_REVIEW"].includes(application.stage)).length,
      approved: all.filter((application) => application.stage === "APPROVED").length,
      rejected: all.filter((application) => application.stage === "REJECTED").length,
      amount: all.reduce((sum, application) => sum + Number(application.received), 0),
    };
  }, [allApplications]);

  const createApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run(() => api("/finance/subsidies", { body: {
      orderId: create.orderId,
      reference: create.reference || undefined,
      claimed: Number(create.claimed || 0),
      followUpAt: create.followUpAt ? new Date(create.followUpAt).toISOString() : undefined,
      notes: create.notes || undefined,
    } }), "Subsidy application created")) {
      setCreate({ orderId: "", reference: "", claimed: "", followUpAt: "", notes: "" });
      reload();
      reloadAll();
    }
  };

  const patch = async (id: string, body: object, success: string) => {
    if (await run(() => api(`/finance/subsidies/${id}`, { method: "PATCH", body }), success)) {
      reload();
      reloadAll();
    }
  };

  const upload = async (applicationId: string, file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      await run(() => Promise.reject(new Error("Each document must be 5 MB or smaller")));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => { void run(() => Promise.reject(new Error("Could not read the selected document"))); };
    reader.onload = async () => {
      if (typeof reader.result !== "string") {
        await run(() => Promise.reject(new Error("Selected file could not be encoded")));
        return;
      }
      if (await run(() => api(`/finance/subsidies/${applicationId}/documents`, { body: { name: file.name, dataUrl: reader.result } }), "Document uploaded securely")) {
        reload();
        reloadAll();
      }
    };
    reader.readAsDataURL(file);
  };

  const download = async (applicationId: string, attachment: any) => {
    if (await run(async () => {
      const blob: Blob = await api(`/finance/subsidies/${applicationId}/documents/${attachment.id}`, { raw: true });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    })) return;
  };

  const exportCsv = () => run(async () => {
    const blob: Blob = await api("/finance/subsidies.csv", { raw: true });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "subsidy-applications.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-center gap-3"><img src="/subsidy-government.svg" alt="" className="h-16 w-24 rounded-xl border border-solar-100 object-cover" /><div><h1 className="text-xl font-bold">Subsidy tracking</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Track application paperwork and progress. Solar Pro is not affiliated with or connected to a government portal.</p></div></div>
      <Btn kind="ghost" onClick={() => void exportCsv()}><Download size={15} className="mr-1 inline" />Export report</Btn>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi title="Applications" value={metrics.total} /><Kpi title="Pending applications" value={metrics.pending} /><Kpi title="Documents required" value={metrics.documents} /><Kpi title="Submitted / under review" value={metrics.submitted} /><Kpi title="Approved" value={metrics.approved} /><Kpi title="Rejected" value={metrics.rejected} /><Kpi title="Subsidy amounts recorded" value={inr(metrics.amount)} />
    </div>
    <Card title="Create application">
      <p className="mb-3 text-sm text-slate-500">Choose a saved order to link the application to its customer. Add the real reference and claim values from the customer's paperwork; do not use sample data.</p>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => void createApplication(event)}>
        <Select label="Solar order" value={create.orderId} onChange={(event) => setCreate({ ...create, orderId: event.target.value })} required><option value="">Select an order</option>{(orders ?? []).filter((order: any) => !order.subsidy && order.status !== "CANCELLED").map((order: any) => <option key={order.id} value={order.id}>{order.number} · {order.customer.name}</option>)}</Select>
        <Field label="Application reference (optional)" value={create.reference} onChange={(event) => setCreate({ ...create, reference: event.target.value })} />
        <Field label="Claimed amount (₹)" type="number" min="0" step="0.01" value={create.claimed} onChange={(event) => setCreate({ ...create, claimed: event.target.value })} />
        <Field label="Follow-up date (optional)" type="date" value={create.followUpAt} onChange={(event) => setCreate({ ...create, followUpAt: event.target.value })} />
        <label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">Initial remarks</span><textarea className="w-full rounded-lg border p-2" rows={2} value={create.notes} onChange={(event) => setCreate({ ...create, notes: event.target.value })} /></label>
        <Btn className="md:col-span-3 md:w-fit">Create draft application</Btn>
      </form>
    </Card>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <b>DEMO checklist example — not an application:</b>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2"><li>□ Customer identity proof</li><li>□ Electricity bill</li><li>□ System invoice</li><li>□ Installation proof</li></ul>
      <p className="mt-2 text-xs text-amber-800">Use the checklist on an actual application only after verifying the customer's documents. This workspace is not a government portal.</p>
    </div>
    <Card title="Applications" right={<Landmark aria-hidden="true" size={18} className="text-solar-700" />}>
      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <Field label="Search customer, contact, order or reference" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select label="Filter by stage" value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All stages</option>{stages.map((item) => <option key={item} value={item}>{label(item)}</option>)}</Select>
      </div>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      {loading ? <Skeleton /> : !applications?.length ? <Empty text="No matching subsidy applications" /> : <div className="space-y-3">
        {applications.map((application) => {
          const order = application.order;
          const enquiry = order.quotation.enquiry;
          const missing = application.requiredDocuments.filter((document: string) => !application.receivedDocuments.includes(document));
          const allowed = nextStages[application.stage] ?? [];
          return <section key={application.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="font-semibold">{order.customer.name} <span className="font-normal text-slate-500">· {order.number}</span></h2><p className="text-sm text-slate-500">{order.customer.phone} · {enquiry.requestedKw} kW · {label(enquiry.systemType)} · opened {dt(application.applicationDate)}</p></div>
              <Badge v={application.stage} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Reference" defaultValue={application.reference ?? ""} onBlur={(event) => { if (event.target.value !== (application.reference ?? "")) void patch(application.id, { reference: event.target.value || null }, "Reference saved"); }} />
              <Field label="Claimed amount (₹)" type="number" min="0" step="0.01" defaultValue={Number(application.claimed)} onBlur={(event) => { const amount = Number(event.target.value); if (amount !== Number(application.claimed)) void patch(application.id, { claimed: amount }, "Claim amount saved"); }} />
              <Field label="Follow-up date" type="date" value={application.followUpAt?.slice(0, 10) ?? ""} onChange={(event) => void patch(application.id, { followUpAt: event.target.value ? new Date(event.target.value).toISOString() : null }, "Follow-up saved")} />
              {(application.stage === "APPROVED" || application.stage === "REJECTED") && <Field label="Amount received (₹)" type="number" min="0" max={Number(application.claimed) || undefined} step="0.01" defaultValue={Number(application.received)} onBlur={(event) => { const amount = Number(event.target.value); if (amount !== Number(application.received)) void patch(application.id, { received: amount }, "Received amount saved"); }} />}
              <label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">Remarks</span><textarea className="w-full rounded-lg border p-2" rows={2} defaultValue={application.notes ?? ""} onBlur={(event) => { if (event.target.value !== (application.notes ?? "")) void patch(application.id, { notes: event.target.value || null }, "Remarks saved"); }} /></label>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><FileCheck2 size={15} />Document checklist</h3>
                {application.requiredDocuments.map((document: string) => <label key={document} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={application.receivedDocuments.includes(document)} onChange={(event) => {
                  const receivedDocuments = event.target.checked ? [...application.receivedDocuments, document] : application.receivedDocuments.filter((item: string) => item !== document);
                  void patch(application.id, { receivedDocuments }, "Checklist updated");
                }} />{document}</label>)}
                {missing.length > 0 && <p className="mt-1 text-xs text-amber-700">{missing.length} required document(s) missing</p>}
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><Upload size={15} />Supporting attachments</h3>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"><Upload size={14} />Upload PDF or image<input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => { void upload(application.id, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                <ul className="mt-2 space-y-1 text-sm">{application.attachments.map((document: any) => <li key={document.id}><button className="text-solar-700 underline" onClick={() => void download(application.id, document)}>{document.name}</button><span className="ml-2 text-xs text-slate-500">{dt(document.createdAt)}</span></li>)}</ul>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className="text-sm text-slate-600">Claimed {inr(application.claimed)} · received {inr(application.received)} · {missing.length} document(s) missing</p>
              {allowed.length > 0 && <Select label="Move application to" value="" onChange={(event) => { if (event.target.value) void patch(application.id, { stage: event.target.value }, "Application stage updated"); }}>
                <option value="">Choose next stage</option>{allowed.map((item) => <option key={item} value={item}>{label(item)}</option>)}
              </Select>}
            </div>
          </section>;
        })}
      </div>}
    </Card>
  </div>;
}
