import {
  state,
  person,
  asset,
  sale,
  booking,
  ownerAssets,
  currentBooking,
  effectiveTakeover,
  update,
  persist,
  navigate,
  toast,
  requireSignIn,
  uid,
  log,
  notice,
} from "./store.mjs";
import { authRequired } from "./account.mjs";
import { creativePreview } from "./buyer.mjs";
import {
  esc,
  money,
  date,
  short,
  label,
  icon,
  link,
  button,
  badge,
  heading,
  card,
  field,
  textarea,
  select,
  empty,
  banner,
  stats,
  table,
  bookingRows,
  tabs,
  timeline,
  vehicle,
  assetCard,
  bars,
  checkList,
  modal,
  closeModal,
  readImage,
  download,
} from "./ui.mjs";
const ownedIds = () => new Set(ownerAssets().map((a) => a.id));
const ownSales = () => state.sales.filter((s) => ownedIds().has(s.assetId));
const ownBookings = () =>
  state.bookings.filter((b) => ownedIds().has(sale(b.saleId)?.assetId));
const canOwn = (a) => a && a.ownerId === (person().ownerId ?? person().id);
export function saleEarnings(s) {
  const all = state.bookings.filter(
      (b) => b.saleId === s.id && b.status !== "cancelled",
    ),
    credits = state.credits.filter((c) =>
      all.some((b) => b.id === c.bookingId),
    );
  const total = Math.max(
    0,
    all.reduce((n, b) => n + b.amount, 0) -
      credits.reduce((n, c) => n + c.principal + c.conditional, 0),
  );
  const openCase = state.cases.some(
    (c) => c.status !== "resolved" && all.some((b) => b.id === c.bookingId),
  );
  const delivered = all
    .filter((b) => b.status !== "displaced")
    .every((b) => b.proof === "accepted");
  const eligible =
    s.phase === "completed" &&
    state.clock > s.reviewEnd &&
    delivered &&
    !openCase;
  const paid = state.payouts.some(
    (p) => p.saleId === s.id && p.status === "paid",
  );
  const processing = state.payouts.some(
    (p) => p.saleId === s.id && p.status === "processing",
  );
  return { total, eligible, paid, processing, openCase, delivered };
}
export function ownerPage(r) {
  if (r.scope !== "owner") return "";
  if (person().id === "visitor") return authRequired();
  const q = new URLSearchParams(location.search),
    list = ownSales(),
    bs = ownBookings();
  if (r.id === "O01") return overview(list, bs);
  if (r.id === "O02")
    return (
      heading(
        "YOUR INVENTORY",
        "Every asset. More possibilities.",
        "Reuse a vehicle and its spot layout across different sales.",
        link(
          "/host/assets/new",
          `${icon("plus")} Add an asset`,
          "button primary",
        ),
      ) +
      (ownerAssets().length
        ? `<div class="asset-grid">${ownerAssets()
            .map(
              (a) =>
                `<div>${assetCard(a)}<div class="actions" style="margin:10px 0 22px">${link("/host/assets/" + a.id, "Manage asset", "button small")}${link("/host/sales/new?asset=" + a.id, "Create sale", "button small")}</div></div>`,
            )
            .join("")}</div>`
        : empty(
            "Your first asset starts here.",
            "Photograph or describe a vehicle, then define its advertising surfaces.",
            link("/host/assets/new", "Add an asset", "button primary"),
          ))
    );
  if (r.id === "O03") return assetWizard();
  if (r.id === "O04" || r.id === "O05") return capture(r.id === "O05");
  if (["O06", "O07", "O08"].includes(r.id)) {
    const a = asset(r.params.id);
    if (!canOwn(a)) return wrongOwner();
    if (r.id === "O06") return generationReview(a);
    if (r.id === "O08") return spotEditor(a, q);
    return assetDetail(a, q);
  }
  if (r.id === "O09") return salesList(list, q);
  if (r.id === "O10") return saleWizard(q);
  if (["O11", "O12", "O16"].includes(r.id)) {
    const s = sale(r.params.id);
    if (!s || !canOwn(asset(s.assetId))) return wrongOwner();
    if (r.id === "O11") return saleEdit(s);
    if (r.id === "O16") return fulfillment(s);
    return saleDetail(s, q);
  }
  if (r.id === "O13")
    return (
      heading(
        "ALL BOOKINGS",
        "The people on your spaces.",
        "Accepted and historical bookings across your own assets.",
      ) +
      card(
        "Booking history",
        table(
          ["Placement", "Brand", "Booking", "Artwork", "Paid", ""],
          bookingRows(bs, { owner: true }),
        ),
      )
    );
  if (r.id === "O14" || r.id === "O15") {
    const b = booking(r.params.id);
    if (!b || !canOwn(asset(sale(b.saleId)?.assetId))) return wrongOwner();
    return ownerBooking(b, r.id === "O15");
  }
  if (r.id === "O17") return calendar(list);
  if (r.id === "O18") return analytics(list, bs);
  if (r.id === "O19") return earnings(list);
  if (r.id === "O20") return payout(r.params.id);
  return "";
}
function wrongOwner() {
  return empty(
    "This asset belongs to another owner.",
    "Use the Mara review persona for the seeded owner story, or create an asset for your current wallet.",
    link("/host/assets/new", "Create your own asset", "button primary"),
  );
}
function overview(sales, bs) {
  const outstanding = bs.filter((b) => b.artwork === "submitted"),
    open = sales.filter((s) => s.phase === "open"),
    available = sales
      .filter((s) => saleEarnings(s).eligible && !saleEarnings(s).paid)
      .reduce((n, s) => n + saleEarnings(s).total, 0),
    held = sales
      .filter((s) => !saleEarnings(s).eligible && !saleEarnings(s).paid)
      .reduce((n, s) => n + saleEarnings(s).total, 0);
  return (
    heading(
      "YOUR OWNER WORKSPACE",
      `A little space. A lot of possibility.`,
      `Welcome back, ${esc(person().name.split(" ")[0])}. Here’s what needs your attention.`,
      link(
        "/host/sales/new",
        `${icon("plus")} Create a listing`,
        "button primary",
      ),
    ) +
    stats([
      ["Your assets", ownerAssets().length, "Reusable surface layouts"],
      ["Open sales", open.length, "Fixed campaign periods"],
      ["Held proceeds", money(held), "Campaign & review still running"],
      [
        "Available to withdraw",
        money(available),
        "Eligible completed campaigns",
      ],
    ]) +
    `<div class="grid two">${card("Your next steps", `<div class="task-list">${outstanding.map((b) => `<div class="task"><span class="task-icon">${icon("file")}</span><div><strong>Review ${esc(b.brand)} artwork</strong><p>${esc(asset(sale(b.saleId).assetId).title)} · ${esc(sale(b.saleId).layout.find((p) => p.id === b.spotId)?.name)}</p></div>${link("/host/bookings/" + b.id + "/artwork", icon("arrow"), "icon-button")}</div>`).join("")}<div class="task"><span class="task-icon">${icon("calendar")}</span><div><strong>Prepare your next campaign</strong><p>Reuse an existing asset and select new dates.</p></div>${link("/host/calendar", icon("arrow"), "icon-button")}</div></div>`)}${card("Inventory activity", `<p class="tiny muted">Illustrative listing visits · sample data</p>${bars()}<div class="row" style="margin-top:20px"><span class="tiny muted">Measured exposure is not available in this prototype.</span>${link("/host/analytics", "View analytics ↗", "text-link")}</div>`)}</div><div style="margin-top:25px">${card("Current sales", saleTable(sales.slice(0, 5)))}</div><div style="margin-top:25px">${card(
      "Latest activity",
      `<ul class="activity-list">${state.activity
        .slice(0, 5)
        .map(
          (a) =>
            `<li><div>${esc(a.text)}<small>${esc(a.time)}</small></div></li>`,
        )
        .join("")}</ul>`,
    )}</div>`
  );
}
function steps(names, index) {
  return `<nav class="wizard-steps" aria-label="Progress">${names.map((t, i) => `<span class="${i + 1 === index ? "current" : ""}"><i>${i + 1}</i>${t}</span>${i < names.length - 1 ? "<b>—</b>" : ""}`).join("")}</nav>`;
}
function assetWizard() {
  const d = state.draftAsset;
  return `<div class="wizard">${heading("CREATE YOUR FIRST POSSIBILITY", "Tell us what moves you.", "Start with a photo or a description. You can edit every suggested spot.", link("/host/assets", "Save & exit", "button"))}${steps(["Choose input", "Describe & upload", "Review", "Edit spots"], d.step ?? 1)}${
    d.step === 1
      ? `<section class="panel"><h2>How would you like to start?</h2><div class="choice-grid">${[
          [
            "photo",
            "upload",
            "Upload photos",
            "Use pictures of the actual vehicle.",
          ],
          [
            "phone",
            "car",
            "Use your phone",
            "A guided capture and desktop handoff.",
          ],
          [
            "describe",
            "file",
            "Describe a model",
            "Create an illustrative, editable draft.",
          ],
        ]
          .map(([method, i, t, x]) =>
            button(
              "choose-input",
              `${icon(i)}<strong>${t}</strong><small>${x}</small>`,
              `data-id="${method}"`,
              "choice",
            ),
          )
          .join(
            "",
          )}</div><p class="review-note">Generation is simulated. You’ll get an editable illustration, not a measured scan or print-ready template.</p></section>`
      : `<form class="panel" data-form="generate-asset"><h2>${d.method === "photo" ? "Your vehicle, in a few photos." : "Describe your vehicle."}</h2><div class="grid two">${field("title", "Asset title", d.title, "text", 'required placeholder="The neighbourhood courier"')}${select(
          "type",
          "Vehicle type",
          [
            ["car", "Car"],
            ["moto", "Motorcycle"],
            ["bike", "Bicycle"],
            ["van", "Van"],
          ],
          d.type,
        )}</div><div class="grid two">${field("model", "Make & model", d.model, "text", 'required placeholder="Polestar 2, 2024"')}${field("area", "Operating area", d.area, "text", "required")}</div>${textarea("description", "Describe the look and intended use", d.description, 'placeholder="A pale green electric car, used for city commutes. I would like door and rear-panel spots."')}${d.method === "photo" ? `<div class="upload-area">${icon("upload")}<strong>Add a real vehicle photo</strong><p>PNG/JPEG/WebP · up to 1.5 MB · optional for this mock</p><input type="file" name="photo" accept="image/png,image/jpeg,image/webp"/></div>` : ""}<div class="wizard-footer">${button("back-asset-step", "Back", "", "button")}<button class="button primary" type="submit">Generate editable draft ${icon("arrow")}</button></div></form>`
  }</div>`;
}
function capture(phone) {
  const captured = state.draftAsset.captured ?? [];
  return `<div class="wizard">${heading(phone ? "PHONE CAPTURE" : "CAPTURE / HANDOFF", phone ? "A few views. One good start." : "Your phone is the camera.", phone ? "Capture the real vehicle. Review and retake before finishing." : "Open the capture view, collect photos and return to the same saved draft.")}${phone ? `<form class="panel" data-form="capture-photo"><h2>Capture checklist</h2><div class="capture-grid">${["Side", "Front", "Rear"].map((view) => `<div class="capture-tile ${captured.includes(view) ? "done" : ""}">${icon(captured.includes(view) ? "check" : "car")}<strong>${view} view</strong><p>${captured.includes(view) ? "Sample captured" : "Still needed"}</p>${button("capture-sample", captured.includes(view) ? "Retake sample" : "Use sample", `data-id="${view}"`, "button small")}</div>`).join("")}</div>${field("photo", "Or take/upload a photo", "", "file", 'accept="image/png,image/jpeg,image/webp" capture="environment"')}<div class="actions"><button class="button" type="submit">Save photo</button>${link("/host/assets/new?captured=1", "Continue on desktop", "button primary")}</div><p class="tiny muted" style="margin-top:15px">Phone handoff is a same-browser simulation. No upload service or actual 3D reconstruction is used.</p></form>` : card("Continue on your phone", `<div class="qr-placeholder" aria-label="Decorative QR placeholder, use the phone preview link">${Array.from({ length: 169 }, (_, i) => `<i class="${(i * 7 + (i % 5)) % 3 ? "" : "off"}"></i>`).join("")}</div><p style="text-align:center" class="tiny muted">Mock QR illustration · use the link below for the working preview.</p><div class="actions" style="justify-content:center">${link("/capture/demo-capture", "Open phone capture preview", "button primary")}${link("/host/assets/new", "Back to draft", "button")}</div><hr class="divider"/><h3>Received photos</h3><p class="muted">${captured.length ? captured.map(esc).join(", ") : "No views captured yet. The sample phone view updates this saved draft."}</p>`)}</div>`;
}
function generationReview(a) {
  return (
    heading(
      "ASSET / GENERATED DRAFT",
      "A starting point. Yours to shape.",
      "Review the illustration and proposed surfaces before publishing real inventory.",
      link(
        "/host/assets/" + a.id + "/spots",
        "Edit your spots " + icon("arrow"),
        "button primary",
      ),
    ) +
    `<div class="split"><div>${vehicle(a, { large: true, spots: true })}${banner(a.photos?.length ? "Real photo supplied" : "Illustrative concept", "Suggested geometry and dimensions need owner confirmation before production.")}</div><form class="panel" data-form="review-asset"><input type="hidden" name="id" value="${a.id}"/><h2>Review the details</h2>${field("title", "Listing title", a.title, "text", "required")}${field("model", "Model", a.model, "text", "required")}${field("area", "Operating area", a.area)}${textarea("description", "Description", a.description)}<div class="actions"><button class="button primary" type="submit">Accept & edit spots</button>${button("regenerate-asset", "Regenerate sample", `data-id="${a.id}"`, "button")}</div></form></div>`
  );
}
function assetDetail(a, q) {
  const tab = q.get("tab") ?? "overview",
    base = "/host/assets/" + a.id,
    sales = ownSales().filter((s) => s.assetId === a.id);
  return (
    heading(
      "YOUR ASSET",
      a.title,
      esc(a.model) + " · " + esc(a.area),
      link(
        "/host/sales/new?asset=" + a.id,
        `${icon("plus")} Create a sale`,
        "button primary",
      ),
    ) +
    tabs(
      [
        ["Overview", base, "overview"],
        ["Photos & details", base + "?tab=details", "details"],
        ["Spots", base + "/spots", "spots"],
        ["Sales", base + "?tab=sales", "sales"],
        ["History", base + "?tab=history", "history"],
      ],
      tab,
    ) +
    (tab === "sales"
      ? card("Sales for this asset", saleTable(sales))
      : tab === "details"
        ? `<form class="panel" data-form="asset-details"><input type="hidden" name="id" value="${a.id}"/><div class="grid two">${field("title", "Asset title", a.title, "text", "required")}${field("model", "Model", a.model)}</div>${field("area", "Operating area", a.area)}${textarea("description", "Public description", a.description)}${field("photo", "Add or replace real photo", "", "file", 'accept="image/png,image/jpeg,image/webp"')}<button class="button primary" type="submit">Save asset details</button></form>`
        : tab === "history"
          ? card(
              "Asset history",
              `<ul class="activity-list">${state.activity.map((x) => `<li><div>${esc(x.text)}<small>${esc(x.time)}</small></div></li>`).join("")}</ul>`,
            )
          : `<div class="split"><div>${vehicle(a, { large: true, spots: true })}<div class="grid two" style="margin-top:20px">${card("Reusable inventory", `<h2>${a.spots.length} editable spots</h2><p class="muted">Save the layout once and use it for later campaign periods.</p>${link(base + "/spots", "Open surface editor", "button")}`)}${card("Sales", `<h2>${sales.length} campaign periods</h2><p class="muted">Historical and upcoming sales keep their own terms.</p>${link(base + "?tab=sales", "View all sales", "button")}`)}</div></div>${card("Ready for your next sale", checkList(["Review actual asset photos and operating area.", "Verify surface dimensions for production.", "Set fixed service dates and included pricing.", "Upload proof when the campaign is installed."]) + badge(a.status))}</div>`)
  );
}
function spotEditor(a, q) {
  const p = a.spots.find((p) => p.id === q.get("spot")) ?? a.spots[0];
  return (
    heading(
      "ASSET / SURFACE EDITOR",
      "Make room for a good idea.",
      "Select, drag or resize a surface. This layout is reused by future sales.",
      link(
        "/host/sales/new?asset=" + a.id,
        "Save & create sale",
        "button primary",
      ),
    ) +
    `<div class="editor"><div class="editor-canvas"><div class="editor-tools">${button("add-spot", icon("plus") + " Add surface", `data-id="${a.id}"`, "button")}${button("undo-spots", "Undo", `data-id="${a.id}"`, "button")}${button("save-layout", "Save layout", `data-id="${a.id}"`, "button")}</div>${vehicle(a, { large: true, editor: true, selected: p.id, interactive: true })}<div class="review-note">Drag inside a surface to move it. Drag its lower-right handle to resize. Rectangular placeholders represent the editable inventory; dimensions and geometry need production verification.</div>${banner("Sold layouts stay fixed", "Edits affect the reusable asset draft, not the saved geometry of existing funded sales.")}</div><div class="panel editor-properties"><div class="spot-editor-list">${a.spots.map((sp, i) => button("select-spot", `<span>${String(i + 1).padStart(2, "0")} · ${esc(sp.name)}</span>${icon("chevron")}`, `data-id="${sp.id}"`, sp.id === p.id ? "active" : "")).join("")}</div><form data-form="edit-spot"><input type="hidden" name="assetId" value="${a.id}"/><input type="hidden" name="spotId" value="${p.id}"/>${field("name", "Spot name", p.name, "text", "required")}${field("dimensions", "Production dimensions", p.dimensions)}${field("price", "Suggested price (USDC)", p.price, "number", 'min="1" step="0.01" required')}<p class="tiny muted">Price includes printing and installation. Confirm again when creating a sale.</p><button class="button primary" type="submit">Save spot</button><div style="margin-top:12px">${button("remove-spot", "Remove surface", `data-asset="${a.id}" data-id="${p.id}"`, "text-link")}</div></form></div></div>`
  );
}
function saleTable(list) {
  return table(
    ["Sale / asset", "Service period", "Status", "Bookings", ""],
    list.map((s) => [
      link(
        "/host/sales/" + s.id,
        `<strong>${esc(s.title)}</strong><small>${esc(asset(s.assetId).title)}</small>`,
        "table-link",
      ),
      date(s.start) + " — " + date(s.end),
      badge(s.phase),
      state.bookings.filter(
        (b) => b.saleId === s.id && b.status !== "displaced",
      ).length,
      link("/host/sales/" + s.id, icon("arrow"), "icon-button"),
    ]),
  );
}
function salesList(list, q) {
  const filter = q.get("phase") ?? "";
  return (
    heading(
      "YOUR SALES",
      "One asset. Many chapters.",
      "Manage each campaign period separately. Reuse the asset and keep its history.",
      link(
        "/host/sales/new",
        `${icon("plus")} Create a sale`,
        "button primary",
      ),
    ) +
    `<nav class="filter-row">${["", "draft", "open", "locked", "live", "review", "completed"].map((phase) => link("/host/sales" + (phase ? "?phase=" + phase : ""), phase ? label(phase) : "All sales", "chip " + (phase === filter ? "active" : ""))).join("")}</nav>` +
    card(
      "All sale periods",
      saleTable(list.filter((s) => !filter || s.phase === filter)),
    )
  );
}
function draftSale(q) {
  const d = state.draftSale;
  if (q.get("asset") && d.requestedAsset !== q.get("asset")) {
    d.assetId = q.get("asset");
    d.requestedAsset = q.get("asset");
    d.step = 1;
  }
  return d;
}
function saleWizard(q) {
  const d = draftSale(q),
    a = canOwn(asset(d.assetId)) ? asset(d.assetId) : ownerAssets()[0],
    step = d.step ?? 1;
  if (!a || !canOwn(a))
    return empty(
      "Start with an asset.",
      "Create your vehicle and its surfaces before publishing a dated sale.",
      link("/host/assets/new", "Create an asset", "button primary"),
    );
  return `<div class="wizard">${heading("PUBLISH A NEW POSSIBILITY", "Set the stage for a campaign.", "Fixed dates, clear rules and one price including print and installation.", link("/host/sales", "Save & exit", "button"))}${steps(["Asset & spots", "Dates", "Prices & rules", "Fulfillment", "Preview"], step)}<form class="panel" data-form="sale-wizard"><input type="hidden" name="step" value="${step}"/>${
    step === 1
      ? `<h2>Choose the asset</h2>${select(
          "assetId",
          "Your asset",
          ownerAssets().map((a) => [a.id, a.title]),
          a.id,
        )}${field("title", "Sale title", d.title || "A new season in the city", "text", "required")}${vehicle(a, { large: true, spots: true })}<p class="tiny muted">All ${a.spots.length} surfaces are included in the draft. You can set each spot’s price and takeover rule next.</p>`
      : step === 2
        ? `<h2>Give it a clear timeline.</h2><div class="grid two">${field("start", "Service start", d.start ?? "2027-02-01", "date", "required")}${field("end", "Service end", d.end ?? "2027-02-28", "date", "required")}${field("close", "Booking / takeover closes", d.close ?? "2027-01-25", "date", "required")}${field("artworkDue", "Artwork due", d.artworkDue ?? "2027-01-27", "date", "required")}${field("install", "Installation target", d.install ?? "2027-01-30", "date", "required")}${field("reviewEnd", "Sample issue-review end", d.reviewEnd ?? "2027-03-03", "date", "required")}</div><p class="tiny muted">Review-window duration is illustrative. Takeovers close before physical installation.</p>`
        : step === 3
          ? `<h2>One fair price. Your spot rules.</h2><label class="checkbox"><input type="checkbox" name="takeovers" ${d.takeovers ? "checked" : ""}/><span>Enable takeovers by default for this sale</span></label>${spotPriceFields(a.spots, d.layout ?? a.spots)}${banner("Print & install included", "Your price covers the full service period, printing and installation. No later mandatory production charge.")}`
          : step === 4
            ? `<h2>Own the physical delivery.</h2>${checkList(["You arrange and cover printing and installation.", "You upload actual proof for the booked surfaces.", "Earnings remain held through the campaign and issue-review window."])}${textarea("content", "Published content rules", d.content ?? "Brand artwork must fit the surface and comply with the published content standards. No unsafe or prohibited content.")}${textarea("description", "Public sale description", d.description ?? a.description)}<label class="checkbox"><input type="checkbox" name="responsibility" required/><span>I will arrange printing and installation within the stated price and provide proof.</span></label>`
            : `<h2>Ready for the world?</h2>${vehicle(a, { large: true, spots: true })}<dl class="data-list"><div><dt>Asset</dt><dd>${esc(a.title)}</dd></div><div><dt>Sale</dt><dd>${esc(d.title)}</dd></div><div><dt>Service period</dt><dd>${date(d.start)} — ${date(d.end)}</dd></div><div><dt>Price scope</dt><dd>Placement + printing + installation</dd></div><div><dt>Owner earnings</dt><dd>After campaign & issue review end</dd></div></dl>${checkList(["Takeovers end before installation.", "Spot-level effective rules are shown to buyers.", "Funded commercial terms stay fixed."])}`
  }<div class="wizard-footer">${step > 1 ? button("back-sale-step", "Back", "", "button") : link("/host/assets", "Back to assets", "button")}<button class="button primary" type="submit">${step === 5 ? "Publish sample sale" : "Continue"} ${icon("arrow")}</button></div></form></div>`;
}
function spotPriceFields(spots, layout, context = state.draftSale) {
  return `<div class="table-wrap"><table><thead><tr><th>Spot</th><th>All-in price (USDC)</th><th>Takeover rule</th></tr></thead><tbody>${spots
    .map((p) => {
      const current = layout.find((x) => x.id === p.id) ?? p,
        locked = Boolean(context.id && currentBooking(context, p)),
        on = effectiveTakeover(context, current);
      return `<tr data-rule-row data-locked="${locked}" data-effective="${on}"><td><strong>${esc(p.name)}</strong>${locked ? "<small>Funded terms locked</small>" : ""}</td><td>${field("price-" + p.id, "Price", current.price, "number", 'min="1" step="0.01" required ' + (locked ? "disabled" : ""))}</td><td>${select(
        "rule-" + p.id,
        "Rule",
        [
          ["inherit", "Use sale default"],
          ["on", "Enabled"],
          ["off", "Disabled"],
        ],
        current.rule,
        locked ? "disabled" : "",
      )}<span class="badge" data-rule-preview>${on ? "Takeovers enabled" : "Fixed booking"}</span></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function saleEdit(s) {
  const a = asset(s.assetId),
    funded = state.bookings.some((b) => b.saleId === s.id);
  return (
    heading(
      "SALE / EDIT",
      s.title,
      "Existing funded spots retain their prices and effective rules.",
      link("/host/sales/" + s.id, "Back to sale", "button"),
    ) +
    `<form class="panel" data-form="edit-sale"><input name="id" type="hidden" value="${s.id}"/>${field("title", "Public sale title", s.title, "text", "required")}${textarea("description", "Description", s.description)}${funded ? banner("Funded dates and spot terms are fixed", "You can update presentation and unbooked spots. Create a future sale for a new service period.") : ""}<div class="grid two">${field("start", "Service start", s.start, "date", funded ? "disabled" : "required")}${field("end", "Service end", s.end, "date", funded ? "disabled" : "required")}</div><label class="checkbox"><input name="takeovers" type="checkbox" ${s.takeovers ? "checked" : ""}/><span>Sale-wide takeover default (funded spot rules stay fixed)</span></label>${spotPriceFields(s.layout, s.layout, s)}<p class="tiny muted">Funded spot field changes are ignored in the sample model and their effective rules are preserved. Use a new sale to change a sold offer.</p><button class="button primary" type="submit">Save permitted changes</button></form>`
  );
}
function saleDetail(s, q) {
  const a = asset(s.assetId),
    bs = state.bookings.filter((b) => b.saleId === s.id),
    tab = q.get("tab") ?? "overview",
    base = "/host/sales/" + s.id;
  return (
    heading(
      "YOUR SALE",
      s.title,
      esc(a.title) + " · " + date(s.start) + " — " + date(s.end),
      `<div class="actions">${badge(s.phase)}${link("/spaces/" + a.id + "?sale=" + s.id, "View public page ↗", "button")}${link(base + "/edit", "Edit sale", "button")}</div>`,
    ) +
    stats([
      ["Offered spots", s.layout.length, "Saved layout version"],
      [
        "Current bookings",
        bs.filter((b) => b.status !== "displaced").length,
        "Accepted holders",
      ],
      [
        "Potential proceeds",
        money(saleEarnings(s).total),
        "After prior-holder allocations",
      ],
      ["Service ends", date(s.end), "Then issue review"],
    ]) +
    tabs(
      [
        ["Overview", base, "overview"],
        ["Spots & buyers", base + "?tab=spots", "spots"],
        ["Production", base + "/fulfillment", "production"],
        ["Activity", base + "?tab=activity", "activity"],
      ],
      tab,
    ) +
    (tab === "spots"
      ? card(
          "Every spot and its current holder",
          table(
            ["Spot", "Price", "Effective rule", "Holder", ""],
            s.layout.map((p) => {
              const b = currentBooking(s, p);
              return [
                esc(p.name),
                money(p.price),
                badge(effectiveTakeover(s, p) ? "Takeovers" : "Fixed"),
                esc(b?.brand ?? "Available"),
                b
                  ? link(
                      "/host/bookings/" + b.id,
                      "Open booking ↗",
                      "text-link",
                    )
                  : "—",
              ];
            }),
          ),
        )
      : tab === "activity"
        ? card(
            "Sale activity",
            `<ul class="activity-list">${state.activity.map((x) => `<li><div>${esc(x.text)}<small>${esc(x.time)}</small></div></li>`).join("")}</ul>`,
          )
        : `<div class="grid two">${card(
            "Next actions",
            `<div class="task-list">${
              bs
                .filter((b) => b.status !== "displaced")
                .map(
                  (b) =>
                    `<div class="task"><span class="task-icon">${icon("file")}</span><div><strong>${esc(b.brand)}</strong><p>${label(b.artwork)} artwork · ${label(b.proof)} installation proof</p></div>${link("/host/bookings/" + b.id, icon("arrow"), "icon-button")}</div>`,
                )
                .join("") ||
              '<p class="muted">Share the public link to find your first buyer.</p>'
            }</div><div style="margin-top:15px">${link(base + "/fulfillment", "Open production workspace", "button")}</div>`,
          )}${card(
            "Campaign timeline",
            timeline(
              [
                ["Booking closes", date(s.close)],
                ["Final artwork", date(s.artworkDue)],
                ["Installation", date(s.install)],
                ["Service period", date(s.start) + " — " + date(s.end)],
                ["Issue-review end", date(s.reviewEnd) + " · sample duration"],
              ],
              s.phase === "open"
                ? 0
                : s.phase === "locked"
                  ? 1
                  : s.phase === "live"
                    ? 3
                    : 4,
            ),
          )}</div>`) +
    `<div class="actions" style="margin-top:25px">${button("duplicate-sale", "Create a future edition", `data-id="${s.id}"`, "button")}${s.phase === "draft" ? button("publish-sale", "Publish this draft", `data-id="${s.id}"`, "button primary") : ""}</div>`
  );
}
function ownerBooking(b, artwork) {
  const s = sale(b.saleId),
    a = asset(s.assetId),
    p = s.layout.find((p) => p.id === b.spotId),
    inactive = b.status === "displaced" || b.status === "cancelled";
  return (
    heading(
      "OWNER / " + (artwork ? "ARTWORK REVIEW" : "BOOKING"),
      b.brand + " · " + p.name,
      esc(a.title) + " · " + date(s.start) + " — " + date(s.end),
      badge(b.status),
    ) +
    `<div class="split"><div>${vehicle(a, { large: true, selected: p.id, saleId: s.id })}<div style="margin-top:20px">${card("Creative review", creativePreview(b) + `<div class="row">${badge(b.artwork)}<span class="tiny muted">${esc(b.creativeName || "Not supplied yet")}</span></div>${b.artworkNotes ? `<p class="muted" style="margin-top:20px">${esc(b.artworkNotes)}</p>` : ""}${inactive ? banner("Historical buyer", "This buyer no longer controls the active production placement.", "orange") : b.artwork === "locked" ? banner("Final revision locked", "Production uses this exact approved revision.") : ["submitted", "changes-requested", "approved"].includes(b.artwork) ? `<div class="actions" style="margin-top:20px">${button("approve-artwork", "Approve artwork", `data-id="${b.id}"`, "button primary")}${button("request-artwork", "Request changes", `data-id="${b.id}"`, "button")}${b.artwork === "approved" ? button("lock-artwork", "Lock for production", `data-id="${b.id}"`, "button") : ""}</div>` : '<p class="muted" style="margin-top:18px">The buyer needs to submit artwork first.</p>'}`)}</div></div><aside>${card("Booking information", `<dl class="data-list"><div><dt>Buyer</dt><dd>${esc(b.brand)}</dd></div><div><dt>Booking price</dt><dd>${money(b.amount)}</dd></div><div><dt>Included</dt><dd>Placement, print & install</dd></div><div><dt>Rule</dt><dd>${effectiveTakeover(s, p) ? "Takeovers enabled" : "Fixed booking"}</dd></div><div><dt>Proof</dt><dd>${badge(b.proof)}</dd></div></dl><div class="actions" style="margin-top:20px">${link("/inbox/thread-1", "Message buyer", "button")}${link("/host/sales/" + s.id + "/fulfillment", "Manage installation", "button")}</div>`)}${card("Financial timing", banner("Held through service & review", "Artwork approval and installation proof do not make these proceeds withdrawable.") + link("/host/earnings", "View earnings", "text-link"))}</aside></div>`
  );
}
function fulfillment(s) {
  const a = asset(s.assetId),
    bs = state.bookings.filter(
      (b) =>
        b.saleId === s.id && !["displaced", "cancelled"].includes(b.status),
    );
  return (
    heading(
      "SALE / PRODUCTION & PROOF",
      "Make the digital promise physical.",
      esc(a.title) + " · " + esc(s.title),
      link("/host/sales/" + s.id, "Back to sale", "button"),
    ) +
    banner(
      "Printing and installation are your responsibility",
      "The published price includes production. You cover the work before campaign earnings are released.",
    ) +
    `<div class="grid two">${card("Production checklist", checkList([`Bidding closes ${date(s.close)}.`, `${bs.filter((b) => b.artwork === "locked").length} of ${bs.length} booked revisions locked for printing.`, `Install by ${date(s.install)} and upload actual photos.`, `Service runs ${date(s.start)} — ${date(s.end)}.`, `Earnings remain held until issue review ends.`]) + link("/host/bookings", "Review booked artwork", "button"))}${card(
      "Upload installation proof",
      bs.length
        ? `<form data-form="submit-proof"><input type="hidden" name="saleId" value="${s.id}"/>${select(
            "bookingId",
            "Booked placement",
            bs.map((b) => [
              b.id,
              b.brand + " · " + s.layout.find((p) => p.id === b.spotId)?.name,
            ]),
          )}${field("installed", "Installation date", s.install, "date", "required")}${field("file", "Actual installation photo (optional in mock)", "", "file", 'accept="image/png,image/jpeg,image/webp"')}${textarea("notes", "Evidence notes", "Installed to the approved layout. Full surface visible in the photo.")}<button class="button primary" type="submit">Submit installation proof</button></form>`
        : empty(
            "No current bookings.",
            "Publish the sale and accept a booking before preparing production.",
          ),
    )}</div><div style="margin-top:24px">${card(
      "Proof status",
      table(
        ["Brand", "Artwork", "Installation proof", ""],
        bs.map((b) => [
          esc(b.brand),
          badge(b.artwork),
          badge(b.proof),
          link("/host/bookings/" + b.id, "View ↗", "text-link"),
        ]),
      ),
    )}</div>`
  );
}
function calendar(list) {
  const year = 2026,
    month = 10;
  return (
    heading(
      "AVAILABILITY",
      "A little room in your calendar.",
      "November 2026 · sample calendar for closing dates, production and service periods.",
      link("/host/sales/new", "Create another sale", "button primary"),
    ) +
    card(
      "",
      `<div class="calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((t) => `<div class="day-name">${t}</div>`).join("")}${Array.from(
        { length: 35 },
        (_, i) => {
          const day = i - 5;
          return `<div><b>${day > 0 && day <= 30 ? day : ""}</b>${day === 25 ? "<small>December bidding closes</small>" : day === 27 ? "<small>Artwork due</small>" : day === 30 ? "<small>Installation target</small>" : ""}${day === 3 ? "<small>October review completed</small>" : ""}</div>`;
        },
      ).join("")}</div>`,
    ) +
    `<div style="margin-top:24px">${card("Your campaign periods", saleTable(list))}</div>`
  );
}
function analytics(list, bs) {
  const booked = new Set(
      bs
        .filter((b) => !["cancelled", "displaced"].includes(b.status))
        .map((b) => b.saleId + ":" + b.spotId),
    ).size,
    offered = list.reduce((n, s) => n + s.layout.length, 0);
  return (
    heading(
      "OWNER / ANALYTICS",
      "Useful signals. Real context.",
      "Operational totals come from sample records. Chart activity is illustrative.",
      button("export-owner", "Export sample report", "", "button"),
    ) +
    stats([
      ["Assets", ownerAssets().length, "Your reusable inventory"],
      ["Booked spot-periods", booked, "Independent service periods"],
      [
        "Occupancy",
        Math.round((booked / Math.max(1, offered)) * 100) + "%",
        "Booked / offered sample spot-periods",
      ],
      [
        "Accepted purchase total",
        money(bs.reduce((n, b) => n + b.amount, 0)),
        "Includes historical takeovers",
      ],
    ]) +
    `<div class="grid two">${card("Illustrative listing activity", bars() + `<p class="tiny muted" style="margin-top:15px">No actual impressions, GPS traces or attribution are collected.</p>`)}${card(
      "Campaigns by asset",
      table(
        ["Asset", "Sales", "Bookings"],
        ownerAssets().map((a) => [
          esc(a.title),
          list.filter((s) => s.assetId === a.id).length,
          bs.filter((b) => sale(b.saleId).assetId === a.id).length,
        ]),
      ),
    )}</div>`
  );
}
function earnings(list) {
  const values = list.map((s) => ({ s, e: saleEarnings(s) })),
    available = values
      .filter((x) => x.e.eligible && !x.e.paid && !x.e.processing)
      .reduce((n, x) => n + x.e.total, 0),
    held = values
      .filter((x) => !x.e.eligible && !x.e.paid)
      .reduce((n, x) => n + x.e.total, 0);
  return (
    heading(
      "OWNER / MONEY",
      "Earnings with a clear next step.",
      "Production comes first. Earnings become available after service and issue review.",
    ) +
    stats([
      ["Held", money(held), "Campaign / review still active"],
      ["Available", money(available), "Eligible completed service"],
      [
        "Processing",
        money(
          state.payouts
            .filter((p) => p.status === "processing")
            .reduce((n, p) => n + p.amount, 0),
        ),
        "Sample payout requests",
      ],
      [
        "Paid",
        money(
          state.payouts
            .filter((p) => p.status === "paid")
            .reduce((n, p) => n + p.amount, 0),
        ),
        "Completed sample transfers",
      ],
    ]) +
    banner(
      "No early release on installation approval",
      "The owner covers printing and installation before proceeds are available. The sample review duration is illustrative.",
    ) +
    card(
      "By sale",
      table(
        [
          "Sale",
          "Potential proceeds",
          "Service end",
          "Review end",
          "State",
          "Action",
        ],
        values.map(({ s, e }) => [
          link("/host/sales/" + s.id, esc(s.title), "text-link"),
          money(e.total),
          date(s.end),
          date(s.reviewEnd),
          badge(
            e.paid
              ? "paid"
              : e.processing
                ? "processing"
                : e.openCase
                  ? "under-review"
                  : e.eligible
                    ? "available"
                    : s.phase === "review"
                      ? "held in review"
                      : "held",
          ),
          e.eligible && !e.paid && !e.processing
            ? button(
                "request-payout",
                "Request payout",
                `data-id="${s.id}"`,
                "button small",
              )
            : e.processing
              ? link(
                  "/host/payouts/" +
                    state.payouts.find((p) => p.saleId === s.id).id,
                  "Track ↗",
                  "text-link",
                )
              : "—",
        ]),
      ),
    ) +
    card(
      "Payout history",
      table(
        ["Reference", "Amount", "Status", ""],
        state.payouts.map((p) => [
          esc(p.id),
          money(p.amount),
          badge(p.status),
          link("/host/payouts/" + p.id, "Details ↗", "text-link"),
        ]),
      ),
    )
  );
}
function payout(id) {
  const p = state.payouts.find((p) => p.id === id) ?? {
    id,
    saleId: "sale-summer",
    amount: 85,
    status: "processing",
    sample: true,
  };
  return (
    heading(
      "EARNINGS / PAYOUT",
      p.status === "paid"
        ? "Your earnings, delivered."
        : "A payout you can follow.",
      "This sample record tracks an existing request, not a second payment.",
    ) +
    `<div class="split">${card(
      "Payout journey",
      timeline(
        [
          ["Campaign complete", "Service period has ended."],
          [
            "Issue-review window closed",
            "No unresolved issue blocks this sample payout.",
          ],
          ["Transfer processing", "Destination belongs to the space owner."],
          ["Delivered", "Payout receipt saved."],
        ],
        p.status === "paid" ? 3 : 2,
      ) +
        (p.status === "paid"
          ? badge("paid")
          : button(
              "finish-payout",
              "Complete sample payout",
              `data-id="${id}"`,
              "button primary",
            )),
    )}${card("Payout details", `<dl class="data-list"><div><dt>Amount</dt><dd>${money(p.amount)}</dd></div><div><dt>Sale</dt><dd>${esc(sale(p.saleId)?.title)}</dd></div><div><dt>Destination</dt><dd>${esc(short(person().wallet))}</dd></div><div><dt>Asset</dt><dd>USDC · sample</dd></div></dl>`)}</div>`
  );
}
function remember(a) {
  state.editorHistory ??= {};
  state.editorHistory[a.id] ??= [];
  state.editorHistory[a.id].push(structuredClone(a.spots));
  state.editorHistory[a.id] = state.editorHistory[a.id].slice(-15);
}
export const ownerActions = {
  "choose-input": (el) => {
    update((s) => {
      s.draftAsset.method = el.dataset.id;
      s.draftAsset.step = 2;
    });
    if (el.dataset.id === "phone") navigate("/host/capture/demo-capture");
  },
  "back-asset-step": () => update((s) => (s.draftAsset.step = 1)),
  "capture-sample": (el) => {
    update((s) => {
      s.draftAsset.captured ??= [];
      if (!s.draftAsset.captured.includes(el.dataset.id))
        s.draftAsset.captured.push(el.dataset.id);
      s.draftAsset.method = "photo";
      s.draftAsset.step = 2;
    });
    toast(
      "Sample " + el.dataset.id.toLowerCase() + " view added to the draft.",
    );
  },
  "regenerate-asset": (el) => {
    const a = asset(el.dataset.id);
    update(() => {
      a.color = a.color === "#c8d6cc" ? "#ded0b9" : "#c8d6cc";
      log("Sample illustration regenerated for " + a.title);
    });
    toast("Sample illustration varied. Real asset details stay editable.");
  },
  "add-spot": (el) => {
    const a = asset(el.dataset.id);
    remember(a);
    const id = uid("spot");
    update(() =>
      a.spots.push({
        id,
        name: "New surface",
        x: 420,
        y: 235,
        w: 120,
        h: 65,
        price: 50,
        rule: "inherit",
        dimensions: "Approximate · confirm measurements",
      }),
    );
    navigate("/host/assets/" + a.id + "/spots?spot=" + id);
  },
  "remove-spot": (el) => {
    const a = asset(el.dataset.asset);
    if (a.spots.length < 2)
      throw new Error("Keep at least one surface in the asset.");
    remember(a);
    update(() => (a.spots = a.spots.filter((p) => p.id !== el.dataset.id)));
    navigate("/host/assets/" + a.id + "/spots");
  },
  "undo-spots": (el) => {
    const a = asset(el.dataset.id),
      past = state.editorHistory?.[a.id]?.pop();
    if (!past) {
      toast("No earlier surface edit in this session.");
      return;
    }
    update(() => (a.spots = past));
  },
  "save-layout": () => {
    persist();
    toast("Reusable layout saved. Existing funded sale layouts are unchanged.");
  },
  "back-sale-step": () =>
    update((s) => (s.draftSale.step = Math.max(1, s.draftSale.step - 1))),
  "duplicate-sale": (el) => {
    const s = sale(el.dataset.id);
    update(
      (st) =>
        (st.draftSale = {
          ...structuredClone(s),
          id: undefined,
          title: s.title + " · next edition",
          step: 2,
          start: "2027-02-01",
          end: "2027-02-28",
          close: "2027-01-25",
          artworkDue: "2027-01-27",
          install: "2027-01-30",
          reviewEnd: "2027-03-03",
        }),
    );
    navigate("/host/sales/new");
  },
  "publish-sale": (el) => {
    const s = sale(el.dataset.id);
    assertNoConflict(s);
    update(() => {
      s.phase = "open";
      asset(s.assetId).status = "published";
      log("Sale published: " + s.title);
    });
    toast("Sample sale published to the marketplace.");
  },
  "approve-artwork": (el) => {
    const b = booking(el.dataset.id);
    if (b.status === "displaced")
      throw new Error("This buyer is no longer the holder.");
    update(() => {
      b.artwork = "approved";
      b.artworkFeedback = "";
      log("Artwork approved for " + b.brand);
      notice(
        "Your artwork was approved",
        asset(sale(b.saleId).assetId).title,
        "/buy/placements/" + b.id,
      );
    });
    toast("Artwork approved. Final lock comes after bidding closes.");
  },
  "request-artwork": (el) =>
    modal(
      "Request an artwork revision",
      `<form data-form="artwork-feedback"><input name="id" type="hidden" value="${el.dataset.id}"/>${textarea("feedback", "What should change?", "", 'required placeholder="Please add more clear space around the logo…"')}<button class="button primary" type="submit">Send feedback</button></form>`,
    ),
  "lock-artwork": (el) => {
    const b = booking(el.dataset.id);
    if (sale(b.saleId).phase === "open")
      throw new Error(
        "Bidding is still open. Use Demo controls to preview the closed-bidding stage.",
      );
    modal(
      "Lock this revision for production?",
      `<p>The approved artwork will stop accepting edits and become the production version.</p>${button("confirm-lock", "Lock approved revision", `data-id="${b.id}"`, "button primary")}`,
    );
  },
  "confirm-lock": (el) => {
    const b = booking(el.dataset.id);
    if (b.artwork !== "approved")
      throw new Error("Approve the revision before locking it.");
    update(() => {
      b.artwork = "locked";
      log("Production artwork locked for " + b.brand);
    });
    closeModal();
    toast("Exact approved revision locked for printing.");
  },
  "request-payout": (el) => {
    const s = sale(el.dataset.id),
      e = saleEarnings(s);
    if (!e.eligible || e.paid || e.processing)
      throw new Error("This campaign is not eligible for a new payout.");
    modal(
      "Receive your available earnings",
      `<p>${money(e.total)} from ${esc(s.title)} is available after campaign and issue review.</p><p class="tiny muted">Destination: ${esc(person().wallet)} · sample USDC transfer</p>${button("confirm-payout", "Confirm sample payout", `data-id="${s.id}"`, "button primary")}`,
    );
  },
  "confirm-payout": (el) => {
    const s = sale(el.dataset.id),
      e = saleEarnings(s);
    if (!e.eligible || e.paid || e.processing)
      throw new Error(
        "A payout already exists or the campaign is not eligible.",
      );
    const id = uid("payout");
    update((st) =>
      st.payouts.push({
        id,
        saleId: s.id,
        ownerId: person().ownerId ?? person().id,
        amount: e.total,
        status: "processing",
      }),
    );
    closeModal();
    navigate("/host/payouts/" + id);
  },
  "finish-payout": (el) => {
    update((s) => {
      let p = s.payouts.find((p) => p.id === el.dataset.id);
      if (!p) {
        p = { id: el.dataset.id, saleId: "sale-summer", amount: 85 };
        s.payouts.push(p);
      }
      p.status = "paid";
      log("Sample owner payout delivered.");
    });
    toast("Sample payout delivered.");
  },
  "export-owner": async () => {
    download(
      "sample-owner-inventory.csv",
      "asset,area,spots\n" +
        ownerAssets()
          .map((a) =>
            [
              JSON.stringify(a.title),
              JSON.stringify(a.area),
              a.spots.length,
            ].join(","),
          )
          .join("\n"),
      "text/csv",
    );
    toast("Sample owner report exported.");
  },
};
function assertNoConflict(s) {
  if (
    s.start > s.end ||
    s.close >= s.install ||
    s.install > s.start ||
    s.reviewEnd < s.end
  )
    throw new Error(
      "Use a valid period: close before installation, install by start, review after service ends.",
    );
  if (
    state.sales.some(
      (other) =>
        other.id !== s.id &&
        other.assetId === s.assetId &&
        other.phase !== "draft" &&
        other.phase !== "cancelled" &&
        other.start <= s.end &&
        other.end >= s.start &&
        other.layout.some((p) => s.layout.some((sp) => sp.id === p.id)),
    )
  )
    throw new Error(
      "These spots already have a sale in this period. Choose non-overlapping dates.",
    );
}
export const ownerForms = {
  "generate-asset": async (data) => {
    const image = await readImage(data.get("photo")),
      id = uid("asset"),
      type = String(data.get("type")),
      template = state.assets.find((a) => a.type === type) ?? state.assets[0];
    update((s) => {
      const a = {
        id,
        title: String(data.get("title")),
        model: String(data.get("model")),
        type,
        area: String(data.get("area")),
        ownerId: person().ownerId ?? person().id,
        color: "#c8d6cc",
        status: "draft",
        activity: "Activity to be confirmed",
        description: String(data.get("description")),
        photos: image ? [image] : structuredClone(s.draftAsset.photos ?? []),
        spots: structuredClone(template.spots),
      };
      s.assets.push(a);
      Object.assign(s.draftAsset, {
        title: a.title,
        model: a.model,
        type,
        area: a.area,
        description: a.description,
      });
      log("Asset draft generated: " + a.title);
    });
    navigate("/host/assets/" + id + "/review");
    toast("Editable sample generated. Review and correct every detail.");
  },
  "capture-photo": async (data) => {
    const image = await readImage(data.get("photo"));
    if (!image) throw new Error("Choose a photo or use a sample view.");
    update((s) => {
      s.draftAsset.photos.push(image);
      s.draftAsset.method = "photo";
      s.draftAsset.step = 2;
    });
    toast("Photo saved to the draft. Continue to the asset details.");
  },
  "review-asset": (data) => {
    const a = asset(data.get("id"));
    update(() =>
      Object.assign(a, {
        title: String(data.get("title")),
        model: String(data.get("model")),
        area: String(data.get("area")),
        description: String(data.get("description")),
      }),
    );
    navigate("/host/assets/" + a.id + "/spots");
  },
  "asset-details": async (data) => {
    const image = await readImage(data.get("photo")),
      a = asset(data.get("id"));
    update(() => {
      Object.assign(a, {
        title: String(data.get("title")),
        model: String(data.get("model")),
        area: String(data.get("area")),
        description: String(data.get("description")),
      });
      if (image) a.photos = [image];
    });
    toast("Asset details saved. Existing commercial terms remain unchanged.");
  },
  "edit-spot": (data) => {
    const a = asset(data.get("assetId")),
      p = a.spots.find((p) => p.id === data.get("spotId"));
    remember(a);
    update(() =>
      Object.assign(p, {
        name: String(data.get("name")),
        dimensions: String(data.get("dimensions")),
        price: Number(data.get("price")),
      }),
    );
    toast("Spot details saved in the reusable layout.");
  },
  "sale-wizard": (data) => {
    const d = state.draftSale,
      step = Number(data.get("step"));
    if (step === 1) {
      d.assetId = String(data.get("assetId"));
      d.title = String(data.get("title"));
      d.layout = structuredClone(asset(d.assetId).spots);
    }
    if (step === 2)
      for (const k of [
        "start",
        "end",
        "close",
        "artworkDue",
        "install",
        "reviewEnd",
      ])
        d[k] = String(data.get(k));
    if (step === 3) {
      d.takeovers = data.has("takeovers");
      for (const p of d.layout) {
        p.price = Number(data.get("price-" + p.id));
        p.rule = String(data.get("rule-" + p.id));
      }
    }
    if (step === 4) {
      d.content = String(data.get("content"));
      d.description = String(data.get("description"));
    }
    if (step < 5) {
      update(() => (d.step = step + 1));
      return;
    }
    const s = { ...structuredClone(d), id: uid("sale"), phase: "open" };
    assertNoConflict(s);
    update((st) => {
      st.sales.push(s);
      asset(s.assetId).status = "published";
      st.draftSale = {
        assetId: s.assetId,
        title: "",
        takeovers: true,
        step: 1,
      };
      log("Sale published: " + s.title);
    });
    navigate("/host/sales/" + s.id);
    toast(
      "Your sample sale is published. Buyers can find it in the marketplace.",
    );
  },
  "edit-sale": (data) => {
    const s = sale(data.get("id")),
      oldDefault = s.takeovers,
      newDefault = data.has("takeovers");
    update(() => {
      s.title = String(data.get("title"));
      s.description = String(data.get("description"));
      if (!state.bookings.some((b) => b.saleId === s.id)) {
        s.start = String(data.get("start"));
        s.end = String(data.get("end"));
      }
      for (const p of s.layout) {
        if (currentBooking(s, p)) {
          if (p.rule === "inherit" && newDefault !== oldDefault)
            p.rule = oldDefault ? "on" : "off";
          continue;
        }
        p.price = Number(data.get("price-" + p.id));
        p.rule = String(data.get("rule-" + p.id));
      }
      s.takeovers = newDefault;
    });
    toast(
      "Sale updated. Funded spot prices and effective rules were preserved.",
    );
  },
  "artwork-feedback": (data) => {
    const b = booking(data.get("id"));
    update(() => {
      b.artwork = "changes-requested";
      b.artworkFeedback = String(data.get("feedback"));
      notice(
        "Artwork changes requested",
        b.brand,
        "/buy/placements/" + b.id + "/artwork",
      );
      log("Artwork changes requested for " + b.brand);
    });
    closeModal();
    toast("Feedback shared with the buyer.");
  },
  "submit-proof": async (data) => {
    const b = booking(data.get("bookingId")),
      image = await readImage(data.get("file"));
    if (!b || b.artwork !== "locked")
      throw new Error(
        "Lock the final approved artwork before submitting production proof.",
      );
    update(() => {
      b.proof = "submitted";
      b.proofNotes = String(data.get("notes"));
      b.installed = String(data.get("installed"));
      if (image) b.proofImage = image;
      notice(
        "Installation proof is ready",
        b.brand,
        "/buy/placements/" + b.id + "?tab=delivery",
      );
      log("Installation proof submitted for " + b.brand);
    });
    toast(
      "Proof submitted. Earnings remain held through campaign and issue review.",
    );
  },
};
export function ownerMount(r) {
  if (r.id !== "O08") return;
  const a = asset(r.params.id),
    svg = document.querySelector("[data-editor-canvas]");
  if (!svg || !canOwn(a)) return;
  let drag;
  const point = (event) => {
    const box = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * 960) / box.width,
      y: ((event.clientY - box.top) * 480) / box.height,
    };
  };
  svg.addEventListener("pointerdown", (event) => {
    const shape = event.target.closest("[data-spot]");
    if (!shape) return;
    const p = a.spots.find((p) => p.id === shape.dataset.spot);
    if (!p) return;
    event.preventDefault();
    remember(a);
    drag = {
      p,
      original: { ...p },
      start: point(event),
      resize: event.target.classList.contains("resize-handle"),
      shape,
    };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const now = point(event),
      dx = now.x - drag.start.x,
      dy = now.y - drag.start.y,
      p = drag.p,
      o = drag.original;
    if (drag.resize) {
      p.w = Math.max(35, Math.min(920 - o.x, o.w + dx));
      p.h = Math.max(25, Math.min(430 - o.y, o.h + dy));
    } else {
      p.x = Math.max(15, Math.min(920 - p.w, o.x + dx));
      p.y = Math.max(50, Math.min(430 - p.h, o.y + dy));
    }
    const rect = drag.shape.querySelector("rect");
    for (const [key, value] of Object.entries({
      x: p.x,
      y: p.y,
      width: p.w,
      height: p.h,
    }))
      rect.setAttribute(key, value);
    const text = drag.shape.querySelector("text");
    text.setAttribute("x", p.x + p.w / 2);
    text.setAttribute("y", p.y + p.h / 2 + 5);
    const handle = drag.shape.querySelector(".resize-handle");
    if (handle) {
      handle.setAttribute("x", p.x + p.w - 8);
      handle.setAttribute("y", p.y + p.h - 8);
    }
  });
  svg.addEventListener("pointerup", () => {
    if (!drag) return;
    const id = drag.p.id;
    drag = null;
    persist();
    navigate("/host/assets/" + a.id + "/spots?spot=" + id);
  });
}
