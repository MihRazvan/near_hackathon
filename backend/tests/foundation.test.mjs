import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.mjs";
import { Budget } from "../src/budget.mjs";
import { units, canonical, hashObject } from "../src/core.mjs";
import { configFromEnv, parseEnv } from "../src/config.mjs";

const limits = {
  sourceUsdc: "1000000",
  baseGas: "100",
  nearFees: "100",
  nearAllocationGross: "1600",
  nearAllocation: "750",
};
const request = (
  id,
  amounts,
  plan = { recipient: "buyer", amount: "500000" },
) => ({ id, kind: "fund", scope: "buyer", plan, amounts });

test("money uses exact integer strings, never floats, exponent notation or silent rounding", () => {
  assert.equal(units("0.01", 6), "10000");
  assert.equal(units("0.15", 24), "150000000000000000000000");
  for (const amount of [0.1, "1e3", "-1", "0.0000001", "01"])
    assert.throws(() => units(amount, 6));
  assert.equal(hashObject({ b: 2, a: 1 }), hashObject({ a: 1, b: 2 }));
  assert.throws(() => canonical({ missing: undefined }));
});

test("credential loading preserves literal values and omits secrets from serializable configuration", () => {
  const parsed = parseEnv(
    'INTEGRATION_NEAR_PRIVATE_KEY="private-marker"\nINTEGRATION_ONECLICK_API_KEY=literal-marker\n',
  );
  const config = configFromEnv(parsed);
  assert.equal(config.keys.near, "private-marker");
  assert.equal(config.enabled, false);
  assert.equal(JSON.stringify(config).includes("private-marker"), false);
  assert.equal(JSON.stringify(config).includes("literal-marker"), false);
  assert.throws(() => parseEnv("DUPLICATE=a\nDUPLICATE=b"));
  assert.throws(() =>
    configFromEnv({ INTEGRATION_MAX_BASE_USDC_OUTFLOW: "Infinity" }),
  );
});

test("ownership, optimistic updates and durable restart preserve application records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "everywhere-db-"));
  let store;
  try {
    store = new Store(join(dir, "state.sqlite"));
    const row = store.insert("asset", "car", "owner-a", { title: "Car" });
    assert.throws(() =>
      store.update("asset", "car", "owner-b", row.version, { title: "Stolen" }),
    );
    store.update("asset", "car", "owner-a", row.version, { title: "Updated" });
    assert.throws(() =>
      store.update("asset", "car", "owner-a", row.version, { title: "Stale" }),
    );
    store.close();
    store = new Store(join(dir, "state.sqlite"));
    assert.equal(store.get("asset", "car").title, "Updated");
    assert.equal(store.get("asset", "car").version, 2);
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("gross source budgets aggregate across wallets and cannot be spent twice after a restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "everywhere-budget-"));
  let store;
  try {
    const path = join(dir, "state.sqlite");
    store = new Store(path);
    let budget = new Budget(store, limits);
    assert.equal(
      budget.reserve(request("a", { sourceUsdc: "600000", baseGas: "40" }))
        .dispatchAllowed,
      true,
    );
    store.transition("a", ["reserved"], "signed", {
      transactionHash: "base-hash-a",
    });
    store.close();
    store = new Store(path);
    budget = new Budget(store, limits);
    assert.equal(
      budget.reserve(request("a", { sourceUsdc: "600000", baseGas: "40" }))
        .dispatchAllowed,
      false,
    );
    assert.throws(
      () =>
        budget.reserve(request("b", { sourceUsdc: "500000", baseGas: "40" })),
      /limit reached/,
    );
    assert.equal(store.operation("b"), null);
    assert.throws(
      () =>
        budget.reserve(
          request(
            "a",
            { sourceUsdc: "600000" },
            { recipient: "attacker", amount: "600000" },
          ),
        ),
      /different plan/,
    );
    assert.equal(budget.totals().sourceUsdc, "600000");
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("unknown sends retain reservations; only matching final evidence can settle them", () => {
  const store = new Store();
  const budget = new Budget(store, limits);
  budget.reserve(request("op", { sourceUsdc: "500000", baseGas: "40" }));
  store.transition("op", ["reserved"], "signed", { transactionHash: "tx" });
  store.transition("op", ["signed"], "broadcast-unknown");
  assert.throws(() =>
    budget.settle(
      "op",
      { sourceUsdc: "0", baseGas: "0" },
      { evidence: { final: false, transactionHash: "tx" } },
    ),
  );
  assert.throws(() =>
    budget.settle(
      "op",
      { sourceUsdc: "0", baseGas: "0" },
      { evidence: { final: true, transactionHash: "other" } },
    ),
  );
  assert.equal(budget.totals().sourceUsdc, "500000");
  budget.settle(
    "op",
    { sourceUsdc: "0", baseGas: "20" },
    { evidence: { final: true, transactionHash: "tx" } },
  );
  assert.equal(budget.totals().sourceUsdc, "0");
  assert.equal(budget.totals().baseGas, "20");
  assert.throws(() =>
    store.transition("op", ["broadcast-unknown"], "signed", {
      transactionHash: "replacement",
    }),
  );
  store.close();
});

test("settlement overrun rolls back all accounting rather than partially releasing a budget", () => {
  const store = new Store();
  const budget = new Budget(store, limits);
  budget.reserve(request("op", { sourceUsdc: "500000", baseGas: "40" }));
  store.transition("op", ["reserved"], "signed", { transactionHash: "tx" });
  assert.throws(() =>
    budget.settle(
      "op",
      { sourceUsdc: "0", baseGas: "41" },
      { evidence: { final: true, transactionHash: "tx" } },
    ),
  );
  assert.deepEqual(budget.totals(), {
    sourceUsdc: "500000",
    baseGas: "40",
    nearFees: "0",
    nearAllocationGross: "0",
    nearAllocation: "0",
  });
  store.close();
});

test("storage capital can be reused after verified cleanup but gross allocation counter never resets", () => {
  const store = new Store();
  const budget = new Budget(store, limits);
  budget.reserve(
    request(
      "deploy",
      { nearAllocationGross: "700", nearAllocation: "700" },
      { allocationAccount: "test-contract.near" },
    ),
  );
  store.transition("deploy", ["reserved"], "signed", {
    transactionHash: "deploy-hash",
  });
  budget.settle(
    "deploy",
    { nearAllocationGross: "700", nearAllocation: "700" },
    { evidence: { final: true, transactionHash: "deploy-hash" } },
  );
  assert.throws(() =>
    budget.reserve(
      request("second", { nearAllocationGross: "700", nearAllocation: "700" }),
    ),
  );
  const recovered = {
    accountId: "test-contract.near",
    final: true,
    accountAbsent: true,
    tokenBalance: "0",
    pendingLiabilities: "0",
  };
  assert.throws(() =>
    budget.releaseAllocation("deploy", {
      ...recovered,
      pendingLiabilities: "1",
    }),
  );
  assert.throws(() =>
    budget.releaseAllocation("deploy", {
      ...recovered,
      accountId: "other.near",
    }),
  );
  budget.releaseAllocation("deploy", recovered);
  assert.equal(budget.totals().nearAllocation, "0");
  assert.equal(budget.totals().nearAllocationGross, "700");
  budget.reserve(
    request("second", { nearAllocationGross: "700", nearAllocation: "700" }),
  );
  assert.equal(budget.totals().nearAllocationGross, "1400");
  store.close();
});

test("two database connections share the same reservation limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "everywhere-shared-budget-"));
  let first, second;
  try {
    const path = join(dir, "state.sqlite");
    first = new Store(path);
    second = new Store(path);
    new Budget(first, limits).reserve(request("one", { sourceUsdc: "750000" }));
    assert.throws(() =>
      new Budget(second, limits).reserve(
        request("two", { sourceUsdc: "750000" }),
      ),
    );
  } finally {
    first?.close();
    second?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
