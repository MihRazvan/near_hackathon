import test from "node:test";
import assert from "node:assert/strict";
globalThis.window = new EventTarget();
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
const {
  state,
  reset,
  sale,
  booking,
  effectiveTakeover,
  simulateBooking,
  myBookings,
} = await import("../src/store.mjs");
const { creditAmounts } = await import("../src/buyer.mjs");
const { ownerForms, saleEarnings } = await import("../src/owner.mjs");
const { routes, matchRoute } = await import("../src/routes.mjs");

test("a takeover updates the holder and leaves principal and conditional reward with the displaced wallet", () => {
  reset();
  state.persona = "challenger";
  const b = simulateBooking({
    saleId: "sale-alpine",
    spotId: "door",
    campaignId: "orbit-local",
    paymentId: "one-payment",
  });
  assert.equal(b.amount, 180);
  assert.equal(b.buyerId, "challenger");
  assert.equal(booking("booking-door").status, "displaced");
  assert.equal(state.credits.length, 1);
  const c = state.credits[0];
  assert.equal(c.buyerId, "buyer");
  assert.deepEqual(creditAmounts(c), { available: 120, conditional: 12 });
  assert.equal(myBookings().length, 2);
  state.persona = "buyer";
  assert.ok(myBookings().some((b) => b.status === "displaced"));
  assert.equal(saleEarnings(sale("sale-alpine")).total, 168);
});
test("resuming a payment cannot accept a second booking or create another prior-holder credit", () => {
  reset();
  state.persona = "challenger";
  const args = {
    saleId: "sale-alpine",
    spotId: "door",
    campaignId: "orbit-local",
    paymentId: "same-payment",
  };
  const first = simulateBooking(args),
    count = state.bookings.length;
  assert.equal(simulateBooking(args).id, first.id);
  assert.equal(state.bookings.length, count);
  assert.equal(state.credits.length, 1);
});
test("fixed booked spots and repurchasing the same current holding cannot create another purchase", () => {
  reset();
  assert.throws(
    () =>
      simulateBooking({
        saleId: "sale-honda",
        spotId: "tank",
        buyerId: "challenger",
      }),
    /fixed booking/,
  );
  assert.throws(
    () =>
      simulateBooking({
        saleId: "sale-alpine",
        spotId: "door",
        buyerId: "buyer",
      }),
    /already holds/,
  );
  assert.equal(state.credits.length, 0);
});
test("installation proof alone does not release owner earnings; campaign, review and open cases matter", () => {
  reset();
  const s = sale("sale-alpine"),
    b = booking("booking-door");
  b.proof = "accepted";
  s.phase = "live";
  assert.equal(saleEarnings(s).eligible, false);
  s.phase = "completed";
  state.clock = "2027-01-01";
  assert.equal(saleEarnings(s).eligible, false);
  state.clock = "2027-01-04";
  assert.equal(saleEarnings(s).eligible, true);
  state.cases.push({ id: "test", bookingId: b.id, status: "open" });
  assert.equal(saleEarnings(s).eligible, false);
  state.cases.at(-1).status = "resolved";
  assert.equal(saleEarnings(s).eligible, true);
});
test("changing a sale default preserves the funded spot while unbooked inherited spots use the new rule", () => {
  reset();
  const s = sale("sale-alpine"),
    p = s.layout.find((p) => p.id === "door"),
    data = new FormData();
  data.set("id", s.id);
  data.set("title", s.title);
  data.set("description", s.description);
  for (const spot of s.layout) {
    data.set("price-" + spot.id, "1");
    data.set("rule-" + spot.id, "inherit");
  }
  ownerForms["edit-sale"](data);
  assert.equal(s.takeovers, false);
  assert.equal(p.price, 120);
  assert.equal(effectiveTakeover(s, p), true);
  const other = s.layout.find((p) => p.id === "bonnet");
  assert.equal(effectiveTakeover(s, other), false);
  assert.equal(other.price, 1);
});
test("conditional rewards remain conditional until the campaign issue-review exposure ends", () => {
  reset();
  simulateBooking({
    saleId: "sale-alpine",
    spotId: "door",
    buyerId: "challenger",
  });
  const c = state.credits[0],
    s = sale("sale-alpine");
  s.phase = "completed";
  assert.equal(creditAmounts(c).conditional, 12);
  state.clock = "2027-01-04";
  assert.deepEqual(creditAmounts(c), { available: 132, conditional: 0 });
  c.claimed = true;
  c.bonusClaimed = true;
  assert.equal(creditAmounts(c).available, 0);
});
test("the 63 planned sample destinations resolve to unique page IDs without dynamic routes swallowing create routes", () => {
  assert.equal(routes.length, 63);
  assert.equal(new Set(routes.map((r) => r.id)).size, 63);
  for (const r of routes)
    assert.equal(matchRoute(r.sample.split("?")[0]).id, r.id, r.sample);
  assert.equal(matchRoute("/host/assets/new").id, "O03");
  assert.equal(matchRoute("/buy/campaigns/new").id, "B03");
  assert.equal(matchRoute("/not-a-real-page").id, "G01");
});
