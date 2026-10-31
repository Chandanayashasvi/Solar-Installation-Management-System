import { useState } from "react";
import { api, dt, run } from "../api";
import { Badge, Btn, Card, Empty, Field, SignaturePad, Skeleton, useLoad } from "../ui";
const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
function Complete({ job, done }: { job: any; done: () => void }) {
  const [f, setF] = useState({ startedAt: "", finishedAt: "", systemKw: "", testPassed: false, mounting: false, wiring: false, safety: false, earthing: false }); const [photos, setPhotos] = useState<string[]>([]); const [sig, setSig] = useState("");
  const chk = (k: "mounting" | "wiring" | "safety" | "earthing" | "testPassed") => <label key={k} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{k === "testPassed" ? "Power generation test passed" : k}</label>;
  return (<form className="mt-3 space-y-3" onSubmit={async (e) => { e.preventDefault();
    if (await run(() => api(`/jobs/${job.id}/complete`, { body: { startedAt: new Date(f.startedAt).toISOString(), finishedAt: new Date(f.finishedAt).toISOString(), systemKw: +f.systemKw, testPassed: f.testPassed, checklist: { mounting: f.mounting, wiring: f.wiring, safety: f.safety, earthing: f.earthing }, signature: sig, photos } }), "Installation completed")) done(); }}>
    <div className="grid gap-2 md:grid-cols-3"><Field label="Start" type="datetime-local" value={f.startedAt} onChange={(e) => setF({ ...f, startedAt: e.target.value })} required /><Field label="Finish" type="datetime-local" value={f.finishedAt} onChange={(e) => setF({ ...f, finishedAt: e.target.value })} required /><Field label="System size (kW)" type="number" step="0.1" value={f.systemKw} onChange={(e) => setF({ ...f, systemKw: e.target.value })} required /></div>
    <div className="grid grid-cols-2 gap-1 md:grid-cols-5">{(["mounting", "wiring", "safety", "earthing", "testPassed"] as const).map(chk)}</div>
    <label className="block text-sm">Site photos (PNG/JPEG/WebP, ≤5 MB each)<input type="file" accept="image/png,image/jpeg,image/webp" multiple capture="environment" className="mt-1 block" onChange={async (e) => setPhotos(await Promise.all([...(e.target.files ?? [])].map(readFile)))} /></label>{photos.length > 0 && <p className="text-xs text-slate-500">{photos.length} photo(s) attached</p>}
    <div><p className="mb-1 text-sm">Customer signature</p><SignaturePad onChange={setSig} /></div><Btn disabled={!sig || !photos.length}>Submit completion</Btn></form>);
}
export default function Jobs() {
  const { data, loading, reload } = useLoad(() => api("/jobs"), []); const [open, setOpen] = useState<string | null>(null);
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Installation jobs</h1>{loading ? <Skeleton /> : !data?.length ? <Empty text="No jobs assigned" /> : data.map((j: any) => (
    <Card key={j.id} title={`${j.order.number} — ${j.order.customer.name}`} right={<Badge v={j.status} />}><p className="text-sm text-slate-600">{j.order.customer.address} · scheduled {dt(j.scheduledFor)} · order <Badge v={j.order.status} /></p>
      {j.status === "SCHEDULED" && (j.order.status === "DELIVERED" ? <><Btn className="mt-2" kind="ghost" onClick={() => setOpen(open === j.id ? null : j.id)}>{open === j.id ? "Close form" : "Complete job"}</Btn>{open === j.id && <Complete job={j} done={() => { setOpen(null); reload(); }} />}</> : <p className="mt-2 text-sm text-amber-700">Waiting for equipment delivery.</p>)}
      {j.status === "COMPLETED" && <p className="mt-2 text-sm">Completed {dt(j.completedAt)} · {j.hours?.toFixed(1)} h · {j.systemKw} kW</p>}</Card>))}</div>);
}
