import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sun } from "lucide-react";
import { api, setToken, User } from "../api";
import { Btn, Field } from "../ui";

const benefits = [
  "Manage solar projects end to end.",
  "Track every panel, payment and installation.",
  "Deliver smarter service and warranty management.",
];

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const result = await api<{ token: string; user: User }>("/auth/login", { body: { email, password } });
      setToken(result.token);
      onLogin(result.user);
      nav("/");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative min-h-[340px] overflow-hidden bg-navy text-white lg:min-h-screen">
      <img src="/solar-rooftop.svg" alt="Solar panels across a rooftop in the warm evening sun" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#10261f]/95 via-[#10261f]/45 to-[#10261f]/10" />
      <div className="relative flex min-h-[340px] flex-col justify-between p-7 sm:p-10 lg:min-h-screen lg:p-14">
        <Link to="/login" className="flex w-fit items-center gap-2 text-xl font-semibold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur"><Sun className="text-amber-300" size={22} /></span>Solar Pro</Link>
        <div className="max-w-2xl pb-3 lg:pb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.22em] text-amber-200">Solar operations, connected</p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">Powering Every Project. From First Enquiry to Lifetime Service.</h1>
          <ul className="mt-6 grid gap-3 text-sm text-white/90 sm:grid-cols-3 lg:mt-8 lg:grid-cols-1">
            {benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />{benefit}</li>)}
          </ul>
        </div>
      </div>
    </section>
    <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2 text-solar-700 lg:hidden"><Sun size={24} className="text-amber-500" /><span className="text-lg font-semibold">Solar Pro</span></div>
        <div className="mb-7">
          <p className="text-sm font-medium text-solar-700">Welcome back</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-navy">Sign in to your workspace</h2>
          <p className="mt-2 text-sm text-slate-500">Use your team account to continue.</p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <Field label="Work email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required />
          <div>
            <label className="block text-sm"><span className="mb-1 block text-slate-600">Password</span>
              <span className="relative block">
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-11 focus:border-solar-600 focus:outline-none focus:ring-1 focus:ring-solar-600" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-slate-500 hover:bg-slate-50 hover:text-navy" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
          </div>
          {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <Btn disabled={busy} className="w-full py-2.5">{busy ? "Signing in…" : "Sign in securely"}</Btn>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Are you a customer? <Link className="font-medium text-solar-700 underline-offset-4 hover:underline" to="/apply">Send an enquiry</Link></p>
        <p className="mt-10 border-t pt-4 text-center text-xs text-slate-400">Solar Pro · Connected solar project management</p>
      </div>
    </section>
  </main>;
}
