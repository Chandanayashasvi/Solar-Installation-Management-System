import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun } from "lucide-react";
import { api, setToken, User } from "../api";
import { Btn, Card, Field } from "../ui";
const demo = ["admin", "sales", "store", "tech", "support"];
export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const nav = useNavigate();
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api("/auth/login", { body: { email, password } }); setToken(r.token); onLogin(r.user); nav("/"); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  return (<div className="grid min-h-screen place-items-center p-4"><div className="w-full max-w-sm space-y-4">
    <div className="flex items-center justify-center gap-2 text-2xl font-bold text-solar-800"><Sun className="text-amber-500" /> SunPower Console</div>
    <Card><form onSubmit={submit} className="space-y-3"><Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}<Btn disabled={busy} className="w-full">{busy ? "Signing in…" : "Sign in"}</Btn></form></Card>
    <p className="text-center text-xs text-slate-500">Demo-only accounts: {demo.map((d) => `${d}@sunpower.demo`).join(", ")} — password in README.</p>
    <p className="text-center text-sm"><a className="text-solar-700 underline" href="/apply">Customer enquiry form</a></p></div></div>);
}
