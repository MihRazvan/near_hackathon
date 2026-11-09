import { assert, uint, canonical, hashObject, nowIso } from "./core.mjs";

const CATEGORIES = [
  "sourceUsdc",
  "baseGas",
  "nearFees",
  "nearAllocationGross",
  "nearAllocation",
];
export class Budget {
  constructor(store, limits) {
    this.store = store;
    this.limits = limits;
    for (const name of CATEGORIES) uint(limits[name], name);
  }
  totals() {
    const totals = Object.fromEntries(CATEGORIES.map((key) => [key, 0n]));
    for (const row of this.store.db
      .prepare("SELECT * FROM budget_entries WHERE status<>?")
      .all("released"))
      totals[row.category] += uint(row.actual ?? row.reserved);
    return Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value.toString()]),
    );
  }
  reserve({ id, kind, scope, plan, amounts, transactionOpen=false }) {
    const perform=() => {
      const existing = this.store.operation(id),
        digest = hashObject(plan);
      if (existing) {
        assert(
          existing.plan_hash === digest &&
            existing.kind === kind &&
            existing.scope === scope,
          "OPERATION_CHANGED",
          "Operation id is already bound to a different plan",
        );
        return { operation: existing, dispatchAllowed: false };
      }
      const totals = this.totals();
      for (const [category, amount] of Object.entries(amounts)) {
        assert(
          CATEGORIES.includes(category),
          "INVALID_BUDGET",
          "Unknown budget category",
        );
        assert(
          uint(totals[category]) + uint(amount) <= uint(this.limits[category]),
          "BUDGET_EXCEEDED",
          `Test ${category} limit reached`,
        );
      }
      const now = nowIso();
      this.store.db
        .prepare(
          "INSERT INTO operations(id,kind,scope,plan_hash,plan,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(id, kind, scope, digest, canonical(plan), "reserved", now, now);
      for (const [category, amount] of Object.entries(amounts))
        this.store.db
          .prepare(
            "INSERT INTO budget_entries(operation_id,category,reserved,status) VALUES(?,?,?,?)",
          )
          .run(id, category, amount, "reserved");
      return { operation: this.store.operation(id), dispatchAllowed: true };
    };
    if(transactionOpen){assert(this.store.db.isTransaction,'TRANSACTION_REQUIRED','An open transaction is required');return perform();}
    return this.store.transaction(perform);
  }
  settle(id, actual, { evidence } = {}) {
    assert(
      evidence?.final === true && typeof evidence.transactionHash === "string",
      "FINAL_EVIDENCE_REQUIRED",
      "Final chain evidence is required to settle a budget",
    );
    return this.store.transaction(() => {
      const op = this.store.operation(id);
      assert(
        op && op.transaction_hash === evidence.transactionHash,
        "TRANSACTION_CHANGED",
        "Budget evidence must match the signed transaction",
      );
      const entries = this.store.db
        .prepare("SELECT * FROM budget_entries WHERE operation_id=?")
        .all(id);
      assert(
        Object.keys(actual).sort().join(",") ===
          entries
            .map((row) => row.category)
            .sort()
            .join(","),
        "INVALID_BUDGET",
        "Actual amounts must cover every reservation",
      );
      for (const row of entries) {
        const amount = actual[row.category];
        assert(
          uint(amount) <= uint(row.reserved),
          "RESERVATION_EXCEEDED",
          "Actual spend exceeds the pre-send reservation; reconciliation required",
        );
        if (row.status === "settled")
          assert(
            row.actual === amount,
            "BUDGET_CHANGED",
            "Settled accounting cannot change",
          );
        this.store.db
          .prepare(
            "UPDATE budget_entries SET actual=?,status=? WHERE operation_id=? AND category=?",
          )
          .run(amount, "settled", id, row.category);
      }
      return this.totals();
    });
  }
  releaseAllocation(
    id,
    { accountId, final, accountAbsent, tokenBalance, pendingLiabilities } = {},
  ) {
    assert(
      final === true &&
        accountAbsent === true &&
        tokenBalance === "0" &&
        pendingLiabilities === "0",
      "ALLOCATION_STILL_ACTIVE",
      "Account closure and zero token liabilities must be verified",
    );
    const op = this.store.operation(id);
    assert(
      op?.plan?.allocationAccount === accountId,
      "WRONG_ACCOUNT",
      "Recovery evidence must identify the allocated account",
    );
    this.store.db
      .prepare(
        "UPDATE budget_entries SET status=? WHERE operation_id=? AND category=? AND status=?",
      )
      .run("released", id, "nearAllocation", "settled");
    return this.totals();
  }
}
