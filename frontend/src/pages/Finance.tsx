import { useState } from "react";
import Dashboard from "./Dashboard";
import { api, dt, inr, run } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

export default function Finance() {
  const { data: invoices, loading: invoicesLoading, err: invoicesErr, reload: reloadInvoices } = useLoad<any[]>(() => api("/finance/invoices"), []);
  const { data: expenses, loading: expensesLoading, err: expensesErr, reload: reloadExpenses } = useLoad<any[]>(() => api("/finance/expenses"), []);
  const { data: payroll, loading: payrollLoading, err: payrollErr, reload: reloadPayroll } = useLoad<any[]>(() => api("/finance/technician-payments"), []);
  const { data: orders } = useLoad<any[]>(() => api("/orders"), []);
  const { data: technicians } = useLoad<any[]>(() => api("/users?role=TECHNICIAN"), []);
  const [expense, setExpense] = useState({ orderId: "", category: "TRAVEL", description: "", amount: "", reference: "" });
  const [pay, setPay] = useState({ technicianId: "", periodStart: "", periodEnd: "", hours: "", rate: "" });

  const createInvoice = async (orderId: string) => {
    if (await run(() => api(`/orders/${orderId}/invoice`, { body: {} }), "Invoice issued")) reloadInvoices();
  };

  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run(() => api("/finance/expenses", { body: {
      orderId: expense.orderId || null,
      category: expense.category,
      description: expense.description,
      amount: Number(expense.amount),
      reference: expense.reference || undefined,
    } }), "Expense recorded")) {
      setExpense({ orderId: "", category: "TRAVEL", description: "", amount: "", reference: "" });
      reloadExpenses();
    }
  };

  const createPayRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run(() => api("/finance/technician-payments", { body: {
      technicianId: pay.technicianId,
      periodStart: pay.periodStart,
      periodEnd: pay.periodEnd,
      hours: Number(pay.hours),
      rate: Number(pay.rate),
    } }), "Technician payment recorded")) {
      setPay({ technicianId: "", periodStart: "", periodEnd: "", hours: "", rate: "" });
      reloadPayroll();
    }
  };

  return <div className="space-y-5">
    <Dashboard title="Finance dashboard" />
    <Card title="How to read these numbers">
      <p className="mb-2 text-sm text-slate-500">The example below is illustrative only; actual totals on this page are calculated from your saved records.</p>
      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p className="rounded-lg bg-slate-50 p-3"><b>Order value:</b> ₹1,00,000 example contract total.</p>
        <p className="rounded-lg bg-slate-50 p-3"><b>Payments:</b> ₹30,000 advance + ₹20,000 partial payment.</p>
        <p className="rounded-lg bg-slate-50 p-3"><b>Outstanding:</b> ₹50,000 still due in this example.</p>
        <p className="rounded-lg bg-slate-50 p-3"><b>Estimated profit:</b> ₹63,000 after ₹30,000 materials, ₹2,000 labour and ₹5,000 expenses.</p>
      </div>
    </Card>
    <Card title="Invoices">
      {invoicesErr && <p className="mb-2 text-sm text-red-600">{invoicesErr}</p>}
      {invoicesLoading ? <Skeleton /> : <div className="space-y-3">
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Invoice</Th><Th>Order / customer</Th><Th>Total</Th><Th>Paid</Th><Th>Outstanding</Th><Th>Due</Th><Th>Status</Th></tr></thead>
          <tbody>{(invoices ?? []).map((invoice: any) => <tr key={invoice.id} className="border-t"><td className="px-2 py-2">{invoice.number}</td><td className="px-2">{invoice.order.number} · {invoice.order.customer.name}</td><td className="px-2">{inr(invoice.total)}</td><td className="px-2">{inr(invoice.paid)}</td><td className="px-2">{inr(invoice.outstanding)}</td><td className="px-2">{dt(invoice.dueAt)}</td><td className="px-2"><Badge v={invoice.status} /></td></tr>)}</tbody>
        </table></div>
        {!invoices?.length && <Empty text="No invoices issued yet" />}
        <div className="grid gap-2 md:grid-cols-2">
          {(orders ?? []).filter((order: any) => !order.invoice && !invoices?.some((invoice: any) => invoice.orderId === order.id) && order.status !== "CANCELLED").map((order: any) => <div key={order.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
            <span>{order.number} · {order.customer.name} · {inr(order.total)}</span><Btn onClick={() => void createInvoice(order.id)}>Issue invoice</Btn>
          </div>)}
        </div>
      </div>}
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Record project expense">
        {expensesErr && <p className="mb-2 text-sm text-red-600">{expensesErr}</p>}
        <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => void createExpense(event)}>
          <Select label="Project / order (optional)" value={expense.orderId} onChange={(event) => setExpense({ ...expense, orderId: event.target.value })}><option value="">Company expense</option>{(orders ?? []).map((order: any) => <option key={order.id} value={order.id}>{order.number} · {order.customer.name}</option>)}</Select>
          <Select label="Category" value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })}>{["TRAVEL", "EQUIPMENT", "LABOUR", "PERMITS", "OTHER"].map((item) => <option key={item}>{item}</option>)}</Select>
          <Field label="Description" hint="Briefly explain what was purchased or paid for." placeholder="Example: Site travel for order" value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} required />
          <Field label="Amount (₹)" hint="Enter the actual expense amount." type="number" min="0.01" step="0.01" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} required />
          <Field label="Reference" value={expense.reference} onChange={(event) => setExpense({ ...expense, reference: event.target.value })} />
          <Btn className="self-end">Record expense</Btn>
        </form>
        <div className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">
          {expensesLoading ? <Skeleton /> : !expenses?.length ? <Empty text="No expenses recorded" /> : expenses.map((item: any) => <div key={item.id} className="flex justify-between gap-2 border-t pt-2"><span>{item.description}<span className="block text-xs text-slate-500">{item.category} · {item.order?.number ?? "Company"} · {dt(item.incurredAt)}</span></span><b>{inr(item.amount)}</b></div>)}
        </div>
      </Card>
      <Card title="Technician pay records">
        {payrollErr && <p className="mb-2 text-sm text-red-600">{payrollErr}</p>}
        <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => void createPayRecord(event)}>
          <Select label="Technician" value={pay.technicianId} onChange={(event) => setPay({ ...pay, technicianId: event.target.value })} required><option value="">Select technician</option>{(technicians ?? []).map((technician: any) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</Select>
          <Field label="Period starts" type="date" value={pay.periodStart} onChange={(event) => setPay({ ...pay, periodStart: event.target.value })} required />
          <Field label="Period ends" type="date" value={pay.periodEnd} onChange={(event) => setPay({ ...pay, periodEnd: event.target.value })} required />
          <Field label="Hours" hint="Use reviewed working hours for this pay period." type="number" min="0.01" max="744" step="0.1" value={pay.hours} onChange={(event) => setPay({ ...pay, hours: event.target.value })} required />
          <Field label="Rate per hour (₹)" hint="Use the agreed hourly labour rate." type="number" min="0.01" step="0.01" value={pay.rate} onChange={(event) => setPay({ ...pay, rate: event.target.value })} required />
          <Btn className="self-end">Record pay</Btn>
        </form>
        <div className="mt-4 max-h-64 space-y-2 overflow-auto text-sm">
          {payrollLoading ? <Skeleton /> : !payroll?.length ? <Empty text="No technician pay records" /> : payroll.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-2 border-t pt-2">
            <span>{item.technician.name} · {dt(item.periodStart)}–{dt(item.periodEnd)}<span className="block text-xs text-slate-500">{item.hours} hours at {inr(item.rate)}/hour · <Badge v={item.status} /></span></span>
            <div className="flex items-center gap-2"><b>{inr(item.amount)}</b>{item.status !== "PAID" && <Btn kind="ghost" onClick={() => void run(async () => { await api(`/finance/technician-payments/${item.id}/paid`, { method: "PATCH", body: {} }); reloadPayroll(); }, "Recorded as paid")}>Mark paid</Btn>}</div>
          </div>)}
        </div>
      </Card>
    </div>
  </div>;
}