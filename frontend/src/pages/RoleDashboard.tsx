import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardCheck, ClipboardList, CreditCard, Package, Search, ShieldCheck, ShoppingCart, Sun, Wrench } from "lucide-react";
import { api, inr, User } from "../api";
import { Badge, Card, Empty, Skeleton, useLoad } from "../ui";

type DashboardData = {
  enquiries?: any;
  newEnquiriesTotal?: number;
  surveys?: any[];
  orders?: any[];
  inventory?: any[];
  purchaseOrders?: any[];
  jobs?: any[];
  tickets?: any[];
  invoices?: any[];
  payments?: any[];
  subsidies?: any[];
  expenses?: any[];
};
const shortcuts = [
  { to: "/enquiries", title: "Customer enquiries", caption: "Capture leads and manage follow-ups.", icon: ClipboardList, roles: ["SALES", "ADMIN"] },
  { to: "/surveys", title: "Site surveys", caption: "Record roof measurements and assessments.", icon: ClipboardCheck, roles: ["SURVEYOR", "ADMIN"] },
  { to: "/inventory", title: "Inventory & purchasing", caption: "Manage stock, serials and purchase orders.", icon: Package, roles: ["WAREHOUSE", "ADMIN"] },
  { to: "/orders", title: "Quotations & orders", caption: "Follow solar projects through delivery.", icon: ShoppingCart, roles: ["SALES", "WAREHOUSE", "FINANCE", "ADMIN"] },
  { to: "/jobs", title: "Installation jobs", caption: "Complete assigned solar installations.", icon: Wrench, roles: ["TECHNICIAN", "ADMIN"] },
  { to: "/support", title: "Warranty & service", caption: "Look up products and manage service tickets.", icon: Search, roles: ["SUPPORT", "ADMIN"] },
  { to: "/finance", title: "Finance dashboard", caption: "Review invoices, expenses and balances.", icon: CreditCard, roles: ["FINANCE", "ADMIN"] },
  { to: "/subsidies", title: "Subsidy tracking", caption: "Track application stages and documents.", icon: ShieldCheck, roles: ["FINANCE", "ADMIN"] },
];
const Kpi = ({ title, value, note }: { title: string; value: string | number; note?: string }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{title}</p><p className="mt-1 text-2xl font-semibold text-navy">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</div>;

async function loadRoleData(role: User["role"]): Promise<DashboardData> {
  if (role === "SALES") {
    const [enquiries, newEnquiries, surveys, orders] = await Promise.all([api("/enquiries?pageSize=100"), api("/enquiries?status=NEW&pageSize=1"), api("/surveys"), api("/orders")]);
    return { enquiries, newEnquiriesTotal: newEnquiries.total, surveys, orders };
  }
  if (role === "SURVEYOR") return { surveys: await api("/surveys") };
  if (role === "WAREHOUSE") {
    const [inventory, purchaseOrders, orders] = await Promise.all([api("/inventory"), api("/purchase-orders"), api("/orders?status=CONFIRMED")]);
    return { inventory, purchaseOrders, orders };
  }
  if (role === "TECHNICIAN") return { jobs: await api("/jobs") };
  if (role === "SUPPORT") return { tickets: await api("/service/tickets") };
  if (role === "FINANCE") {
    const [invoices, payments, subsidies, orders, expenses] = await Promise.all([api("/finance/invoices"), api("/finance/technician-payments"), api("/finance/subsidies"), api("/orders"), api("/finance/expenses")]);
    return { invoices, payments, subsidies, orders, expenses };
  }
  return {};
}

export default function RoleDashboard({ user }: { user: User }) {
  const { data, loading, err } = useLoad<DashboardData>(() => loadRoleData(user.role), [user.role]);
  const enquiries = data?.enquiries?.data ?? [];
  const surveys = data?.surveys ?? [];
  const jobs = data?.jobs ?? [];
  const tickets = data?.tickets ?? [];
  const roleTitle: Record<User["role"], string> = {
    ADMIN: "Executive dashboard", SALES: "Sales workspace", SURVEYOR: "Survey workspace",
    WAREHOUSE: "Warehouse workspace", TECHNICIAN: "Technician workspace",
    SUPPORT: "Support workspace", FINANCE: "Finance workspace",
  };
  const today = new Date().toISOString().slice(0, 10);
  const lowStock = (data?.inventory ?? []).filter((item) => item.low).length;
  const pendingInvoices = (data?.invoices ?? []).filter((item) => !["PAID", "VOID"].includes(item.status));
  const subsidyMissingDocuments = (data?.subsidies ?? []).reduce((count, application) =>
    count + application.requiredDocuments.filter((document: string) => !application.receivedDocuments.includes(document)).length, 0);
  const roleIntroduction: Record<User["role"], string> = {
    ADMIN: "Review the business pipeline and pending operational tasks.",
    SALES: "Start with new enquiries, keep follow-ups current, and move qualified customers toward a site survey.",
    SURVEYOR: "Open assigned surveys and record the site measurements, shading, and grid suitability.",
    WAREHOUSE: "Review incoming purchase orders, receive goods, and dispatch confirmed orders.",
    TECHNICIAN: "Check today's installation schedule and update your assigned job after equipment delivery.",
    SUPPORT: "Search equipment by serial number to review warranty coverage before opening or resolving a ticket.",
    FINANCE: "Review pending invoices, customer balances, recorded expenses, technician pay, and subsidy documents.",
  };
  const content = () => {
    if (user.role === "SALES") return <>
      <Kpi title="New enquiries to contact" value={data?.newEnquiriesTotal ?? 0} note="Unread items in the Sales queue" />
      <Kpi title="Follow-ups due today" value={enquiries.filter((item: any) => item.nextFollowUp?.slice(0, 10) === today && !["WON", "LOST"].includes(item.status)).length} />
      <Kpi title="Overdue follow-ups" value={enquiries.filter((item: any) => item.nextFollowUp && item.nextFollowUp.slice(0, 10) < today && !["WON", "LOST"].includes(item.status)).length} />
      <Kpi title="Surveys awaiting scheduling" value={surveys.filter((item) => item.status === "PENDING" && !item.scheduledFor).length} />
      <Kpi title="Quotations awaiting acceptance" value={enquiries.reduce((count: number, item: any) => count + (item.quotations ?? []).filter((quote: any) => quote.status === "ISSUED").length, 0)} />
      <Kpi title="Accepted quotations" value={enquiries.reduce((count: number, item: any) => count + (item.quotations ?? []).filter((quote: any) => quote.status === "ACCEPTED").length, 0)} />
      <Kpi title="Orders in progress" value={(data?.orders ?? []).filter((order) => !["INSTALLED", "CANCELLED"].includes(order.status)).length} />
    </>;
    if (user.role === "SURVEYOR") return <>
      <Kpi title="Assigned surveys" value={surveys.length} />
      <Kpi title="Today's site visits" value={surveys.filter((survey) => survey.scheduledFor?.slice(0, 10) === today).length} />
      <Kpi title="Draft / in progress" value={surveys.filter((survey) => ["PENDING", "IN_PROGRESS"].includes(survey.status)).length} />
      <Kpi title="Submitted for review" value={surveys.filter((survey) => survey.status === "SUBMITTED").length} />
      <Kpi title="Approved assessments" value={surveys.filter((survey) => survey.status === "APPROVED").length} />
      <Kpi title="Corrections required" value={surveys.filter((survey) => survey.status === "REJECTED").length} />
    </>;
    if (user.role === "WAREHOUSE") return <>
      <Kpi title="Stock products" value={data?.inventory?.length ?? 0} />
      <Kpi title="Available units" value={(data?.inventory ?? []).reduce((total, item) => total + Number(item.available), 0)} />
      <Kpi title="Reserved units" value={(data?.inventory ?? []).reduce((total, item) => total + Number(item.reserved), 0)} />
      <Kpi title="Low-stock items" value={lowStock} note="At or below reorder threshold" />
      <Kpi title="Out of stock" value={(data?.inventory ?? []).filter((item) => Number(item.available) <= 0).length} />
      <Kpi title="Open purchase orders" value={(data?.purchaseOrders ?? []).filter((order) => ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)).length} />
      <Kpi title="Awaiting goods receipt" value={(data?.purchaseOrders ?? []).filter((order) => ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)).length} />
      <Kpi title="Orders awaiting dispatch" value={data?.orders?.length ?? 0} />
      <Kpi title="Inventory valuation" value={inr((data?.inventory ?? []).reduce((total, item) => total + Number(item.value), 0))} />
    </>;
    if (user.role === "TECHNICIAN") return <>
      <Kpi title="Assigned installation jobs" value={jobs.length} />
      <Kpi title="Scheduled today" value={jobs.filter((job) => job.scheduledFor?.slice(0, 10) === today).length} />
      <Kpi title="In progress" value={jobs.filter((job) => job.status === "IN_PROGRESS").length} />
      <Kpi title="Completed jobs" value={jobs.filter((job) => job.status === "COMPLETED").length} />
      <Kpi title="Waiting for equipment" value={jobs.filter((job) => job.order.status !== "DELIVERED" && job.status !== "COMPLETED").length} />
    </>;
    if (user.role === "SUPPORT") return <>
      <Kpi title="Open tickets" value={tickets.filter((ticket) => ["OPEN", "IN_PROGRESS"].includes(ticket.status)).length} />
      <Kpi title="Urgent tickets" value={tickets.filter((ticket) => ticket.priority === "URGENT" && !["RESOLVED", "CLOSED"].includes(ticket.status)).length} />
      <Kpi title="Awaiting customer confirmation" value={tickets.filter((ticket) => ticket.status === "RESOLVED").length} />
      <Kpi title="Customer-confirmed / closed" value={tickets.filter((ticket) => ticket.status === "CLOSED").length} />
      <Kpi title="Tickets in history" value={tickets.length} />
    </>;
    return <>
      <Kpi title="Collected payments" value={inr((data?.orders ?? []).reduce((total, order) => total + Number(order.paid), 0))} />
      <Kpi title="Outstanding balances" value={inr((data?.orders ?? []).reduce((total, order) => total + Number(order.outstanding), 0))} />
      <Kpi title="Invoices outstanding" value={pendingInvoices.length} />
      <Kpi title="Technician pay outstanding" value={inr((data?.payments ?? []).reduce((total, payment) => total + Number(payment.outstanding), 0))} />
      <Kpi title="Subsidy applications pending" value={(data?.subsidies ?? []).filter((application) => !["APPROVED", "REJECTED", "PAID"].includes(application.status)).length} />
      <Kpi title="Subsidy documents missing" value={subsidyMissingDocuments} />
      <Kpi title="Recorded expenses" value={inr((data?.expenses ?? []).reduce((total, item) => total + Number(item.amount), 0))} />
    </>;
  };
  const links = shortcuts.filter((shortcut) => shortcut.roles.includes(user.role));
  const dueItems: { id: string; title: string; subtitle: string; status: string }[] =
    user.role === "SALES" ? enquiries.filter((item: any) => item.status === "NEW").slice(0, 6).map((item: any) => ({ id: item.id, title: item.reference ?? item.customer.name, subtitle: `${item.customer.name} · ${item.requestedKw} kW`, status: item.status })) :
    user.role === "SURVEYOR" ? surveys.filter((item) => !["APPROVED"].includes(item.status)).slice(0, 6).map((item) => ({ id: item.id, title: item.enquiry.customer.name, subtitle: `${item.enquiry.requestedKw} kW · ${item.scheduledFor ? new Date(item.scheduledFor).toLocaleDateString() : "Site visit not scheduled"}`, status: item.status })) :
    user.role === "WAREHOUSE" ? (data?.purchaseOrders ?? []).filter((order) => ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)).slice(0, 6).map((order) => ({ id: order.id, title: order.number, subtitle: `${order.supplier.name} · ${order.items.reduce((n: number, item: any) => n + item.qty - item.receivedQty, 0)} units to receive`, status: order.status })) :
    user.role === "TECHNICIAN" ? jobs.filter((job) => job.status !== "COMPLETED").slice(0, 6).map((job) => ({ id: job.id, title: job.order.number, subtitle: `${job.order.customer.name} · ${job.scheduledFor ? new Date(job.scheduledFor).toLocaleDateString() : "Schedule pending"}`, status: job.status })) :
    user.role === "SUPPORT" ? tickets.filter((ticket) => ["OPEN", "IN_PROGRESS"].includes(ticket.status)).slice(0, 6).map((ticket) => ({ id: ticket.id, title: ticket.number, subtitle: ticket.complaint, status: ticket.status })) :
    user.role === "FINANCE" ? pendingInvoices.slice(0, 6).map((invoice) => ({ id: invoice.id, title: invoice.number, subtitle: `${invoice.order.customer.name} · ${inr(invoice.outstanding)} due`, status: invoice.status })) : [];
  const dueTitle: Record<User["role"], string> = {
    ADMIN: "Recent activity", SALES: "New enquiries to contact", SURVEYOR: "Assigned site work",
    WAREHOUSE: "Goods awaiting receipt", TECHNICIAN: "Upcoming installations",
    SUPPORT: "Tickets to review", FINANCE: "Invoices needing attention",
  };
  return <div className="space-y-5">
    <div><p className="text-sm font-medium text-solar-700">Hello, {user.name}</p><h1 className="mt-1 text-2xl font-semibold">{roleTitle[user.role]}</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">{roleIntroduction[user.role]}</p></div>
    {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
    {loading ? <Skeleton /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{content()}</div>}
    <div className="grid gap-4 lg:grid-cols-[1.4fr_.6fr]">
      <Card title="Your workspaces">
        <div className="grid gap-3 sm:grid-cols-2">{links.map(({ to, title, caption, icon: Icon }) => <Link key={to} to={to} className="group rounded-xl border border-slate-200 p-4 hover:border-solar-600 hover:bg-solar-50">
          <div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg bg-solar-50 text-solar-700"><Icon size={18} /></span><ArrowUpRight size={16} className="text-slate-400 group-hover:text-solar-700" /></div>
          <h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{caption}</p>
        </Link>)}</div>
      </Card>
      <Card title={dueTitle[user.role]}>
        {dueItems.length ? <div className="space-y-2">{dueItems.map((item) => <div key={item.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm"><div><b>{item.title}</b><span className="block text-slate-500">{item.subtitle}</span></div><Badge v={item.status} /></div>)}</div> :
          <div className="space-y-2 text-sm text-slate-600"><div className="flex gap-2"><Sun size={16} className="mt-0.5 shrink-0 text-amber-500" /><p>{links[0]?.caption ?? "Use your role-specific modules to update records."} Changes are saved to the shared project database.</p></div><Empty text="Nothing needs attention right now" /></div>}
      </Card>
    </div>
  </div>;
}
