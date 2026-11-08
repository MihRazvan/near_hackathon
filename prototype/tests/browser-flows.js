async (page) => {
  const base = new URL(page.url()).origin,
    errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  const persona = async (id) =>
    page.locator("[data-control=persona]").selectOption(id);
  const go = (path) => page.goto(base + path);
  const reset = async () => {
    await go("/");
    await page.locator("[data-action=reset-demo]").click();
    await page.locator("[data-action=confirm-reset]").click();
  };
  const submit = (selector) =>
    page
      .locator(selector + " button[type=submit]")
      .first()
      .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await reset();
  await persona("owner");
  await go("/host/assets/new");
  await page.locator("[data-action=choose-input][data-id=describe]").click();
  await page.locator("input[name=title]").fill("Neighbourhood Mini");
  await page.locator("input[name=model]").fill("MINI Cooper");
  await page
    .locator("textarea[name=description]")
    .fill("A city car for neighbourhood campaigns.");
  await submit("form[data-form=generate-asset]");
  await page.waitForURL("**/review");
  const assetId = page.url().split("/").at(-2);
  await submit("form[data-form=review-asset]");
  await page.waitForURL("**/spots");
  await page.locator("[data-action=add-spot]").click();
  await page.locator("input[name=name]").fill("Nose panel");
  await page.locator("input[name=price]").fill("90");
  await submit("form[data-form=edit-spot]");
  const newSpot = await page.locator("input[name=spotId]").inputValue();
  await page.locator("a").filter({ hasText: "Save & create sale" }).click();
  await page.locator("input[name=title]").fill("Neighbourhood December launch");
  await submit("form[data-form=sale-wizard]");
  const dates = {
    start: "2026-12-01",
    end: "2026-12-31",
    close: "2026-11-25",
    artworkDue: "2026-11-27",
    install: "2026-11-30",
    reviewEnd: "2027-01-03",
  };
  for (const [name, value] of Object.entries(dates))
    await page.locator("input[name=" + name + "]").fill(value);
  await submit("form[data-form=sale-wizard]");
  await page.locator("input[name=takeovers]").uncheck();
  await page.locator('select[name="rule-' + newSpot + '"]').selectOption("on");
  await submit("form[data-form=sale-wizard]");
  await page.locator("input[name=responsibility]").check();
  await submit("form[data-form=sale-wizard]");
  await submit("form[data-form=sale-wizard]");
  await page.waitForURL(/\/host\/sales\/sale-/);
  const saleId = page.url().split("/").at(-1);
  await go("/spaces/" + assetId + "?sale=" + saleId + "&spot=door");
  await persona("visitor");
  await page.locator("a").filter({ hasText: "Book this spot" }).click();
  await page.locator("a").filter({ hasText: "Sign in with a wallet" }).click();
  await page.locator("button[value=Rabby]").click();
  await page.locator("[data-action=complete-signin]").click();
  await page.waitForURL("**/checkout/**");
  await page.locator("input[name=terms]").check();
  await submit("form[data-form=checkout]");
  await page.locator("[data-action=approve-source]").click();
  const paymentURL = page.url();
  await page.reload();
  await page.locator("[data-action=settle-payment]").click();
  await page.locator("[data-action=authorize-purchase]").click();
  await page.locator("a").filter({ hasText: "Open your placement" }).click();
  const bookingId = page.url().split("/").at(-1);
  await go("/buy/placements/" + bookingId + "/artwork");
  await page
    .locator("input[name=creativeName]")
    .fill("Northstar · first revision");
  await submit("form[data-form=submit-artwork]");
  await persona("owner");
  await go("/host/bookings/" + bookingId + "/artwork");
  await page.locator("[data-action=request-artwork]").click();
  await page
    .locator("textarea[name=feedback]")
    .fill("Please leave more margin around the wordmark.");
  await submit("form[data-form=artwork-feedback]");
  await persona("buyer");
  await go("/buy/placements/" + bookingId + "/artwork");
  if (
    !(await page
      .getByText("Please leave more margin around the wordmark.")
      .count())
  )
    throw new Error("Creative feedback did not reach buyer.");
  await page
    .locator("input[name=creativeName]")
    .fill("Northstar · revision two");
  await submit("form[data-form=submit-artwork]");
  await persona("owner");
  await go("/host/bookings/" + bookingId + "/artwork");
  await page.locator("[data-action=approve-artwork]").click();
  await page.locator("[data-action=demo-controls]").click();
  await page.locator("#demo-sale-picker").selectOption(saleId);
  await page.locator("[data-action=advance-scenario][data-id=locked]").click();
  await page.locator("[data-action=lock-artwork]").click();
  await page.locator("[data-action=confirm-lock]").click();
  await go("/host/sales/" + saleId + "/fulfillment");
  await submit("form[data-form=submit-proof]");
  await persona("buyer");
  await go("/buy/placements/" + bookingId + "?tab=delivery");
  await page.locator("[data-action=accept-proof]").click();
  await persona("owner");
  await go("/host/earnings");
  const heldRow = page
    .locator("tbody tr")
    .filter({ hasText: "Neighbourhood December launch" });
  if (!/held/i.test(await heldRow.innerText()))
    throw new Error("Installation proof released earnings too early.");
  await page.locator("[data-action=demo-controls]").click();
  await page.locator("#demo-sale-picker").selectOption(saleId);
  await page
    .locator("[data-action=advance-scenario][data-id=completed]")
    .click();
  const availableRow = page
    .locator("tbody tr")
    .filter({ hasText: "Neighbourhood December launch" });
  await availableRow.getByRole("button", { name: "Request payout" }).click();
  await page.locator("[data-action=confirm-payout]").click();
  await page.locator("[data-action=finish-payout]").click();
  if (
    !(await page
      .getByRole("heading", { name: "Your earnings, delivered." })
      .count())
  )
    throw new Error("Owner payout did not finish.");
  // Review notes can be saved against any page.
  await page.locator("[data-action=demo-controls]").click();
  await page.locator("[data-action=add-feedback]").click();
  await page
    .locator("textarea[name=note]")
    .fill("Review note from the end-to-end walkthrough.");
  await submit("form[data-form=feedback]");
  const story = { assetId, saleId, bookingId, paymentURL };
  // A second independent scenario proves takeover, wallet separation and credits.
  await reset();
  await persona("challenger");
  await go("/checkout/sale-alpine?spot=door");
  await page.locator("input[name=terms]").check();
  await submit("form[data-form=checkout]");
  await page.locator("[data-action=approve-source]").click();
  await page.locator("[data-action=settle-payment]").click();
  await page.locator("[data-action=authorize-purchase]").click();
  await page.reload();
  await persona("buyer");
  await go("/buy/money");
  if (
    !(await page.getByText("120 USDC", { exact: true }).count()) ||
    !(await page.getByText("12 USDC", { exact: true }).count())
  )
    throw new Error("Original payer credits were not split correctly.");
  await page.locator("[data-action=claim-credit]").click();
  await page.locator("[data-action=confirm-claim]").click();
  await page.locator("[data-action=finish-withdrawal]").click();
  if (!(await page.getByRole("heading", { name: "Credit delivered." }).count()))
    throw new Error("Credit claim did not complete.");
  const ledger = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("everywhere-experience-v1"));
    return {
      bookings: s.bookings.length,
      credits: s.credits.length,
      withdrawals: s.withdrawals.length,
      displaced: s.bookings.find((b) => b.id === "booking-door").status,
    };
  });
  if (
    ledger.bookings !== 5 ||
    ledger.credits !== 1 ||
    ledger.withdrawals !== 1 ||
    ledger.displaced !== "displaced"
  )
    throw new Error("Takeover or payment resume duplicated business records.");
  await persona("operator");
  await go("/ops/cases/case-101");
  await page.locator("select[name=decision]").selectOption("evidence");
  await page
    .locator("textarea[name=reason]")
    .fill("Please provide a clear photo of the installed panel.");
  await submit("form[data-form=resolve-case]");
  await go("/ops/audit");
  if (!(await page.getByText(/Operator decision evidence/).count()))
    throw new Error("Operator decision was not recorded.");
  if (errors.length || external.length)
    throw new Error(JSON.stringify({ errors, external }));
  await reset();
  return {
    ownerCreationPublishingFulfillmentAndPayout: true,
    artworkRevisionRoundTrip: true,
    proofDoesNotReleaseEarnings: true,
    walletSignInAndPaymentResume: true,
    takeoverAndOriginalWalletCredits: true,
    operatorAudit: true,
    reviewNotes: true,
    realWalletCalls: 0,
    externalRequests: external,
    story,
    ledger,
  };
}
