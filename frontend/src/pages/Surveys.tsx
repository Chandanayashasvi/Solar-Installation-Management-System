import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, dt, run, User } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

type SurveyRecord = {
  id: string;
  status: string;
  scheduledFor?: string | null;
  submittedAt?: string | null;
  roofArea?: number | null;
  shadowFreeArea?: number | null;
  direction?: string | null;
  tilt?: number | null;
  cableDistance?: number | null;
  monthlyBill?: number | null;
  gridSuitable?: boolean | null;
  shading?: string | null;
  notes?: string | null;
  photos?: string[];
  assignedSurveyorId?: string | null;
  decisionComment?: string | null;
  enquiry: {
    id: string;
    requestedKw: number;
    systemType: string;
    customer: { name: string; phone: string; address: string };
  };
  history?: { id: string; action: string; createdAt: string; actorName: string; detail?: { comment?: string } }[];
};

const localDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

function SurveyDetails({ id, user, reload }: { id: string; user: User; reload: () => void }) {
  const { data: survey, loading, err, reload: reloadDetail } = useLoad<SurveyRecord>(() => api(`/surveys/${id}`), [id]);
  const [comment, setComment] = useState("");
  const [form, setForm] = useState({ roofArea: "", shadowFreeArea: "", direction: "", tilt: "", cableDistance: "", monthlyBill: "", gridSuitable: false, shading: "", notes: "", photos: "", scheduledFor: "" });

  useEffect(() => {
    if (!survey) return;
    setForm({
      roofArea: survey.roofArea == null ? "" : String(survey.roofArea),
      shadowFreeArea: survey.shadowFreeArea == null ? "" : String(survey.shadowFreeArea),
      direction: survey.direction ?? "",
      tilt: survey.tilt == null ? "" : String(survey.tilt),
      cableDistance: survey.cableDistance == null ? "" : String(survey.cableDistance),
      monthlyBill: survey.monthlyBill == null ? "" : String(survey.monthlyBill),
      gridSuitable: survey.gridSuitable ?? false,
      shading: survey.shading ?? "",
      notes: survey.notes ?? "",
      photos: (survey.photos ?? []).join("\n"),
      scheduledFor: localDateTime(survey.scheduledFor),
    });
  }, [survey]);

  if (loading || !survey) return <Card>{err ? <p className="text-red-600">{err}</p> : <Skeleton />}</Card>;
  const assignedToUser = survey.assignedSurveyorId === user.id;
  const editable = user.role === "ADMIN" || (user.role === "SURVEYOR" && assignedToUser);
  const canReview = (user.role === "ADMIN" || (user.role === "SURVEYOR" && assignedToUser)) && ["PENDING", "SUBMITTED"].includes(survey.status);
  const setText = (key: Exclude<keyof typeof form, "gridSuitable">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((v) => ({ ...v, [key]: e.target.value }));
  const save = async (status: "IN_PROGRESS" | "SUBMITTED") => {
    if (status === "SUBMITTED" && !window.confirm("Submit this survey for review? You can edit it again if corrections are requested.")) return;
    const body: Record<string, unknown> = {
      status,
      gridSuitable: form.gridSuitable,
      shading: form.shading,
      notes: form.notes,
      photos: form.photos.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    };
    for (const key of ["roofArea", "shadowFreeArea", "tilt", "cableDistance", "monthlyBill"] as const) {
      if (form[key].trim()) body[key] = Number(form[key]);
    }
    if (form.direction.trim()) body.direction = form.direction;
    if (form.scheduledFor) body.scheduledFor = new Date(form.scheduledFor).toISOString();
    if (await run(() => api(`/enquiries/${survey.enquiry.id}/survey`, { method: "PUT", body }), status === "SUBMITTED" ? "Survey submitted" : "Draft saved")) {
      reloadDetail();
      reload();
    }
  };
  const decide = async (status: "APPROVED" | "REJECTED") => {
    const action = status === "APPROVED" ? "approve" : "return this survey for corrections";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    if (await run(() => api(`/surveys/${survey.id}/decision`, { body: { status, comment } }), status === "APPROVED" ? "Survey approved" : "Corrections requested")) {
      setComment("");
      reloadDetail();
      reload();
    }
  };

  return <div className="space-y-4">
    <Card title={`${survey.enquiry.customer.name} — ${survey.enquiry.requestedKw} kW`} right={<Badge v={survey.status} />}>
      <p className="mb-3 text-sm text-slate-600">{survey.enquiry.customer.phone} · {survey.enquiry.customer.address}</p>
      <p className="mb-4 text-sm">Scheduled: {dt(survey.scheduledFor)} · {survey.enquiry.systemType.replace("_", "-")}</p>
      {survey.decisionComment && <p className="mb-3 rounded bg-amber-50 p-2 text-sm">Review comment: {survey.decisionComment}</p>}
      {editable && survey.status !== "APPROVED" && <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void save("SUBMITTED"); }}>
        <Field label="Roof area (m²)" hint="Measure the roof footprint available for the solar array." type="number" min="0.01" step="0.01" value={form.roofArea} onChange={setText("roofArea")} />
        <Field label="Available shadow-free area (m²)" hint="Enter usable roof area after obstructions and shade." type="number" min="0.01" step="0.01" value={form.shadowFreeArea} onChange={setText("shadowFreeArea")} />
        <Field label="Roof direction" hint="Record the compass direction the roof faces." value={form.direction} onChange={setText("direction")} placeholder="Example: South / East / West" />
        <Field label="Roof tilt (°)" hint="Enter the measured roof angle in degrees." type="number" min="0" max="90" value={form.tilt} onChange={setText("tilt")} />
        <Field label="Cable distance (m)" hint="Estimate the cable route from panels to equipment." type="number" min="0" max="500" value={form.cableDistance} onChange={setText("cableDistance")} />
        <Field label="Monthly electricity bill (₹)" hint="Record a recent typical monthly bill." type="number" min="0" value={form.monthlyBill} onChange={setText("monthlyBill")} />
        <Field label="Scheduled site visit" hint="Choose the local date and time for the visit." type="datetime-local" value={form.scheduledFor} onChange={setText("scheduledFor")} />
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.gridSuitable} onChange={(e) => setForm((v) => ({ ...v, gridSuitable: e.target.checked }))} /><span><b>Grid connection suitable</b><span className="block text-xs text-slate-500">Record whether the site can connect to the required utility grid.</span></span></label>
        <label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">Shading conditions</span><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={2} value={form.shading} onChange={setText("shading")} placeholder="Example: A tree shades the east side before 10 AM." /><span className="mt-1 block text-xs text-slate-500">Describe trees, nearby buildings or objects that block sunlight.</span></label>
        <label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">Technical observations and recommendations</span><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={3} value={form.notes} onChange={setText("notes")} /></label>
        <label className="text-sm md:col-span-3"><span className="mb-1 block text-slate-600">Site photo URLs (one per line)</span><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={2} value={form.photos} onChange={setText("photos")} placeholder="Optional existing upload URLs" /><span className="mt-1 block text-xs text-slate-500">Paste approved photo URLs only. This field does not upload files.</span></label>
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Btn type="button" kind="ghost" onClick={() => void save("IN_PROGRESS")}>Save draft</Btn>
          <Btn type="submit">Submit for review</Btn>
        </div>
      </form>}
      {canReview && <div className="mt-4 space-y-2 border-t pt-3">
        <label className="block text-sm"><span className="mb-1 block text-slate-600">Approval or correction comment</span><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <div className="flex gap-2">
          <Btn disabled={comment.trim().length < 3 || !survey.gridSuitable} onClick={() => void decide("APPROVED")}>Approve survey</Btn>
          <Btn kind="danger" disabled={comment.trim().length < 3} onClick={() => void decide("REJECTED")}>Request corrections</Btn>
        </div>
      </div>}
    </Card>
    <Card title="Survey history">
      {!survey.history?.length ? <Empty text="No audit history recorded yet" /> : <ul className="space-y-2 text-sm">{survey.history.map((item) => <li key={item.id} className="border-b pb-2"><b>{item.action.replace(/_/g, " ")}</b> · {dt(item.createdAt)} · {item.actorName}{item.detail?.comment && <p className="text-slate-600">{item.detail.comment}</p>}</li>)}</ul>}
    </Card>
  </div>;
}

export default function Surveys({ user }: { user: User }) {
  const location = useLocation();
  const { data, loading, err, reload } = useLoad<SurveyRecord[]>(() => api("/surveys"), []);
  const [selectedId, setSelectedId] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const surveys = data ?? [];
  const today = new Date().toDateString();
  const todayCount = surveys.filter((s) => s.scheduledFor && new Date(s.scheduledFor).toDateString() === today).length;
  const historyView = location.pathname.endsWith("/history");
  const rows = surveys.filter((s) => {
    const matchesStatus = status ? s.status === status : !historyView || ["SUBMITTED", "APPROVED", "REJECTED"].includes(s.status);
    const matchesText = !q || `${s.enquiry.customer.name} ${s.enquiry.customer.phone} ${s.enquiry.customer.address}`.toLowerCase().includes(q.toLowerCase());
    return matchesStatus && matchesText;
  });
  return <div className="space-y-4">
    <div><h1 className="text-xl font-bold">{historyView ? "Survey history" : user.role === "ADMIN" ? "Survey review" : "Surveyor workspace"}</h1><p className="text-sm text-slate-500">Site visits, technical findings, and approval status</p></div>
    {!historyView && <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      <Kpi label="Assigned" value={surveys.length} />
      <Kpi label="Pending" value={surveys.filter((s) => ["PENDING", "IN_PROGRESS"].includes(s.status)).length} />
      <Kpi label="Scheduled today" value={todayCount} />
      <Kpi label="Submitted" value={surveys.filter((s) => s.status === "SUBMITTED").length} />
      <Kpi label="Approved" value={surveys.filter((s) => s.status === "APPROVED").length} />
      <Kpi label="Corrections required" value={surveys.filter((s) => s.status === "REJECTED").length} />
    </div>}
    <Card title="Survey records">
      <div className="mb-3 flex flex-wrap gap-2"><input aria-label="Search surveys" className="min-w-48 rounded-lg border px-3 py-1.5 text-sm" placeholder="Search customer or address" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["PENDING", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED"].map((value) => <option key={value}>{value}</option>)}</Select></div>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {loading ? <Skeleton /> : !rows.length ? <Empty text="No surveys match these filters" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Customer</Th><Th>Location</Th><Th>Schedule</Th><Th>Survey</Th><Th>Status</Th></tr></thead><tbody>{rows.map((survey) => <tr key={survey.id} onClick={() => setSelectedId(survey.id)} className={`cursor-pointer border-t hover:bg-solar-50 ${selectedId === survey.id ? "bg-solar-50" : ""}`}>
        <td className="px-2 py-2">{survey.enquiry.customer.name}<div className="text-xs text-slate-500">{survey.enquiry.customer.phone}</div></td><td className="max-w-56 px-2">{survey.enquiry.customer.address}</td><td className="px-2">{dt(survey.scheduledFor)}</td><td className="px-2">{survey.submittedAt ? dt(survey.submittedAt) : "Not submitted"}</td><td className="px-2"><Badge v={survey.status} /></td>
      </tr>)}</tbody></table></div>}
    </Card>
    {selectedId && surveys.some((survey) => survey.id === selectedId) && <SurveyDetails key={selectedId} id={selectedId} user={user} reload={reload} />}
  </div>;
}

const Kpi = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>
  </div>
);