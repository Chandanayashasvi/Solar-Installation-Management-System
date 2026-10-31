import { useState } from "react";
import { api, inr, run } from "../api";
import { Badge, Btn, Card, Field, Select, Skeleton, Th, useLoad } from "../ui";
export default function Inventory() {
  const { data, loading, reload } = useLoad(() => api("/inventory"), []);
  const [f, setF] = useState({ productId: "", qty: "1", unitCost: "", supplier: "", serials: "" });
  const p = data?.find((x: any) => x.id === f.productId);
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Inventory</h1>
    <Card title="Receive stock"><form className="grid items-end gap-2 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); const serials = f.serials.split(/[\s,]+/).filter(Boolean);
      if (await run(() => api("/inventory/receive", { body: { productId: f.productId, qty: +f.qty, unitCost: f.unitCost ? +f.unitCost : undefined, supplier: f.supplier || undefined, serials } }), "Stock received")) { setF({ ...f, serials: "", qty: "1" }); reload(); } }}>
      <Select label="Product" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} required><option value="">Select…</option>{data?.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      <Field label="Quantity" type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><Field label="Unit cost (₹)" type="number" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} />
      <Field label="Supplier" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /><Btn>Receive</Btn>
      {p?.trackSerial && <label className="text-sm md:col-span-5">Serial numbers (one per unit, comma / space / newline separated)<textarea className="mt-1 w-full rounded-lg border p-2 font-mono uppercase" rows={3} value={f.serials} onChange={(e) => setF({ ...f, serials: e.target.value })} /></label>}</form></Card>
    <Card title="Stock levels">{loading ? <Skeleton /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>SKU</Th><Th>Product</Th><Th>On hand</Th><Th>Reserved</Th><Th>Available</Th><Th>Value</Th><Th /></tr></thead>
      <tbody>{data.map((x: any) => <tr key={x.id} className="border-t"><td className="px-2 py-1 font-mono">{x.sku}</td><td className="px-2">{x.name}{x.trackSerial && <span className="ml-1 text-xs text-slate-400">serial</span>}</td><td className="px-2">{x.stock}</td><td className="px-2">{x.reserved}</td><td className="px-2">{x.available}</td><td className="px-2">{inr(x.value)}</td><td className="px-2">{x.low && <Badge v="EXPIRED" />}</td></tr>)}</tbody></table></div>}</Card></div>);
}
