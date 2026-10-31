import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { api, dt, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

type PaymentRecord = { id: string; technician: { id: string; name: string; email: string }; periodStart: string; periodEnd: string; hours: number; rate: number | string; amount: number | string; paidAmount: number | string; outstanding: number | string; status: string; paidAt?: string | null; paymentMethod?: string | null; reference?: string | null; notes?: string | null };
type LoggedJob = { id: string; orderNumber: string; customer: string; technician: string; technicianId: string; completedAt: string | null; hours: number; labourCost: number };
const Kpi = ({ title, value, note }: { title: string; value: string | number; note?: string }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase text-slate-500">{title}</p><p className="mt-1 text-xl font-semibold">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</div>;

export default function TechnicianPayments() {
  const { data: records, loading, err, reload } = useLoad<PaymentRecord[]>(() => api("/finance/technician-payments"), []);
  const { data: dashboard, err: jobsError } = useLoad<{ hourlyRate: number; jobs: LoggedJob[] }>(() => api("/finance/technician-payments/dashboard"), []);
  const { data: technicians } = useLoad<any[]>(() => api("/users?role=TECHNICIAN"), []);
  const [filter, setFilter] = useState("");
  const [pay, setPay] = useState({ technicianId: "", periodStart: new Date().toISOString().slice(0, 7) + "-01", periodEnd: new Date().toISOString().slice(0, 10), hours: "", rate: "" });
  const [settling, setSettling] = useState<PaymentRecord | null>(null);
  const [settlement, setSettlement] = useState({ amount: "", method: "BANK_TRANSFER", reference: "", notes: "" });

  const listed = (records ?? []).filter((record) => !filter || record.technician.id === filter);
  const periodJobs = (dashboard?.jobs ?? []).filter((job) =>
    (!pay.technicianId || job.technicianId === pay.technicianId) &&
    job.completedAt &&
    job.completedAt.slice(0, 10) >= pay.periodStart &&
    job.completedAt.slice(0, 10) <= pay.periodEnd,
  );
  const month = new Date().toISOString().slice(0, 7);
  const monthly = useMemo(() => listed.filter((record) => record.periodStart.slice(0, 7) === month).reduce((total, record) => ({
    payable: total.payable + Number(record.amount),
    paid: total.paid + Number(record.paidAmount),
    outstanding: total.outstanding + Number(record.outstanding),
  }), { payable: 0, paid: 0, outstanding: 0 }), [listed, month]);
  const pending = listed.reduce((total, record) => total + Number(record.outstanding), 0);

  const createRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run(() => api("/finance/technician-payments", { body: {
      technicianId: pay.technicianId,
      periodStart: pay.periodStart,
      periodEnd: pay.periodEnd,
      hours: Number(pay.hours),
      rate: Number(pay.rate || dashboard?.hourlyRate || 0),
    } }), "Payable amount recorded (no money transferred)")) {
      setPay({ ...pay, hours: "" });
      reload();
    }
  };

  const recordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settling) return;
    if (await run(() => api(`/finance/technician-payments/${settling.id}/paid`, { method: "PATCH", body: {
      amount: Number(settlement.amount),
      method: settlement.method,
      reference: settlement.reference || undefined,
      notes: settlement.notes || undefined,
    } }), "Payment recorded in the system; no transfer was initiated")) {
      setSettling(null);
      setSettlement({ amount: "", method: "BANK_TRANSFER", reference: "", notes: "" });
      reload();
    }
  };

  const exportCsv = () => run(async () => {
    const blob: Blob = await api("/finance/technician-payments.csv", { raw: true });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "technician-payment-records.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  return <div className="space-y-4">
    <div className="no-print flex flex-wrap items-start justify-between gap-2">
      <div><h1 className="text-xl font-bold">Technician payments</h1><p className="mt-1 text-sm text-slate-500">Record hours and payment details. Solar Pro does not transfer money or connect to a bank.</p></div>
      <div className="flex gap-2"><Btn kind="ghost" onClick={() => void exportCsv()}><Download size={15} className="mr-1 inline" />Export CSV</Btn><Btn kind="ghost" onClick={() => window.print()}><Printer size={15} className="mr-1 inline" />Print statement</Btn></div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi title="This month · payable" value={inr(monthly.payable)} /><Kpi title="This month · recorded paid" value={inr(monthly.paid)} /><Kpi title="This month · outstanding" value={inr(monthly.outstanding)} /><Kpi title="Filtered pending payments" value={inr(pending)} note="Recorded balances, not bank transactions" />
    </div>
    <Card title="Create technician pay record">
      <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => void createRecord(event)}>
        <Select label="Technician" value={pay.technicianId} onChange={(event) => setPay({ ...pay, technicianId: event.target.value })} required><option value="">Select technician</option>{(technicians ?? []).map((technician: any) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</Select>
        <Field label="Pay period starts" type="date" value={pay.periodStart} onChange={(event) => setPay({ ...pay, periodStart: event.target.value })} required />
        <Field label="Pay period ends" type="date" min={pay.periodStart} value={pay.periodEnd} onChange={(event) => setPay({ ...pay, periodEnd: event.target.value })} required />
        <Field label="Approved working hours" type="number" min="0.01" max="744" step="0.1" value={pay.hours} onChange={(event) => setPay({ ...pay, hours: event.target.value })} required />
        <Field label="Configured rate per hour (₹)" type="number" min="0.01" step="0.01" value={pay.rate || dashboard?.hourlyRate || ""} onChange={(event) => setPay({ ...pay, rate: event.target.value })} required />
        <div className="self-end"><p className="mb-1 text-xs text-slate-500">Calculated payable</p><p className="font-semibold">{inr(Number(pay.hours || 0) * Number(pay.rate || dashboard?.hourlyRate || 0))}</p></div>
        <div className="md:col-span-3"><Btn>Record payable</Btn></div>
      </form>
      <div className="mt-4 border-t pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Completed installation jobs in this pay period</h3><span className="text-xs text-slate-500">Configured labour rate: {inr(dashboard?.hourlyRate ?? 0)}/hour</span></div>
        {jobsError && <p role="alert" className="text-sm text-red-600">{jobsError}</p>}
        {!periodJobs.length ? <Empty text="No completed jobs found in this period" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Job / order</Th><Th>Customer</Th><Th>Technician</Th><Th>Completed</Th><Th>Hours</Th><Th>Estimated labour</Th></tr></thead><tbody>
          {periodJobs.map((job) => <tr key={job.id} className="border-t"><td className="px-2 py-2">{job.orderNumber}</td><td className="px-2">{job.customer}</td><td className="px-2">{job.technician}</td><td className="px-2">{dt(job.completedAt)}</td><td className="px-2">{job.hours.toFixed(1)}</td><td className="px-2">{inr(job.labourCost)}</td></tr>)}
        </tbody></table><Btn className="no-print mt-2" kind="ghost" onClick={() => setPay({ ...pay, hours: periodJobs.reduce((total, job) => total + job.hours, 0).toFixed(1) })}>Use all listed job hours</Btn></div>}
      </div>
    </Card>
    {settling && <Card title={`Record payment · ${settling.technician.name}`} right={<Btn kind="ghost" onClick={() => setSettling(null)}>Cancel</Btn>}>
      <p className="mb-3 text-sm text-slate-600">Payable {inr(settling.amount)} · already recorded {inr(settling.paidAmount)} · remaining {inr(settling.outstanding)}.</p>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void recordPayment(event)}>
        <Field label="Amount recorded as paid (₹)" type="number" min="0.01" max={settling.outstanding} step="0.01" value={settlement.amount || settling.outstanding} onChange={(event) => setSettlement({ ...settlement, amount: event.target.value })} required />
        <Select label="Payment method (record only)" value={settlement.method} onChange={(event) => setSettlement({ ...settlement, method: event.target.value })}>{["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</Select>
        <Field label="Reference" value={settlement.reference} onChange={(event) => setSettlement({ ...settlement, reference: event.target.value })} />
        <Field label="Finance notes" value={settlement.notes} onChange={(event) => setSettlement({ ...settlement, notes: event.target.value })} />
        <Btn className="md:col-span-4">Save payment record</Btn>
      </form>
    </Card>}
    <Card title="Payment history" right={<Select label="Filter technician" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All technicians</option>{(technicians ?? []).map((technician: any) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</Select>}>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      {loading ? <Skeleton /> : !listed.length ? <Empty text="No technician payment records yet" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Technician</Th><Th>Pay period</Th><Th>Hours × rate</Th><Th>Calculated payable</Th><Th>Recorded paid</Th><Th>Outstanding</Th><Th>Last payment</Th><Th>Status</Th><Th>Action</Th></tr></thead><tbody>
        {listed.map((record) => <tr key={record.id} className="border-t"><td className="px-2 py-2">{record.technician.name}<span className="block text-xs text-slate-500">{record.technician.email}</span></td><td className="px-2">{dt(record.periodStart)} – {dt(record.periodEnd)}</td><td className="px-2">{record.hours} × {inr(record.rate)}</td><td className="px-2">{inr(record.amount)}</td><td className="px-2">{inr(record.paidAmount)}<span className="block text-xs text-slate-500">{record.paymentMethod?.replace(/_/g, " ") ?? "—"} {record.reference ? `· ${record.reference}` : ""}</span></td><td className="px-2">{inr(record.outstanding)}</td><td className="px-2">{dt(record.paidAt)}</td><td className="px-2"><Badge v={record.status} /></td><td className="px-2">{Number(record.outstanding) > 0 && <Btn kind="ghost" onClick={() => { setSettling(record); setSettlement({ amount: String(record.outstanding), method: "BANK_TRANSFER", reference: "", notes: "" }); }}>Record payment</Btn>}</td></tr>)}
      </tbody></table></div>}
      <p className="mt-3 text-xs text-slate-500">Job labour estimates use installation hours × configured rate and are reported separately from these pay records to avoid double-counting project costs.</p>
    </Card>
  </div>;
}
