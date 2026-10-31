import { ReactNode, useEffect, useRef, useState } from "react";
export const Card = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{(title || right) && <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>{right}</div>}{children}</section>);
const tone: Record<string, string> = { green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800", gray: "bg-slate-100 text-slate-700" };
const map: Record<string, string> = { WON: "green", ACTIVE: "green", APPROVED: "green", COMPLETED: "green", INSTALLED: "green", CLOSED: "green", PAID: "green", NEW: "blue", CONTACTED: "blue", QUOTED: "blue", ISSUED: "blue", CONFIRMED: "blue", DISPATCHED: "blue", DELIVERED: "blue", SURVEY_SCHEDULED: "amber", PENDING: "amber", PENDING_ADVANCE: "amber", QUALIFIED: "amber", OPEN: "amber", IN_PROGRESS: "amber", RESOLVED: "amber", SCHEDULED: "amber", SUBMITTED: "amber", LOST: "red", EXPIRED: "red", REJECTED: "red", NO_WARRANTY: "red", URGENT: "red", HIGH: "amber" };
export const Badge = ({ v }: { v: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone[map[v] ?? "gray"]}`}>{v.replace(/_/g, " ")}</span>;
export const Btn = ({ kind = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "ghost" | "danger" }) => (
  <button {...p} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-solar-600 ${kind === "primary" ? "bg-solar-700 text-white hover:bg-solar-800" : kind === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "border border-slate-300 bg-white hover:bg-slate-50"} ${p.className ?? ""}`} />);
export const Field = ({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block text-sm"><span className="mb-1 block text-slate-600">{label}</span><input {...p} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:border-solar-600 focus:outline-none focus:ring-1 focus:ring-solar-600" /></label>);
export const Select = ({ label, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) => (
  <label className="block text-sm"><span className="mb-1 block text-slate-600">{label}</span><select {...p} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5">{children}</select></label>);
export const Skeleton = () => <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>;
export const Empty = ({ text }: { text: string }) => <p className="py-6 text-center text-sm text-slate-500">{text}</p>;
export const Th = ({ children }: { children?: ReactNode }) => <th className="px-2 py-2 text-left text-xs font-semibold uppercase text-slate-500">{children}</th>;
export function Toasts() {
  const [t, setT] = useState<{ id: number; msg: string; ok: boolean }[]>([]);
  useEffect(() => { const h = (e: any) => { const id = Date.now() + Math.random(); setT((x) => [...x, { id, ...e.detail }]); setTimeout(() => setT((x) => x.filter((i) => i.id !== id)), 4500); }; window.addEventListener("toast", h); return () => window.removeEventListener("toast", h); }, []);
  return <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 space-y-2">{t.map((i) => <div key={i.id} className={`max-w-sm rounded-lg px-4 py-2 text-sm text-white shadow-lg ${i.ok ? "bg-solar-700" : "bg-red-600"}`}>{i.msg}</div>)}</div>;
}
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [err, setErr] = useState("");
  const reload = () => { setLoading(true); fn().then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, deps); return { data, loading, err, reload };
}
export function SignaturePad({ onChange }: { onChange: (v: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current!.width / r.width), (e.clientY - r.top) * (ref.current!.height / r.height)]; };
  return <div><canvas ref={ref} width={400} height={140} className="w-full touch-none rounded-lg border border-slate-300 bg-white"
    onPointerDown={(e) => { drawing.current = true; const c = ref.current!.getContext("2d")!; c.lineWidth = 2; c.beginPath(); c.moveTo(...(pos(e) as [number, number])); }}
    onPointerMove={(e) => { if (!drawing.current) return; const c = ref.current!.getContext("2d")!; c.lineTo(...(pos(e) as [number, number])); c.stroke(); }}
    onPointerUp={() => { drawing.current = false; onChange(ref.current!.toDataURL("image/png")); }} />
    <button type="button" className="mt-1 text-xs text-slate-500 underline" onClick={() => { ref.current!.getContext("2d")!.clearRect(0, 0, 400, 140); onChange(""); }}>Clear signature</button></div>;
}
