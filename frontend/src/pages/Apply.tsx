import { useState } from "react";
import { api, run } from "../api";
import { Btn, Card, Field, Select } from "../ui";
import { Toasts } from "../ui";
export default function Apply() {
  const [f, setF] = useState({ name: "", phone: "", address: "", requestedKw: "3", systemType: "ON_GRID", notes: "" }); const [done, setDone] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (<div className="mx-auto max-w-md p-4"><h1 className="mb-3 text-xl font-bold text-solar-800">Request a rooftop solar quote</h1>
    {done ? <Card><p>Thank you! Our sales team will call you shortly.</p></Card> :
      <Card><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api("/public/enquiry", { body: { ...f, requestedKw: Number(f.requestedKw) } }))) setDone(true); }}>
        <Field label="Name" value={f.name} onChange={set("name")} required /><Field label="Mobile (10 digits)" value={f.phone} onChange={set("phone")} required inputMode="numeric" />
        <Field label="Address" value={f.address} onChange={set("address")} required />
        <Select label="System type" value={f.systemType} onChange={set("systemType")}><option value="ON_GRID">On-Grid</option><option value="OFF_GRID">Off-Grid (battery backup)</option><option value="PANEL_SET">Solar panel set only</option></Select>
        <Select label="Capacity" value={f.requestedKw} onChange={set("requestedKw")}>{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k} kW</option>)}</Select>
        <Field label="Notes (e.g. subsidy)" value={f.notes} onChange={set("notes")} /><Btn className="w-full">Submit enquiry</Btn></form></Card>}<Toasts /></div>);
}
