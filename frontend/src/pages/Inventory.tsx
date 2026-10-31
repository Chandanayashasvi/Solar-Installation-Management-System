import { useEffect, useState } from "react";
import { api, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

function PurchaseReceipt({ purchaseOrderId, item, onReceived }: { purchaseOrderId: string; item: any; onReceived: () => void }) {
  const remaining = item.qty - item.receivedQty;
  const [qty, setQty] = useState(String(remaining));
  const [serials, setSerials] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => setQty(String(remaining)), [remaining]);
  if (remaining <= 0) return <p className="text-sm text-green-700">Received in full</p>;
  return <form className="mt-2 grid items-end gap-2 md:grid-cols-3" onSubmit={async (event) => {
    event.preventDefault();
    const serialList = serials.split(/[\s,]+/).filter(Boolean);
    if (await run(() => api(`/purchase-orders/${purchaseOrderId}/items/${item.id}/receive`, {
      body: { qty: Number(qty), serials: serialList, idempotencyKey },
    }), "Purchase receipt recorded")) {
      setSerials("");
      setIdempotencyKey(crypto.randomUUID());
      onReceived();
    }
  }}>
    <Field label={`Receive quantity (remaining ${remaining})`} type="number" min="1" max={remaining} value={qty} onChange={(event) => setQty(event.target.value)} required />
    {item.product.trackSerial && <label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">Serial numbers (one per unit)</span><textarea className="w-full rounded-lg border p-2 font-mono uppercase" rows={2} value={serials} onChange={(event) => setSerials(event.target.value)} placeholder="Example only: INV3KW-S0001" required /><span className="mt-1 block text-xs text-slate-500">Enter actual unique serial numbers from the received goods, one per unit.</span></label>}
    <Btn>Receive goods</Btn>
  </form>;
}

export default function Inventory() {
  const { data, loading, reload } = useLoad(() => api("/inventory"), []);
  const { data: purchaseOrders, loading: purchaseOrdersLoading, err: purchaseOrdersError, reload: reloadPurchaseOrders } = useLoad<any[]>(() => api("/purchase-orders"), []);
  const [f, setF] = useState({ productId: "", qty: "1", unitCost: "", supplier: "", serials: "" });
  const [poForm, setPoForm] = useState({ supplier: "", supplierPhone: "", expectedAt: "" });
  const [poItems, setPoItems] = useState([{ productId: "", qty: "1", unitCost: "" }]);
  const p = data?.find((x: any) => x.id === f.productId);
  return (<div className="space-y-4"><h1 className="text-xl font-bold">Inventory</h1>
    <Card title="Receive stock"><p className="mb-3 text-sm text-slate-500">A receipt increases available stock only after it is saved. Sample serial format: <span className="font-mono">INV3KW-S0001</span> (example only).</p><form className="grid items-end gap-2 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); const serials = f.serials.split(/[\s,]+/).filter(Boolean);
      if (await run(() => api("/inventory/receive", { body: { productId: f.productId, qty: +f.qty, unitCost: f.unitCost ? +f.unitCost : undefined, supplier: f.supplier || undefined, serials } }), "Stock received")) { setF({ ...f, serials: "", qty: "1" }); reload(); } }}>
      <Select label="Product" hint="Choose the stocked item being delivered." value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })} required><option value="">Select…</option>{data?.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      <Field label="Quantity" hint="Number of units received." type="number" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /><Field label="Unit cost (₹)" hint="Optional per-unit supplier cost." type="number" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} />
      <Field label="Supplier" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /><Btn>Receive</Btn>
      {p?.trackSerial && <label className="text-sm md:col-span-5">Serial numbers (one per unit, comma / space / newline separated)<textarea className="mt-1 w-full rounded-lg border p-2 font-mono uppercase" rows={3} value={f.serials} onChange={(e) => setF({ ...f, serials: e.target.value })} /></label>}</form></Card>
    <Card title="Create purchase order"><form className="grid items-end gap-2 md:grid-cols-3" onSubmit={async (event) => {
      event.preventDefault();
      if (await run(() => api("/purchase-orders", { body: {
        supplier: poForm.supplier,
        supplierPhone: poForm.supplierPhone || undefined,
        expectedAt: poForm.expectedAt ? new Date(poForm.expectedAt).toISOString() : undefined,
        items: poItems.map((item) => ({ productId: item.productId, qty: Number(item.qty), unitCost: Number(item.unitCost) })),
      } }), "Draft purchase order created")) {
        setPoForm({ ...poForm, expectedAt: "" });
        setPoItems([{ productId: "", qty: "1", unitCost: "" }]);
        reloadPurchaseOrders();
      }
    }}>
      <Field label="Supplier" value={poForm.supplier} onChange={(event) => setPoForm({ ...poForm, supplier: event.target.value })} required />
      <Field label="Supplier phone (optional)" value={poForm.supplierPhone} onChange={(event) => setPoForm({ ...poForm, supplierPhone: event.target.value })} />
      <Field label="Expected delivery (optional)" type="date" value={poForm.expectedAt} onChange={(event) => setPoForm({ ...poForm, expectedAt: event.target.value })} />
      {poItems.map((item, index) => <div key={index} className="grid items-end gap-2 rounded-lg border p-3 md:col-span-3 md:grid-cols-4">
        <Select label={`Product ${index + 1}`} value={item.productId} onChange={(event) => {
          const productId = event.target.value;
          setPoItems(poItems.map((line, lineIndex) => lineIndex === index
            ? { ...line, productId, unitCost: data?.find((product: any) => product.id === productId)?.cost ?? "" }
            : line));
        }} required><option value="">Select…</option>{data?.filter((product: any) => !poItems.some((line, lineIndex) => lineIndex !== index && line.productId === product.id)).map((product: any) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</Select>
        <Field label="Quantity" type="number" min="1" max="5000" value={item.qty} onChange={(event) => setPoItems(poItems.map((line, lineIndex) => lineIndex === index ? { ...line, qty: event.target.value } : line))} required />
        <Field label="Unit cost (₹)" type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => setPoItems(poItems.map((line, lineIndex) => lineIndex === index ? { ...line, unitCost: event.target.value } : line))} required />
        {poItems.length > 1 && <Btn type="button" kind="ghost" onClick={() => setPoItems(poItems.filter((_, lineIndex) => lineIndex !== index))}>Remove line</Btn>}
      </div>)}
      {poItems.some((item) => data?.find((product: any) => product.id === item.productId)?.trackSerial) && <p className="text-sm text-slate-500 md:col-span-3">Serial numbers are captured when goods are received. Creating an order does not change stock.</p>}
      <div className="flex gap-2"><Btn type="button" kind="ghost" onClick={() => setPoItems([...poItems, { productId: "", qty: "1", unitCost: "" }])}>Add line</Btn><Btn>Create draft</Btn></div>
    </form></Card>
    <Card title="Purchase orders">
      {purchaseOrdersError && <p className="mb-2 text-sm text-red-600">{purchaseOrdersError}</p>}
      {purchaseOrdersLoading ? <Skeleton /> : !purchaseOrders?.length ? <Empty text="No purchase orders yet" /> : <div className="space-y-3">
        {purchaseOrders.map((purchaseOrder: any) => <section key={purchaseOrder.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><b>{purchaseOrder.number}</b> · {purchaseOrder.supplier.name}{purchaseOrder.expectedAt && <span className="text-sm text-slate-500"> · expected {new Date(purchaseOrder.expectedAt).toLocaleDateString("en-IN")}</span>}</div>
            <div className="flex items-center gap-2"><Badge v={purchaseOrder.status} />{purchaseOrder.status === "DRAFT" && <Btn onClick={() => void run(async () => { await api(`/purchase-orders/${purchaseOrder.id}/order`, { body: {} }); reloadPurchaseOrders(); }, "Purchase order placed")}>Place order</Btn>}</div>
          </div>
          <div className="mt-2 divide-y">{purchaseOrder.items.map((item: any) => <div key={item.id} className="py-2">
            <p className="text-sm">{item.product.sku} · {item.product.name} · ordered {item.qty} · received {item.receivedQty} · unit cost {inr(item.unitCost)}</p>
            {["ORDERED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status) && <PurchaseReceipt purchaseOrderId={purchaseOrder.id} item={item} onReceived={() => { reloadPurchaseOrders(); reload(); }} />}
          </div>)}</div>
        </section>)}
      </div>}
    </Card>
    <Card title="Stock levels">{loading ? <Skeleton /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>SKU</Th><Th>Product</Th><Th>On hand</Th><Th>Reserved</Th><Th>Available</Th><Th>Value</Th><Th /></tr></thead>
      <tbody>{data.map((x: any) => <tr key={x.id} className="border-t"><td className="px-2 py-1 font-mono">{x.sku}</td><td className="px-2">{x.name}{x.trackSerial && <span className="ml-1 text-xs text-slate-400">serial</span>}</td><td className="px-2">{x.stock}</td><td className="px-2">{x.reserved}</td><td className="px-2">{x.available}</td><td className="px-2">{inr(x.value)}</td><td className="px-2">{x.low && <Badge v="EXPIRED" />}</td></tr>)}</tbody></table></div>}</Card></div>);
}
