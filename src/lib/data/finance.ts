import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { forUser } from "@/db";
import { events, metricDatapoints, metrics } from "@/db/schema";
import { addDaysISO, parseISODate, toISODate } from "@/lib/dates";
import { nextDueISO } from "@/lib/recurrence";
import {
  currentMonthKey,
  monthBounds,
  monthKey,
  round2,
} from "@/lib/finance";

const NET_WORTH = "Net worth";

// --- payload shapes ----------------------------------------------------------

type AccountPayload = { fin: "account"; balance: number };
type BudgetPayload = { fin: "budget"; category: string; cap: number };
type ExpensePayload = { fin: "expense"; amount: number; category: string };
type SavingsPayload = { fin: "savings"; current: number; target: number; fundsLabel?: string };
type BillPayload = {
  fin: "bill";
  amount: number;
  category: string;
  recurrence: string;
  nextDue: string;
};

const finIs = (kind: string) => sql`(${events.payload} ->> 'fin') = ${kind}`;
const financeBase = (kind: string) =>
  and(eq(events.domain, "finance"), eq(events.archived, false), finIs(kind));

// --- view types --------------------------------------------------------------

export type Account = { id: string; name: string; balance: number };
export type Budget = { id: string; category: string; cap: number };
export type Expense = { id: string; dateISO: string; description: string; amount: number; category: string };
export type SavingsGoal = { id: string; name: string; current: number; target: number; fundsLabel: string | null };
export type Bill = { id: string; name: string; amount: number; category: string; recurrence: string; nextDue: string };
export type BudgetActual = { id: string; category: string; cap: number; spent: number };
export type NetWorthPoint = { monthKey: string; value: number };
export type MonthSpend = { monthKey: string; total: number };

const midday = (dateISO: string): Date => {
  const d = parseISODate(dateISO);
  d.setHours(12, 0, 0, 0);
  return d;
};

// --- accounts + net worth (FR-FIN.1) -----------------------------------------

export async function listAccounts(userId: string): Promise<Account[]> {
  const rows = await forUser(userId).select(events, {
    where: financeBase("account"),
    orderBy: [events.title],
  });
  return rows.map((r) => ({ id: r.id, name: r.title, balance: (r.payload as AccountPayload).balance }));
}

export async function currentNetWorth(userId: string): Promise<number> {
  const accounts = await listAccounts(userId);
  return round2(accounts.reduce((s, a) => s + a.balance, 0));
}

export const getAccount = async (userId: string, id: string): Promise<Account | null> =>
  (await listAccounts(userId)).find((a) => a.id === id) ?? null;

/**
 * Recomputes today's net worth = Σ account balances into the "Net worth"
 * Metric (FR-FIN.1), replacing any prior point for today so it stays
 * idempotent. Historical points (other days) are untouched.
 */
async function recomputeNetWorth(userId: string): Promise<void> {
  const udb = forUser(userId);
  const total = await currentNetWorth(userId);

  let [metric] = await udb.select(metrics, {
    where: and(eq(metrics.domain, "finance"), eq(metrics.name, NET_WORTH)),
  });
  if (!metric) {
    [metric] = await udb.insert(metrics, {
      domain: "finance",
      name: NET_WORTH,
      unit: "AUD",
      direction: "higher-better",
    });
  }

  const today = toISODate(new Date());
  await udb.delete(
    metricDatapoints,
    and(
      eq(metricDatapoints.metricId, metric.id),
      eq(metricDatapoints.source, "accounts"),
      gte(metricDatapoints.timestamp, parseISODate(today)),
      lt(metricDatapoints.timestamp, parseISODate(addDaysISO(today, 1))),
    ),
  );
  await udb.insert(metricDatapoints, {
    metricId: metric.id,
    timestamp: midday(today),
    value: total,
    source: "accounts",
  });
}

export async function createAccount(userId: string, input: { name: string; balance: number }): Promise<void> {
  await forUser(userId).insert(events, {
    domain: "finance",
    kind: "other",
    title: input.name,
    start: new Date(),
    payload: { fin: "account", balance: round2(input.balance) } satisfies AccountPayload,
  });
  await recomputeNetWorth(userId);
}

export async function updateAccount(
  userId: string,
  id: string,
  input: { name: string; balance: number },
): Promise<void> {
  await forUser(userId).update(
    events,
    { title: input.name, payload: { fin: "account", balance: round2(input.balance) } satisfies AccountPayload },
    and(eq(events.id, id), finIs("account")),
  );
  await recomputeNetWorth(userId);
}

export async function archiveAccount(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), finIs("account")));
  await recomputeNetWorth(userId);
}

/** Monthly net-worth series (last point per month), oldest→newest, for the chart. */
export async function netWorthSeries(userId: string, months = 7): Promise<NetWorthPoint[]> {
  const udb = forUser(userId);
  const [metric] = await udb.select(metrics, {
    where: and(eq(metrics.domain, "finance"), eq(metrics.name, NET_WORTH)),
  });
  if (!metric) return [];
  const points = await udb.select(metricDatapoints, {
    where: eq(metricDatapoints.metricId, metric.id),
    orderBy: [metricDatapoints.timestamp],
  });
  const byMonth = new Map<string, number>();
  for (const p of points) byMonth.set(monthKey(toISODate(p.timestamp)), p.value); // ordered → keeps latest
  return [...byMonth.entries()]
    .map(([m, value]) => ({ monthKey: m, value }))
    .slice(-months);
}

export async function netWorthDelta(userId: string): Promise<number> {
  const series = await netWorthSeries(userId, 24);
  const current = await currentNetWorth(userId);
  const thisMonth = currentMonthKey();
  const prior = series.filter((p) => p.monthKey < thisMonth);
  const base = prior.length ? prior[prior.length - 1].value : series[0]?.value ?? current;
  return round2(current - base);
}

// --- budgets + expenses (FR-FIN.2) -------------------------------------------

export async function listBudgets(userId: string): Promise<Budget[]> {
  const rows = await forUser(userId).select(events, {
    where: financeBase("budget"),
    orderBy: [events.title],
  });
  return rows.map((r) => {
    const p = r.payload as BudgetPayload;
    return { id: r.id, category: p.category, cap: p.cap };
  });
}

export async function upsertBudget(userId: string, category: string, cap: number): Promise<void> {
  const udb = forUser(userId);
  const existing = (await listBudgets(userId)).find((b) => b.category === category);
  if (existing) {
    await udb.update(
      events,
      { payload: { fin: "budget", category, cap: round2(cap) } satisfies BudgetPayload },
      and(eq(events.id, existing.id), finIs("budget")),
    );
  } else {
    await udb.insert(events, {
      domain: "finance",
      kind: "other",
      title: `Budget — ${category}`,
      start: new Date(),
      payload: { fin: "budget", category, cap: round2(cap) } satisfies BudgetPayload,
    });
  }
}

export async function archiveBudget(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), finIs("budget")));
}

export async function listExpenses(
  userId: string,
  opts: { monthKey?: string; limit?: number } = {},
): Promise<Expense[]> {
  const bounds = opts.monthKey ? monthBounds(opts.monthKey) : null;
  const rows = await forUser(userId).select(events, {
    where: bounds
      ? and(
          financeBase("expense"),
          gte(events.start, parseISODate(bounds.from)),
          lt(events.start, parseISODate(bounds.to)),
        )
      : financeBase("expense"),
    orderBy: [desc(events.start), desc(events.createdAt)],
  });
  const mapped = rows.map((r): Expense => {
    const p = r.payload as ExpensePayload;
    return { id: r.id, dateISO: toISODate(r.start), description: r.title, amount: p.amount, category: p.category };
  });
  return opts.limit ? mapped.slice(0, opts.limit) : mapped;
}

export async function createExpense(
  userId: string,
  input: { amount: number; category: string; description?: string; dateISO?: string },
): Promise<Expense> {
  const dateISO = input.dateISO ?? toISODate(new Date());
  const [row] = await forUser(userId).insert(events, {
    domain: "finance",
    kind: "other",
    title: input.description?.trim() || input.category,
    start: midday(dateISO),
    payload: { fin: "expense", amount: round2(input.amount), category: input.category } satisfies ExpensePayload,
  });
  const p = row.payload as ExpensePayload;
  return { id: row.id, dateISO, description: row.title, amount: p.amount, category: p.category };
}

export async function archiveExpense(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), finIs("expense")));
}

/** Pure: per-budget spend vs cap from already-fetched budgets + expenses. */
export function computeBudgetVsActual(
  budgets: Budget[],
  expenses: Expense[],
): { rows: BudgetActual[]; spent: number; cap: number } {
  const spentByCat = new Map<string, number>();
  for (const e of expenses) spentByCat.set(e.category, round2((spentByCat.get(e.category) ?? 0) + e.amount));

  const rows = budgets.map((b) => ({ id: b.id, category: b.category, cap: b.cap, spent: spentByCat.get(b.category) ?? 0 }));
  return {
    rows,
    spent: round2(rows.reduce((s, r) => s + r.spent, 0)),
    cap: round2(rows.reduce((s, r) => s + r.cap, 0)),
  };
}

/** Per-budget spend vs cap for a month (default current). */
export async function budgetVsActual(
  userId: string,
  month = currentMonthKey(),
): Promise<{ rows: BudgetActual[]; spent: number; cap: number }> {
  const [budgets, expenses] = await Promise.all([
    listBudgets(userId),
    listExpenses(userId, { monthKey: month }),
  ]);
  return computeBudgetVsActual(budgets, expenses);
}

/** Total spend per month over the last `months`, oldest→newest (spend chart). */
export async function monthlySpend(userId: string, months = 6): Promise<MonthSpend[]> {
  const all = await listExpenses(userId);
  const byMonth = new Map<string, number>();
  for (const e of all) byMonth.set(monthKey(e.dateISO), round2((byMonth.get(monthKey(e.dateISO)) ?? 0) + e.amount));
  const out: MonthSpend[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ monthKey: key, total: byMonth.get(key) ?? 0 });
  }
  return out;
}

// --- savings goals (FR-FIN.3) ------------------------------------------------

export async function listSavings(userId: string): Promise<SavingsGoal[]> {
  const rows = await forUser(userId).select(events, {
    where: financeBase("savings"),
    orderBy: [events.title],
  });
  return rows.map((r) => {
    const p = r.payload as SavingsPayload;
    return { id: r.id, name: r.title, current: p.current, target: p.target, fundsLabel: p.fundsLabel ?? null };
  });
}

export async function createSavings(
  userId: string,
  input: { name: string; target: number; current?: number; fundsLabel?: string },
): Promise<string> {
  const [row] = await forUser(userId).insert(events, {
    domain: "finance",
    kind: "other",
    title: input.name,
    start: new Date(),
    payload: {
      fin: "savings",
      current: round2(input.current ?? 0),
      target: round2(input.target),
      // funds→ life-goal Link is wired by the goal engine (setSavingsFundsGoal)
      fundsLabel: input.fundsLabel,
    } satisfies SavingsPayload,
  });
  return row.id;
}

export async function updateSavings(
  userId: string,
  id: string,
  input: { name: string; target: number; current: number; fundsLabel?: string },
): Promise<void> {
  await forUser(userId).update(
    events,
    {
      title: input.name,
      payload: {
        fin: "savings",
        current: round2(input.current),
        target: round2(input.target),
        fundsLabel: input.fundsLabel,
      } satisfies SavingsPayload,
    },
    and(eq(events.id, id), finIs("savings")),
  );
}

export async function archiveSavings(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), finIs("savings")));
}

export const getSavingsGoal = async (userId: string, id: string): Promise<SavingsGoal | null> =>
  (await listSavings(userId)).find((s) => s.id === id) ?? null;

// --- recurring bills / subscriptions (FR-FIN.4) ------------------------------

export async function listBills(userId: string): Promise<Bill[]> {
  const rows = await forUser(userId).select(events, {
    where: financeBase("bill"),
  });
  const bills = rows.map((r): Bill => {
    const p = r.payload as BillPayload;
    return { id: r.id, name: r.title, amount: p.amount, category: p.category, recurrence: p.recurrence, nextDue: p.nextDue };
  });
  return bills.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

export async function createBill(
  userId: string,
  input: { name: string; amount: number; category: string; recurrence: string; nextDue: string },
): Promise<void> {
  await forUser(userId).insert(events, {
    domain: "finance",
    kind: "other",
    title: input.name,
    start: new Date(),
    payload: {
      fin: "bill",
      amount: round2(input.amount),
      category: input.category,
      recurrence: input.recurrence,
      nextDue: input.nextDue,
    } satisfies BillPayload,
  });
}

export async function updateBill(
  userId: string,
  id: string,
  input: { name: string; amount: number; category: string; recurrence: string; nextDue: string },
): Promise<void> {
  await forUser(userId).update(
    events,
    {
      title: input.name,
      payload: {
        fin: "bill",
        amount: round2(input.amount),
        category: input.category,
        recurrence: input.recurrence,
        nextDue: input.nextDue,
      } satisfies BillPayload,
    },
    and(eq(events.id, id), finIs("bill")),
  );
}

export async function archiveBill(userId: string, id: string): Promise<void> {
  await forUser(userId).update(events, { archived: true }, and(eq(events.id, id), finIs("bill")));
}

export const getBill = async (userId: string, id: string): Promise<Bill | null> =>
  (await listBills(userId)).find((b) => b.id === id) ?? null;

/**
 * Generates the next occurrence of a recurring bill as a calendar Event
 * (kind=bill, no `fin` key → visible on calendar/dashboard as a reminder),
 * then advances the bill's nextDue per its recurrence (FR-FIN.4).
 */
export async function generateBillOccurrence(userId: string, billId: string): Promise<void> {
  const udb = forUser(userId);
  const [row] = await udb.select(events, { where: and(eq(events.id, billId), finIs("bill")) });
  if (!row) return;
  const bill = row.payload as BillPayload;

  await udb.insert(events, {
    domain: "finance",
    kind: "bill",
    title: row.title,
    start: midday(bill.nextDue),
    allDay: true,
    payload: { amount: bill.amount, currency: "AUD" },
  });

  const advanced = nextDueISO(bill.recurrence, bill.nextDue) ?? bill.nextDue;
  await udb.update(
    events,
    { payload: { ...bill, nextDue: advanced } satisfies BillPayload },
    and(eq(events.id, billId), finIs("bill")),
  );
}
