import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Sun } from "lucide-react";
import { api } from "../api";
import { Btn, Field, Select } from "../ui";

type FormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  requestedKw: string;
  systemType: string;
  monthlyBill: string;
  subsidyRequirement: string;
  notes: string;
};

const initialForm: FormValues = {
  name: "",
  phone: "",
  email: "",
  address: "",
  requestedKw: "",
  systemType: "",
  monthlyBill: "",
  subsidyRequirement: "",
  notes: "",
};

export default function Apply() {
  const [form, setForm] = useState(initialForm);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ reference: string }>("/public/enquiry", {
        body: {
          ...form,
          requestedKw: Number(form.requestedKw),
          monthlyBill: Number(form.monthlyBill),
          submissionKey,
          website: "",
        },
      });
      setReference(result.reference);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not submit your enquiry. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const startAnother = () => {
    setForm(initialForm);
    setSubmissionKey(crypto.randomUUID());
    setReference("");
    setError("");
  };

  return <main className="min-h-screen bg-[#f7f9f7]">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/apply" className="flex items-center gap-2 font-semibold text-navy"><span className="grid h-9 w-9 place-items-center rounded-xl bg-solar-50"><Sun className="text-solar-700" size={20} /></span>Solar Pro</Link>
        <Link to="/login" className="text-sm font-medium text-solar-700 hover:underline">Team sign in</Link>
      </div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[.9fr_1.1fr] lg:py-12">
      <section className="relative min-h-64 overflow-hidden rounded-2xl bg-navy text-white lg:sticky lg:top-8 lg:h-[620px]">
        <img src="/solar-rooftop.svg" alt="Illustration of rooftop solar panels at sunset" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#10261f]/95 via-[#10261f]/25 to-transparent" />
        <div className="relative flex h-full min-h-64 flex-col justify-end p-6 sm:p-9">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-200">A brighter home starts here</p>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight sm:text-4xl">Start Your Solar Journey</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/90">Tell us about your rooftop. Our team will help you find the right solar solution.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/90"><span className="rounded-full bg-white/15 px-3 py-1.5">Personal guidance</span><span className="rounded-full bg-white/15 px-3 py-1.5">On-grid and off-grid options</span></div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {reference ? <div className="py-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-700"><CheckCircle2 size={30} /></span>
          <h2 className="mt-4 text-2xl font-semibold text-navy">Thank you for reaching out</h2>
          <p className="mt-2 text-sm text-slate-600">Your enquiry was saved. Our solar team will contact you using the details you provided.</p>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">Your enquiry reference</p>
          <p className="mt-1 break-all font-mono text-lg font-semibold text-solar-800">{reference}</p>
          <Btn type="button" kind="ghost" className="mt-6" onClick={startAnother}>Submit another enquiry</Btn>
        </div> : <>
          <div className="mb-6"><p className="text-sm font-medium text-solar-700">Tell us a little about your project</p><h2 className="mt-1 text-2xl font-semibold text-navy">Request a solar consultation</h2><p className="mt-2 text-sm text-slate-500">Fields marked required help our team prepare for your call. No account is needed.</p></div>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Field label="Full name" autoComplete="name" value={form.name} onChange={update("name")} placeholder="Enter your full name" minLength={2} maxLength={100} required /><p className="mt-1 text-xs text-slate-500">Enter the customer's full name.</p></div>
              <div><Field label="Phone number" type="tel" autoComplete="tel-national" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} value={form.phone} onChange={update("phone")} placeholder="10-digit mobile number" required /><p className="mt-1 text-xs text-slate-500">Enter a 10-digit Indian mobile number.</p></div>
            </div>
            <div><Field label="Email address (optional)" type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@example.com" /><p className="mt-1 text-xs text-slate-500">We can use this to share your project details.</p></div>
            <label className="block text-sm"><span className="mb-1 block text-slate-600">Installation address</span><textarea autoComplete="street-address" className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-solar-600 focus:outline-none focus:ring-1 focus:ring-solar-600" rows={3} value={form.address} onChange={update("address")} placeholder="House / street, area, city and PIN code" minLength={5} maxLength={300} required /><span className="mt-1 block text-xs text-slate-500">Enter the complete location where installation is required.</span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Select label="Expected system capacity" value={form.requestedKw} onChange={update("requestedKw")} required><option value="">Choose capacity</option>{[1, 2, 3, 4, 5].map((kw) => <option key={kw} value={kw}>{kw} kW</option>)}</Select><p className="mt-1 text-xs text-slate-500">Choose an estimate; our team can help confirm it.</p></div>
              <div><Select label="System type" value={form.systemType} onChange={update("systemType")} required><option value="">Choose system type</option><option value="ON_GRID">On-Grid</option><option value="OFF_GRID">Off-Grid (battery backup)</option></Select><p className="mt-1 text-xs text-slate-500">Choose based on whether battery backup is needed.</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Field label="Monthly electricity bill (₹)" type="number" min="0" max="10000000" step="1" inputMode="decimal" value={form.monthlyBill} onChange={update("monthlyBill")} placeholder="Example: 2500" required /><p className="mt-1 text-xs text-slate-500">Example: ₹2,500.</p></div>
              <div><Select label="Need help with subsidy?" value={form.subsidyRequirement} onChange={update("subsidyRequirement")} required><option value="">Choose an option</option><option value="YES">Yes, I plan to apply</option><option value="NO">No</option><option value="GUIDANCE">I need guidance</option></Select><p className="mt-1 text-xs text-slate-500">This records your preference, not a subsidy application.</p></div>
            </div>
            <label className="block text-sm"><span className="mb-1 block text-slate-600">Additional requirements (optional)</span><textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-solar-600 focus:outline-none focus:ring-1 focus:ring-solar-600" rows={3} value={form.notes} onChange={update("notes")} placeholder="For example, preferred call time or battery-backup needs" maxLength={500} /></label>
            <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"><label>Leave this field empty<input tabIndex={-1} autoComplete="off" name="website" value="" readOnly /></label></div>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Btn type="submit" disabled={busy} className="w-full py-2.5">{busy ? "Submitting…" : "Request a call from Solar Pro"}</Btn>
            <p className="text-center text-xs text-slate-500">Your details are shared with the Solar Pro sales team to respond to this request.</p>
          </form>
        </>}
      </section>
    </div>
  </main>;
}
