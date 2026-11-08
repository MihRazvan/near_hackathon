import {
  state,
  person,
  asset,
  sale,
  booking,
  update,
  navigate,
  toast,
  requireSignIn,
  uid,
  log,
  notice,
} from "./store.mjs";
import { authRequired } from "./account.mjs";
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
  timeline,
  vehicle,
  avatar,
  tabs,
  modal,
  closeModal,
} from "./ui.mjs";
export function operationsPage(r) {
  if (
    ![
      "S01",
      "S02",
      "S03",
      "S09",
      "S10",
      "M01",
      "M02",
      "M03",
      "M04",
      "M05",
    ].includes(r.id)
  )
    return "";
  if (person().id === "visitor") return authRequired();
  const q = new URLSearchParams(location.search);
  if (r.id === "S01") return inbox();
  if (r.id === "S02") return thread(r.params.threadId, q);
  if (r.id === "S03")
    return (
      heading(
        "WORKSPACE ACTIVITY",
        "The important things, in one place.",
        "Open a notification to get back to the right task.",
        button("read-all", "Mark all as read", "", "button"),
      ) +
      card(
        "Your notifications",
        state.notifications.length
          ? `<div class="task-list">${state.notifications.map((n) => `<div class="task"><span class="task-icon">${icon(n.read ? "check" : "bell")}</span><div><strong>${esc(n.title)}</strong><p>${esc(n.text)}</p></div>${button("open-notification", icon("arrow"), `data-id="${n.id}" aria-label="Open ${esc(n.title)}"`, "icon-button")}</div>`).join("")}</div>`
          : empty(
              "All caught up.",
              "Booking, creative and payment updates will appear here.",
            ),
      )
    );
  if (r.id === "S09") return supportNew(q);
  if (r.id === "S10") return casePage(r.params.id, false);
  if (r.id === "M01") return opsOverview();
  if (r.id === "M02") return listingReview(r.params.id);
  if (r.id === "M03") return casePage(r.params.id, true);
  if (r.id === "M04") return paymentReview(r.params.id);
  if (r.id === "M05") return audit(q);
  return "";
}
function inbox() {
  return (
    heading(
      "YOUR CONVERSATIONS",
      "Good campaigns start with a conversation.",
      "Keep creative feedback, delivery questions and booking context together.",
      link("/inbox/new", "New message", "button primary"),
    ) +
    card(
      "Inbox",
      state.messages.length
        ? `<div class="task-list">${state.messages.map((t) => `<a href="/inbox/${t.id}" class="task">${avatar(t.name)}<div><strong>${esc(t.subject)}</strong><p>${esc(t.items.at(-1)?.text ?? "No messages yet.")}</p></div>${icon("arrow")}</a>`).join("")}</div>`
        : empty(
            "No conversations yet.",
            "Contact an owner from a listing or send a message about a booking.",
            link("/explore", "Explore spaces"),
          ),
    )
  );
}
function thread(id, q) {
  const t = state.messages.find((t) => t.id === id);
  if (id === "new" || !t)
    return (
      heading(
        "INBOX / NEW",
        "Start a conversation.",
        "Give the other person a little context about your campaign.",
      ) +
      `<form class="panel" data-form="new-thread">${field("name", "To", q.get("owner") ?? "Space owner", "text", "required")}${field("subject", "Subject", q.get("asset") ? "Question about " + q.get("asset") : "A question about your space", "text", "required")}${select("bookingId", "Related booking (optional)", [["", "General inquiry"], ...state.bookings.filter((b) => b.buyerId === person().id).map((b) => [b.id, b.brand + " · " + asset(sale(b.saleId).assetId).title])])}${textarea("message", "Message", "", "required")}<button class="button primary" type="submit">Send message</button></form>`
    );
  const b = booking(t.bookingId);
  return (
    heading(
      "INBOX / CONVERSATION",
      t.subject,
      esc(t.name),
      link("/inbox", "All messages", "button"),
    ) +
    `<div class="split">${card("", `<div class="messages">${t.items.map((m) => `<div class="message ${m.from === "You" || m.from === person().name ? "self" : ""}"><small>${esc(m.from)}</small><p>${esc(m.text)}</p></div>`).join("")}</div><hr class="divider"/><form data-form="send-message"><input name="id" type="hidden" value="${t.id}"/>${textarea("message", "Reply", "", 'required placeholder="Write your message…"')}<button class="button primary" type="submit">Send reply ${icon("arrow")}</button></form>`)}${card("Conversation context", b ? `<dl class="data-list"><div><dt>Brand</dt><dd>${esc(b.brand)}</dd></div><div><dt>Space</dt><dd>${esc(asset(sale(b.saleId).assetId).title)}</dd></div><div><dt>Booking</dt><dd>${badge(b.status)}</dd></div><div><dt>Artwork</dt><dd>${badge(b.artwork)}</dd></div></dl>${link((person().role === "owner" ? "/host/bookings/" : "/buy/placements/") + b.id, "Open placement", "button")}` : '<p class="muted">A general inquiry, before a booking.</p>')}</div>`
  );
}
function supportNew(q) {
  return (
    heading(
      "SUPPORT / NEW CASE",
      "Let’s put the context together.",
      "Describe the issue and attach it to the right booking or payment.",
    ) +
    `<div class="split"><form class="panel" data-form="create-case">${select("category", "What do you need help with?", ["Delivery", "Artwork", "Payment", "Account access", "Other"])}${select("bookingId", "Related booking", [["", "No specific booking"], ...state.bookings.map((b) => [b.id, b.brand + " · " + asset(sale(b.saleId).assetId).title])], q.get("booking"))}${field("paymentId", "Payment reference (optional)", q.get("payment") ?? "")}${field("subject", "Subject", "", "text", "required")}${textarea("message", "What happened, and what would help?", "", "required")}<button class="button primary" type="submit">Open support case</button></form>${card("A clear next step", `<p class="muted">Your case keeps the relevant terms, evidence and conversation together. An operator can ask for details and record a reasoned resolution.</p>${banner("An open issue stays visible", "A support message does not silently reverse a booking or mark a transaction paid.")}<h3>Your existing cases</h3>${state.cases.map((c) => `<p>${link("/support/cases/" + c.id, esc(c.subject), "text-link")}</p>`).join("")}`)}</div>`
  );
}
function casePage(id, ops) {
  const c = state.cases.find((c) => c.id === id);
  if (!c)
    return empty(
      "Case not found.",
      "Open a new case with the relevant context.",
      link("/support/new", "Contact support", "button primary"),
    );
  const b = booking(c.bookingId),
    s = b && sale(b.saleId);
  return (
    heading(
      (ops ? "OPERATIONS" : "SUPPORT") + " / " + c.id,
      c.subject,
      `${esc(c.category)} · Opened in sample workspace`,
      badge(c.status),
    ) +
    `<div class="split"><div>${card("Case summary", `<p class="muted">${esc(c.message)}</p>${c.resolution ? banner("Resolution recorded", esc(c.resolution)) : banner("Review in progress", "Both parties can add context before a decision is recorded.", "orange")}<div class="messages">${(c.messages ?? []).map((m) => `<div class="message"><small>${esc(m.from)}</small><p>${esc(m.text)}</p></div>`).join("")}</div><form data-form="case-message"><input name="id" type="hidden" value="${id}"/>${textarea("message", "Add evidence or an update", "", "required")}<button class="button" type="submit">Add update</button></form>`)}${
      ops
        ? card(
            "Record an operator decision",
            `<form data-form="resolve-case"><input name="id" type="hidden" value="${id}"/>${select(
              "decision",
              "Resolution",
              [
                ["evidence", "Request further evidence"],
                ["resolved", "Resolve with no money movement"],
                ["refund", "Cancel this booking and credit original principal"],
              ],
            )}${textarea("reason", "Reason and evidence reference", "", 'required placeholder="Explain the decision against the booking’s published terms…"')}<button class="button primary" type="submit">Record sample decision</button></form><p class="tiny muted">Sample decisions update the mock ledger only. They do not execute a real refund.</p>`,
          )
        : ""
    }</div><aside>${card("Related booking", b ? `<dl class="data-list"><div><dt>Brand</dt><dd>${esc(b.brand)}</dd></div><div><dt>Space</dt><dd>${esc(asset(s.assetId).title)}</dd></div><div><dt>Period</dt><dd>${date(s.start)} — ${date(s.end)}</dd></div><div><dt>Original price</dt><dd>${money(b.amount)}</dd></div><div><dt>Booking state</dt><dd>${badge(b.status)}</dd></div><div><dt>Proof</dt><dd>${badge(b.proof)}</dd></div></dl>` : '<p class="muted">Account or general issue, without a specific placement.</p>')}${card(
      "Next steps",
      timeline(
        [
          ["Case opened", "The issue and booking terms are retained."],
          ["Evidence review", "Participants share the relevant facts."],
          ["Decision recorded", "Any financial consequence remains explicit."],
        ],
        c.status === "resolved" ? 2 : 1,
      ),
    )}</aside></div>`
  );
}
function opsOverview() {
  return (
    heading(
      "PLATFORM OPERATIONS",
      "A clear view of what needs care.",
      "Eligibility, physical evidence, disputes and payment exceptions.",
    ) +
    stats([
      [
        "Open support cases",
        state.cases.filter((c) => c.status !== "resolved").length,
        "Reasoned review required",
      ],
      [
        "Draft assets",
        state.assets.filter((a) => a.status === "draft").length,
        "Readiness / eligibility",
      ],
      [
        "Proof awaiting review",
        state.bookings.filter((b) => b.proof === "submitted").length,
        "Buyer and evidence workflow",
      ],
      [
        "Payment exceptions",
        state.payments.filter((p) => p.stage === "issue").length,
        "Recorded source/payment context",
      ],
    ]) +
    `<div class="grid two">${card(
      "Cases needing attention",
      table(
        ["Case", "Category", "Status", ""],
        state.cases.map((c) => [
          esc(c.subject),
          esc(c.category),
          badge(c.status),
          link("/ops/cases/" + c.id, "Review ↗", "text-link"),
        ]),
      ),
    )}${card(
      "Listing review",
      table(
        ["Asset", "State", ""],
        state.assets
          .slice(0, 5)
          .map((a) => [
            esc(a.title),
            badge(a.status),
            link("/ops/listings/" + a.id, "Review ↗", "text-link"),
          ]),
      ),
    )}</div><div style="margin-top:25px">${card(
      "Payments",
      table(
        ["Reference", "Amount", "Stage", ""],
        state.payments.map((p) => [
          esc(p.id),
          money(p.amount),
          badge(p.stage),
          link("/ops/payments/" + p.id, "Inspect ↗", "text-link"),
        ]),
      ) +
        link(
          "/ops/payments/sample-payment",
          "Open sample reconciliation view",
          "button",
        ),
    )}</div>`
  );
}
function listingReview(id) {
  const a = asset(id);
  if (!a)
    return empty(
      "Asset not found",
      "Return to the review queue.",
      link("/ops", "Operations"),
    );
  return (
    heading(
      "OPERATIONS / LISTING REVIEW",
      a.title,
      esc(a.model) + " · " + esc(a.area),
      badge(a.status),
    ) +
    `<div class="split"><div>${vehicle(a, { large: true, spots: true })}<div style="margin-top:20px">${card("Submitted context", `<p class="muted">${esc(a.description)}</p><dl class="data-list"><div><dt>Photos</dt><dd>${a.photos?.length ?? 0} supplied · illustration otherwise</dd></div><div><dt>Dimensions</dt><dd>Approximate / owner verification needed</dd></div><div><dt>Operating area</dt><dd>${esc(a.area)} · declared</dd></div><div><dt>Permission declaration</dt><dd>Sample owner declaration</dd></div></dl>`)}</div><form class="panel" data-form="review-listing"><input name="id" type="hidden" value="${id}"/><h2>Eligibility decision</h2>${select(
      "decision",
      "Decision",
      [
        ["reviewed", "Approve sample eligibility"],
        ["changes-requested", "Request changes"],
        ["rejected", "Reject listing"],
      ],
    )}${textarea("reason", "Reason and evidence reference", "", "required")}${banner("Evidence stays distinct", "A wallet signature or generated image does not establish physical ownership or installation.")}<button class="button primary" type="submit">Record review</button></form></div>`
  );
}
function paymentReview(id) {
  const p = state.payments.find((p) => p.id === id) ?? {
    id,
    saleId: "sale-alpine",
    spotId: "rear",
    buyerId: "buyer",
    amount: 85,
    stage: "funding",
    sourceHash: "sample-source-reference",
    sample: true,
  };
  return (
    heading(
      "OPERATIONS / PAYMENT REVIEW",
      "Evidence before assumptions.",
      "Inspect the recorded payment and its business outcome.",
    ) +
    `<div class="split">${card("Payment evidence", `<dl class="data-list"><div><dt>Reference</dt><dd>${esc(id)}</dd></div><div><dt>Original buyer</dt><dd>${esc(p.buyerId)}</dd></div><div><dt>Expected amount</dt><dd>${money(p.amount)}</dd></div><div><dt>Source hash</dt><dd>${esc(p.sourceHash ?? "Not recorded")}</dd></div><div><dt>Stage</dt><dd>${badge(p.stage)}</dd></div><div><dt>Accepted booking</dt><dd>${p.bookingId ? esc(p.bookingId) : "Not yet accepted"}</dd></div></dl>${banner("Source payment ≠ accepted booking", "Reconciliation may establish funding. The scoped purchase still requires the buyer’s authorization.")}<div class="actions">${button("reconcile-sample-payment", "Check sample source record", `data-id="${id}"`, "button primary")}${link("/support/new?payment=" + id, "Open a case", "button")}</div>`)}${card(
      "What recovery can do",
      timeline(
        [
          [
            "Identify the payment",
            "Stored buyer, asset, amount and destination.",
          ],
          [
            "Inspect existing source record",
            "Never request another source send just to recover a response.",
          ],
          [
            "Continue the authorized business action",
            "Buyer authorization and acceptance are distinct.",
          ],
          [
            "Record the outcome",
            "Accepted, credited or held for explicit review.",
          ],
        ],
        1,
      ),
    )}</div>`
  );
}
function audit(q) {
  const term = (q.get("q") ?? "").toLowerCase(),
    items = state.activity.filter((a) => a.text.toLowerCase().includes(term));
  return (
    heading(
      "OPERATIONS / AUDIT",
      "Every decision leaves a trail.",
      "A sample operational event log for review and recovery.",
    ) +
    `<form class="actions" data-form="audit-search" style="margin-bottom:25px">${field("q", "Search activity", q.get("q") ?? "", "search")}<button class="button" type="submit">Filter</button></form>` +
    card(
      "Activity log",
      table(
        ["Event", "Actor", "When"],
        items.map((a) => [
          esc(a.text),
          esc(a.actor ?? "Sample workspace"),
          esc(a.time),
        ]),
      ),
    )
  );
}
export const operationsActions = {
  "read-all": () => {
    update((s) => s.notifications.forEach((n) => (n.read = true)));
    toast("Notifications marked as read.");
  },
  "open-notification": (el) => {
    const n = state.notifications.find((n) => n.id === el.dataset.id);
    if (!n) return;
    update(() => (n.read = true));
    navigate(n.href);
  },
  "reconcile-sample-payment": (el) => {
    const p = state.payments.find((p) => p.id === el.dataset.id);
    if (!p) {
      toast(
        "Sample source reference found. Funding requires purchase authorization before acceptance.",
      );
      return;
    }
    if (!p.sourceHash) {
      toast(
        "No source hash recorded. Ask for the existing transaction reference.",
      );
      return;
    }
    if (p.stage === "funding") {
      update(() => {
        p.stage = "authorization";
        log("Payment source reconciled: " + p.id);
      });
      toast(
        "Funding observed. Buyer purchase authorization is still required.",
      );
    } else
      toast(
        "Existing payment stage retained. No duplicate submission was made.",
      );
  },
};
export const operationsForms = {
  "new-thread": (data) => {
    const id = uid("thread");
    update((s) =>
      s.messages.unshift({
        id,
        name: String(data.get("name")),
        subject: String(data.get("subject")),
        bookingId: String(data.get("bookingId")),
        items: [{ from: "You", text: String(data.get("message")) }],
      }),
    );
    navigate("/inbox/" + id);
    toast("Message added to the sample conversation.");
  },
  "send-message": (data) => {
    const t = state.messages.find((t) => t.id === data.get("id"));
    if (!t) return;
    update(() =>
      t.items.push({ from: "You", text: String(data.get("message")) }),
    );
    toast("Reply saved.");
  },
  "create-case": (data) => {
    const id = uid("case");
    update((s) => {
      s.cases.unshift({
        id,
        buyerId: person().id,
        category: String(data.get("category")),
        bookingId: String(data.get("bookingId")),
        paymentId: String(data.get("paymentId")),
        subject: String(data.get("subject")),
        message: String(data.get("message")),
        status: "open",
        messages: [],
      });
      log("Support case opened: " + id);
    });
    navigate("/support/cases/" + id);
    toast("Support case created with its booking context.");
  },
  "case-message": (data) => {
    const c = state.cases.find((c) => c.id === data.get("id"));
    update(() => {
      c.messages ??= [];
      c.messages.push({
        from: person().name,
        text: String(data.get("message")),
      });
    });
    toast("Case update saved.");
  },
  "resolve-case": (data) => {
    const c = state.cases.find((c) => c.id === data.get("id")),
      decision = String(data.get("decision"));
    update((s) => {
      c.status = decision === "evidence" ? "awaiting-evidence" : "resolved";
      c.resolution = String(data.get("reason"));
      c.messages ??= [];
      c.messages.push({
        from: person().name,
        text: label(decision) + ": " + c.resolution,
      });
      if (decision === "refund") {
        const b = booking(c.bookingId);
        if (b) {
          const existing = s.credits.find((x) => x.bookingId === b.id);
          if (existing) existing.conditional = 0;
          else
            s.credits.push({
              id: uid("credit"),
              buyerId: b.buyerId,
              bookingId: b.id,
              principal: b.amount,
              conditional: 0,
              claimed: false,
            });
          b.status = "cancelled";
          notice("Original principal credited", b.brand, "/buy/money");
        }
      }
      log(`Operator decision ${decision} on ${c.id}: ${c.resolution}`);
    });
    toast(
      "Sample decision recorded. Inspect the related case, booking and money view.",
    );
  },
  "review-listing": (data) => {
    const a = asset(data.get("id"));
    update(() => {
      a.reviewStatus = String(data.get("decision"));
      a.reviewReason = String(data.get("reason"));
      if (a.reviewStatus === "rejected") a.status = "rejected";
      log(
        "Listing " + a.title + ": " + a.reviewStatus + " — " + a.reviewReason,
      );
    });
    toast("Listing review recorded with its reason.");
  },
  "audit-search": (data) =>
    navigate("/ops/audit?q=" + encodeURIComponent(data.get("q") ?? "")),
};
