/**
 * Finance module verification (FR-FIN.1–4) against the seeded DB. Mutating
 * checks (log expense, generate bill) run last; re-run `npm run db:seed`
 * afterwards to reset.
 *
 * Usage: npm run test:finance
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

async function main() {
  const { closeDb } = await import("@/db");
  const fin = await import("@/lib/data/finance");
  const { listEventsInRange } = await import("@/lib/data/events");
  const { budgetStatus, currentMonthKey, fmtMoney } = await import("@/lib/finance");
  const { todayISO, addDaysISO } = await import("@/lib/dates");

  const OWNER = process.env.SEED_USER_ID!;
  const FOREIGN = "00000000-0000-0000-0000-00000000dead";
  const month = currentMonthKey();

  // --- pure -----------------------------------------------------------------
  check("fmtMoney: A$1,234", fmtMoney(1234) === "A$1,234");
  check("fmtMoney cents+sign: +A$29,342.18", fmtMoney(29342.18, { cents: true, sign: true }) === "+A$29,342.18");
  check("budgetStatus: good/warn/over", budgetStatus(50, 100) === "good" && budgetStatus(90, 100) === "warn" && budgetStatus(110, 100) === "over");

  // --- FR-FIN.1 accounts + net worth ----------------------------------------
  const accounts = await fin.listAccounts(OWNER);
  check("accounts: 4 seeded", accounts.length === 4, `got ${accounts.length}`);
  const nw = await fin.currentNetWorth(OWNER);
  check("net worth = Σ balances ≈ 29,342.18", near(nw, 29342.18), `${nw}`);
  const series = await fin.netWorthSeries(OWNER, 7);
  check("net worth series: monthly points, oldest→newest", series.length >= 2 && series.every((p, i) => i === 0 || series[i - 1].monthKey < p.monthKey), JSON.stringify(series.map((p) => p.value)));
  check("net worth delta this month is a number", Number.isFinite(await fin.netWorthDelta(OWNER)));

  // --- FR-FIN.2 budgets + expenses ------------------------------------------
  const budgets = await fin.listBudgets(OWNER);
  check("budgets: 5 categories", budgets.length === 5, `got ${budgets.length}`);
  const bva = await fin.budgetVsActual(OWNER, month);
  const spentBy = new Map(bva.rows.map((r) => [r.category, r.spent]));
  check("budget vs actual: Groceries 312.4", near(spentBy.get("Groceries") ?? 0, 312.4), `${spentBy.get("Groceries")}`);
  check("budget vs actual: Eating out 148.5", near(spentBy.get("Eating out") ?? 0, 148.5), `${spentBy.get("Eating out")}`);
  check("budget vs actual: Transport 86", near(spentBy.get("Transport") ?? 0, 86));
  check("budget vs actual: Subscriptions 63.97", near(spentBy.get("Subscriptions") ?? 0, 63.97));
  check("budget vs actual: Other 96.8", near(spentBy.get("Other") ?? 0, 96.8));
  const expenses = await fin.listExpenses(OWNER, { monthKey: month });
  check("expenses: 17 this month, newest first", expenses.length === 17 && expenses.every((e, i) => i === 0 || expenses[i - 1].dateISO >= e.dateISO), `got ${expenses.length}`);
  check("monthly spend series ends at this month", (await fin.monthlySpend(OWNER, 6)).at(-1)?.monthKey === month);

  // --- FR-FIN.3 savings ------------------------------------------------------
  const savings = await fin.listSavings(OWNER);
  check("savings: 2 goals", savings.length === 2, `got ${savings.length}`);
  const house = savings.find((s) => s.name === "House deposit");
  check("savings: house 7350/12000 + funds→ stub label", house?.current === 7350 && house?.target === 12000 && Boolean(house?.fundsLabel), JSON.stringify(house));

  // --- FR-FIN.4 bills --------------------------------------------------------
  const bills = await fin.listBills(OWNER);
  check("bills: 4 in register, ordered by nextDue", bills.length === 4 && bills.every((b, i) => i === 0 || bills[i - 1].nextDue <= b.nextDue), `got ${bills.length}`);

  // --- calendar: finance records hidden, bill occurrences shown -------------
  const cal = await listEventsInRange(OWNER, addDaysISO(todayISO(), -35), addDaysISO(todayISO(), 35));
  check("calendar hides accounts/budgets/expenses/savings/bill-defs", !cal.some((e) => ["Everyday — Up", "Budget — Groceries", "Coles — groceries", "House deposit"].includes(e.title)));
  check("calendar still shows seeded bill occurrences", cal.some((e) => e.kind === "bill" && (e.title === "Rent" || e.title === "Electricity bill")));

  // --- scoping ---------------------------------------------------------------
  check("scoping: foreign sees nothing", (await fin.listAccounts(FOREIGN)).length === 0 && (await fin.listBudgets(FOREIGN)).length === 0 && (await fin.listExpenses(FOREIGN)).length === 0);

  // --- mutations: expense capture + budget updates --------------------------
  await fin.createExpense(OWNER, { amount: 25.5, category: "Groceries", description: "Test milk run" });
  const bva2 = await fin.budgetVsActual(OWNER, month);
  check("log expense: Groceries spend += 25.5 → 337.9", near(bva2.rows.find((r) => r.category === "Groceries")!.spent, 337.9), `${bva2.rows.find((r) => r.category === "Groceries")!.spent}`);

  // update account → net worth recompute writes today's point
  await fin.updateAccount(OWNER, accounts[0].id, { name: accounts[0].name, balance: accounts[0].balance + 100 });
  check("update account: net worth += 100", near(await fin.currentNetWorth(OWNER), nw + 100), `${await fin.currentNetWorth(OWNER)}`);
  const seriesNow = await fin.netWorthSeries(OWNER, 7);
  check("net worth series: today's recompute reflected in current month", near(seriesNow.at(-1)!.value, nw + 100), JSON.stringify(seriesNow.at(-1)));

  // generate a bill occurrence → lands on the calendar, nextDue advances
  const rent = bills.find((b) => b.name === "Rent")!;
  await fin.generateBillOccurrence(OWNER, rent.id);
  const rentAfter = (await fin.listBills(OWNER)).find((b) => b.name === "Rent")!;
  check("generate bill: nextDue advanced by a month", rentAfter.nextDue > rent.nextDue, `${rent.nextDue} → ${rentAfter.nextDue}`);
  const calAfter = await listEventsInRange(OWNER, addDaysISO(todayISO(), -5), addDaysISO(todayISO(), 40));
  check("generate bill: occurrence added to calendar", calAfter.filter((e) => e.title === "Rent" && e.kind === "bill").length >= 1);

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
