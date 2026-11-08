import {
  state,
  asset,
  sale,
  person,
  update,
  navigate,
  toast,
  requireSignIn,
  currentBooking,
  effectiveTakeover,
  priceFor,
} from "./store.mjs";
import { OWNERS } from "./seed.mjs";
import {
  esc,
  money,
  date,
  label,
  icon,
  link,
  button,
  badge,
  heading,
  card,
  field,
  select,
  empty,
  banner,
  vehicle,
  assetCard,
  checkList,
  avatar,
  timeline,
  modal,
} from "./ui.mjs";
export function publicPage(route) {
  const q = new URLSearchParams(location.search);
  if (route.id === "P01") return home();
  if (route.id === "P02") return explore(q);
  if (route.id === "P03") return detail(route.params.slug, q);
  if (route.id === "P04") {
    const o = OWNERS.find((x) => x.id === route.params.slug);
    if (!o)
      return empty(
        "Owner not found",
        "Return to the marketplace.",
        link("/explore", "Explore spaces"),
      );
    return `<div class="profile-hero">${avatar(o.name, "big")}<h1>${esc(o.name)}</h1><div class="actions">${badge(o.area)}${badge(o.verified ? "Profile reviewed" : "Owner-declared")}</div><p class="lede" style="margin-top:20px">${esc(o.bio)}</p>${link("/inbox/thread-1", "Contact owner", "button small")}</div><div class="section-top"><div><div class="eyebrow">FROM THIS OWNER</div><h2>Spaces with a story.</h2></div></div><div class="asset-grid">${state.assets
      .filter((a) => a.ownerId === o.id)
      .map((a) => assetCard(a))
      .join("")}</div>`;
  }
  if (route.id === "P05" || route.id === "P06") return how(route.id === "P06");
  if (route.id === "P07") return help();
  if (route.id === "P08") return article(route.params.article);
  if (route.id === "P09") return policy(route.params.policy);
  return "";
}
function home() {
  return `<section class="hero"><div><div class="eyebrow">REAL SPACES. REAL POSSIBILITIES.</div><h1>The world is<br/>your <em>ad space.</em></h1><p>Put your brand on the things that move us. Discover cars, bikes and everyday surfaces with a place for your next idea.</p><div class="actions">${link("/explore", `Find your space ${icon("arrow")}`, "button primary")}${link("/how-it-works/list", "List a space", "button")}</div><div class="hero-trust"><span>${icon("check")} Printing & installation included</span><span>${icon("wallet")} Pay from your wallet</span></div></div><div class="hero-art"><span class="hero-label">BUCHAREST / DECEMBER EDITION</span>${vehicle(asset("alpine"), { large: true, selected: "door", spots: true })}<div class="hero-note"><strong>Your brand. Out in the world.</strong><span>Choose the spot. Make it yours.</span></div></div></section>${searchForm()}<div class="section-top"><div><div class="eyebrow">A NEW WAY TO SHOW UP</div><h2>Find your kind of space.</h2><p>Independent owners. Real routes. Room for your brand.</p></div>${link("/explore", "View all spaces ↗", "text-link")}</div><div class="asset-grid">${state.assets
    .slice(0, 3)
    .map((a) => assetCard(a))
    .join(
      "",
    )}</div><section class="marketing-strip"><div><div class="eyebrow">YOUR EVERYDAY. SOMEONE’S NEXT CAMPAIGN.</div><h2>That space you pass every day?<br/>It could be earning for you.</h2><p>Photograph your vehicle, create your spots and publish your first sale.</p></div>${link("/host/assets/new", `List your space ${icon("arrow")}`, "button primary")}</section><div class="grid three">${[
    ["01", "Find a space", "Choose a vehicle, a spot and a campaign period."],
    [
      "02",
      "Make it yours",
      "Book instantly and work with the owner on your artwork.",
    ],
    [
      "03",
      "See it out there",
      "The owner prints, installs and shares proof. You follow the campaign.",
    ],
  ]
    .map(([n, t, d]) =>
      card(
        "",
        `<div class="step-number">${n} / HOW IT WORKS</div><h3>${t}</h3><p class="muted">${d}</p>`,
      ),
    )
    .join("")}</div>`;
}
function searchForm(q = new URLSearchParams()) {
  return `<form class="search-bar" data-form="explore">${field("q", "Where do you want to show up?", q.get("q") ?? "", "search", 'placeholder="City, owner or vehicle"')}${select(
    "type",
    "Space type",
    [
      ["", "All vehicles"],
      ["car", "Cars"],
      ["moto", "Motorcycles"],
      ["bike", "Bicycles"],
      ["van", "Vans"],
    ],
    q.get("type"),
  )}${field("start", "Campaign starts", q.get("start") ?? "", "date")}${button("submit-search", `${icon("search")} Find spaces`, "", "button primary")}</form>`;
}
function explore(q) {
  let list = state.assets.filter((a) => a.status === "published");
  const term = (q.get("q") ?? "").toLowerCase(),
    type = q.get("type"),
    mode = q.get("mode"),
    max = Number(q.get("budget") || 1000),
    sort = q.get("sort") ?? "recommended";
  list = list.filter((a) => {
    const s = state.sales.find((s) => s.assetId === a.id && s.phase === "open");
    if (!s) return false;
    const matching = s.layout.filter(
      (p) =>
        (!mode ||
          (mode === "on"
            ? effectiveTakeover(s, p)
            : !effectiveTakeover(s, p))) &&
        (!currentBooking(s, p) || effectiveTakeover(s, p)),
    );
    return (
      (!term ||
        `${a.title} ${a.model} ${a.area} ${a.ownerId}`
          .toLowerCase()
          .includes(term)) &&
      (!type || a.type === type) &&
      (!q.get("start") || s.end >= q.get("start")) &&
      matching.some((p) => priceFor(s, p) <= max)
    );
  });
  if (sort === "price")
    list.sort(
      (a, b) =>
        Math.min(...a.spots.map((p) => p.price)) -
        Math.min(...b.spots.map((p) => p.price)),
    );
  return `<div class="explore-heading">${heading("THE MARKETPLACE", "A place for your next idea.", "Browse independent spaces. Every price includes printing and installation.")}</div>${searchForm(q)}<form class="explore-controls" data-form="filters"><div class="filter-row">${select(
    "mode",
    "Booking type",
    [
      ["", "All booking types"],
      ["off", "Fixed bookings"],
      ["on", "Takeovers available"],
    ],
    mode,
  )}${select(
    "budget",
    "Budget per spot",
    [
      ["1000", "Any budget"],
      ["50", "Up to 50 USDC"],
      ["100", "Up to 100 USDC"],
      ["150", "Up to 150 USDC"],
    ],
    String(max),
  )}${select(
    "sort",
    "Sort by",
    [
      ["recommended", "Recommended"],
      ["price", "Price: low to high"],
    ],
    sort,
  )}<button class="button small" type="submit">Apply filters</button></div>${link("/explore", "Clear filters", "text-link")}</form><div class="row" style="margin-bottom:20px"><span class="tiny muted">${list.length} spaces for your campaign · December 2026</span><span class="tiny muted">Prices per campaign period</span></div>${list.length ? `<div class="asset-grid">${list.map((a) => assetCard(a, undefined, mode)).join("")}</div>` : empty("No spaces match just yet.", "Try another area or clear a filter to see more inventory.", link("/explore", "Clear filters", "button primary"))}`;
}
function detail(id, q) {
  const a = asset(id);
  if (!a)
    return empty(
      "This space is no longer here.",
      "Your existing bookings are still in your workspace.",
      link("/explore", "Explore spaces"),
    );
  const s =
    sale(q.get("sale")) ??
    state.sales.find((s) => s.assetId === a.id && s.phase === "open") ??
    state.sales.find((s) => s.assetId === a.id);
  if (!s)
    return empty(
      "This asset is getting ready.",
      "The owner has not published a sale yet.",
      link("/host/sales/new?asset=" + a.id, "Create a sale"),
    );
  const p = s.layout.find((p) => p.id === q.get("spot")) ?? s.layout[0],
    b = currentBooking(s, p),
    on = effectiveTakeover(s, p),
    o = OWNERS.find((x) => x.id === a.ownerId),
    available = s.phase === "open" && (!b || on),
    mine = b?.buyerId === person().id,
    view = q.get("view") ?? "side";
  return `<div class="detail-top"><nav class="breadcrumbs">${link("/explore", "Explore spaces", "")}<span>/</span><span>${esc(a.area)}</span><span>/</span><span>${esc(a.title)}</span></nav><div class="row detail-title"><div><div class="actions">${badge(a.area)}${badge(label(a.type))}${badge("Print & install included", "green")}</div><h1>${esc(a.title)}</h1><p class="muted">${esc(a.model)} · ${esc(a.activity)} · Owner-declared activity</p></div><div class="actions">${button("save-asset", icon("heart"), `data-id="${a.id}" aria-label="Save this space"`, "icon-button")}${button("share-space", icon("copy"), 'aria-label="Copy this page link"', "icon-button")}</div></div></div><div class="asset-detail"><div>${vehicle(a, { large: true, interactive: true, selected: p.id, saleId: s.id })}<div class="view-buttons">${["side", "front", "rear"].map((v) => link(`/spaces/${a.id}?sale=${s.id}&spot=${p.id}&view=${v}`, `${label(v)} view`, "button " + (view === v ? "lime" : ""))).join("")}</div><p class="tiny muted">${view === "side" ? "Select a numbered surface to explore a placement." : "Alternate-view placeholder · the same surface inventory remains selectable."} Illustration and suggested dimensions are for layout review.</p><div class="spot-options">${s.layout
    .map((sp, i) => {
      const held = currentBooking(s, sp);
      return button(
        "select-spot",
        `<span class="spot-number">${String(i + 1).padStart(2, "0")}</span><span><strong>${esc(sp.name)}</strong><small>${effectiveTakeover(s, sp) ? "Takeovers enabled" : "Fixed booking"}${held ? " · " + esc(held.brand) : " · Available"}</small></span><span class="spot-price"><strong>${money(priceFor(s, sp))}</strong><small>${held ? "Current purchase price" : "For this period"}</small></span>`,
        `data-id="${sp.id}"`,
        "spot-option " + (sp.id === p.id ? "active" : ""),
      );
    })
    .join(
      "",
    )}</div><div class="detail-content">${card("A little about the space", `<p class="muted">${esc(a.description)}</p><div class="facts"><div class="fact">${icon("map")}<strong>${esc(a.area)}</strong><p>Approximate coverage area</p></div><div class="fact">${icon("car")}<strong>${esc(a.activity)}</strong><p>Declared by the owner</p></div><div class="fact">${icon("shield")}<strong>Owner-managed installation</strong><p>Proof shared in your workspace</p></div></div><div class="sample-map"><div class="map-pin">${icon("map")} ${esc(a.area)} · sample coverage</div></div>`)}${card(
    "From booking to the street",
    timeline(
      [
        ["Booking & takeovers", `Closes ${date(s.close)}`],
        ["Artwork approval", `Final revision due ${date(s.artworkDue)}`],
        ["Printing & installation", `Owner arranges it by ${date(s.install)}`],
        ["Out in the world", `${date(s.start)} — ${date(s.end)}`],
        [
          "Campaign review",
          "Owner earnings stay held until the campaign and issue review end.",
        ],
      ],
      s.phase === "open"
        ? 0
        : s.phase === "locked"
          ? 1
          : s.phase === "live"
            ? 3
            : 4,
    ),
  )}${card("Meet the owner", `<div class="owner-inline">${avatar(o?.name ?? "Owner")}<div><strong>${esc(o?.name ?? "Independent owner")}</strong><small>${esc(o?.area ?? a.area)} · ${o?.verified ? "Profile reviewed" : "Owner-declared"}</small></div>${link("/owners/" + a.ownerId, icon("arrow"), "icon-button")}</div><p class="muted" style="margin-top:18px">${esc(o?.bio ?? "An independent space owner.")}</p>${link("/inbox/thread-1", "Ask a question", "text-link")}`)}${card("Good to know", `<details><summary>What is included in the price?</summary><p class="muted">Your selected spot for the stated dates, printing and installation. Applicable wallet and conversion costs are shown separately before payment.</p></details><details><summary>How do takeovers work?</summary><p class="muted">On enabled spots, another buyer can replace the current holder before the close at the published next price. Original-payer principal and conditional rewards are tracked separately.</p></details><details><summary>What if the campaign is not delivered?</summary><p class="muted">Report the issue from your placement workspace. Evidence, review and the booking’s published terms determine the outcome.</p></details>${link("/policies/fulfillment", "View fulfillment and refund terms", "text-link")}`)}</div></div><aside class="spot-panel"><div class="eyebrow">YOUR PLACE ON THIS VEHICLE</div><h2>${esc(p.name)}</h2><div class="actions">${badge(on ? "Takeovers enabled" : "Fixed booking")}${badge(s.phase)}</div><div class="price">${money(priceFor(s, p)).replace(" USDC", "")} <small>USDC</small></div><p class="tiny muted">For the full campaign · print & install included</p><dl class="data-list"><div><dt>Service period</dt><dd>${date(s.start)}<br/>— ${date(s.end)}</dd></div><div><dt>Booking closes</dt><dd>${date(s.close)}</dd></div><div><dt>Surface</dt><dd>${esc(p.dimensions)}<br/><small>Approximate · verify for printing</small></dd></div>${b ? `<div><dt>Current holder</dt><dd>${esc(b.brand)}</dd></div>` : ""}</dl>${b && on ? banner("Provisional until close", "A takeover changes the holder before printing. Prior-holder money remains with its original payer.") : ""}<div style="margin-top:20px">${mine ? link("/buy/placements/" + b.id, "View your placement", "button primary") : available ? link(`/checkout/${s.id}?spot=${p.id}`, `${b ? "Take over" : "Book this spot"} ${icon("arrow")}`, "button primary") : `<button class="button" disabled>${s.phase !== "open" ? "Bidding closed" : "Already booked"}</button>`}</div><p class="tiny muted" style="text-align:center;margin:12px 0 0">Instant booking · artwork reviewed afterward</p><hr class="divider"/>${select(
    "sale-period",
    "Other sale periods",
    state.sales.filter((x) => x.assetId === a.id).map((x) => [x.id, x.title]),
    s.id,
    'data-sale-picker="' + a.id + '"',
  )}</aside></div><div class="mobile-spot-cta"><div><strong>${esc(p.name)}</strong><small>${money(priceFor(s, p))} · print & install included</small></div>${button("show-spot-sheet", "View spot " + icon("arrow"), "", "button primary")}</div>`;
}
function how(owner) {
  return `<div style="padding:55px 0 20px">${heading(owner ? "FOR SPACE OWNERS" : "FOR BUYERS", owner ? "Turn everyday space into opportunity." : "Your next campaign belongs out there.", owner ? "From a vehicle photo to a bookable page. You control the spots, terms and fulfillment." : "Find a physical space, book instantly and follow your campaign from artwork to installation.", link(owner ? "/host/assets/new" : "/explore", owner ? "Create your first space" : "Find a space", "button primary"))}</div><div class="grid three">${(owner
    ? [
        [
          "Capture your asset",
          "Photograph it, use your phone or describe a model. Review the suggested draft.",
        ],
        [
          "Make it yours",
          "Edit surfaces, select fixed dates and set prices including production. Enable takeovers per spot.",
        ],
        [
          "Publish & fulfill",
          "Share your page, review creative, print/install and upload proof. Earnings release after service and review.",
        ],
      ]
    : [
        [
          "Discover your space",
          "Compare vehicles, operating areas, service periods and spot-level booking rules.",
        ],
        [
          "Book with your wallet",
          "Sign in, choose your campaign and pay. A campaign can group spaces from several owners.",
        ],
        [
          "Work together",
          "Submit creative, follow production and review installation proof. Your workspace holds every update.",
        ],
      ]
  )
    .map(([t, d], i) =>
      card(
        "",
        `<div class="step-number">0${i + 1}</div><h2>${t}</h2><p class="muted">${d}</p>`,
      ),
    )
    .join(
      "",
    )}</div><section class="marketing-strip"><div><div class="eyebrow">MADE FOR THE PHYSICAL WORLD</div><h2>Know what happens next.</h2><p>Takeovers end before installation. Artwork, delivery and money have their own clear milestones.</p></div>${link("/help", "Explore the help center", "button")}</section>`;
}
export const articles = [
  ["takeovers", "Understanding takeovers", "Buying"],
  ["artwork", "Preparing your artwork", "Artwork"],
  ["installation", "Installation and proof", "Delivery"],
  ["wallets", "Signing in with your wallet", "Account"],
  ["payments", "A payment is still processing", "Payments"],
  ["earnings", "When owner earnings become available", "Listing"],
];
function help() {
  return `<div style="padding:50px 0 10px">${heading("A LITTLE GUIDANCE", "How can we help?", "Find a clear next step for buying, listing or managing a campaign.")}</div><form data-form="help-search" class="help-search">${field("q", "Search help", "", "search", 'placeholder="Try artwork, takeovers or wallet"')}<button class="button" type="submit">Search articles</button></form><div class="grid two">${articles
    .filter(
      ([id, t]) =>
        !new URLSearchParams(location.search).get("q") ||
        t
          .toLowerCase()
          .includes(
            new URLSearchParams(location.search).get("q").toLowerCase(),
          ),
    )
    .map(([id, t, c]) =>
      card(
        "",
        `<div class="eyebrow">${c}</div>${link("/help/" + id, `${t}${icon("arrow")}`, "article-link")}`,
      ),
    )
    .join(
      "",
    )}</div><section class="marketing-strip"><div><h2>Need a hand with a booking?</h2><p>Keep the conversation and evidence together in a support case.</p></div>${link("/support/new", "Contact support", "button")}</section>`;
}
function article(id) {
  const info = articles.find((x) => x[0] === id);
  if (!info)
    return empty(
      "Article not found",
      "Browse the help center for another topic.",
      link("/help", "Help center"),
    );
  const text = {
    takeovers: [
      "A provisional place for your brand",
      "A takeover-enabled spot can have a new buyer before its stated close. The next buyer pays the published price. Once bidding closes, the final holder is selected before production.",
      "Your money after displacement",
      "Your original principal is tracked as an available credit. Any additional reward is conditional until the published refund exposure ends. The money stays associated with its original wallet.",
    ],
    artwork: [
      "Start with a clear source file",
      "Choose a high-resolution PNG or suitable artwork and position it inside the suggested surface. The prototype accepts PNG/JPEG/WebP previews; production specifications require verified dimensions.",
      "Keep the right revision",
      "Owners may request changes against their published content rules. The approved final revision is locked before printing.",
    ],
    installation: [
      "The owner arranges production",
      "Printing and installation are included in the advertised spot price. The owner covers the production work before earnings are released.",
      "Review actual evidence",
      "Your placement workspace shows installation photos and dates. Accept clear proof or report a specific issue so both parties can resolve it.",
    ],
    wallets: [
      "Connect, then sign in",
      "Choose a supported wallet and sign an authentication message. Connecting alone is not signing in and does not send money.",
      "Switch with intention",
      "The active wallet determines access to your private workspace and claims. Email is optional contact information and cannot recover wallet authority.",
    ],
    payments: [
      "Resume the existing payment",
      "A source transfer and an accepted placement are separate stages. Return to the payment progress page to see what has already happened.",
      "Avoid a duplicate send",
      "Use the existing payment record and its transaction hash. An uncertain result should be tracked rather than starting another payment.",
    ],
    earnings: [
      "Held until campaign and review end",
      "Installation proof approval does not release campaign earnings. Funds remain held throughout the service period and issue-review window.",
      "See the available amount",
      "Eligible proceeds appear under Available. Open cases remain visible for review. The exact review-window duration is a policy decision; the prototype uses clearly labeled sample dates.",
    ],
  }[id];
  return `<nav class="breadcrumbs">${link("/help", "Help center", "")} / ${info[2]}</nav>${heading(info[2], info[1])}<article class="panel prose"><h2>${text[0]}</h2><p>${text[1]}</p><h2>${text[2]}</h2><p>${text[3]}</p>${link("/support/new", "Still need help? Contact support", "button")}</article>`;
}
function policy(id) {
  const name =
    {
      terms: "Platform terms",
      privacy: "Privacy & data",
      content: "Content standards",
      refunds: "Cancellations & refunds",
      takeovers: "Takeover rules",
      fulfillment: "Physical fulfillment",
    }[id] ?? "Platform policy";
  return `<div style="padding-top:35px">${heading("POLICIES / MOCK CONTENT", name, "Example product-policy content for design review. Final policy language and precise review duration are still to be agreed.")}</div><nav class="filter-row">${Object.entries(
    {
      terms: "Terms",
      privacy: "Privacy",
      content: "Content",
      refunds: "Refunds",
      takeovers: "Takeovers",
      fulfillment: "Fulfillment",
    },
  )
    .map(([k, v]) =>
      link("/policies/" + k, v, "chip " + (k === id ? "active" : "")),
    )
    .join(
      "",
    )}</nav><article class="panel prose"><h2>Clear terms before a booking</h2><p>Each sale identifies its owner, spot, service dates, included price, content rules and applicable takeover mode. Commercial terms attached to funded bookings remain fixed.</p><h2>Printing, installation and delivery</h2><p>The spot price includes printing and installation. The owner arranges and covers the work, then shares actual proof. Takeovers close before installation. Owner earnings remain held until campaign end and the issue-review window closes.</p><h2>Money and original-wallet claims</h2><p>Available principal, conditional rewards and owner earnings are shown separately. A change in placement ownership does not reassign historical financial claims. Applicable payment costs are shown before approval.</p><h2>Issues and evidence</h2><p>Use the placement workspace to report delivery or content issues. Evidence and review decisions are recorded in the case. Exact dispute rules, review-window length and removal responsibility are open policy details.</p><h2>Information we show</h2><p>Public listings contain approximate coverage and approved public profile information. Private contact and precise operational details stay in the relevant private workspace. This prototype contains sample data only.</p>${link("/support/new", "Ask about these terms", "button")}</article>`;
}
export const publicActions = {
  "show-spot-sheet": () => {
    const content = document.querySelector(".spot-panel")?.innerHTML;
    if (content)
      modal("Your selected spot", `<div class="spot-sheet">${content}</div>`);
  },
  "save-asset": (el) => {
    if (!requireSignIn(location.pathname + location.search)) return;
    update((s) => {
      s.saved = s.saved.includes(el.dataset.id)
        ? s.saved.filter((x) => x !== el.dataset.id)
        : [...s.saved, el.dataset.id];
    });
    toast(
      state.saved.includes(el.dataset.id)
        ? "Saved to your shortlist."
        : "Removed from saved spaces.",
    );
  },
  "select-spot": (el) => {
    const q = new URLSearchParams(location.search);
    q.set("spot", el.dataset.id);
    navigate(location.pathname + "?" + q);
  },
  "share-space": async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Space link copied.");
    } catch {
      modal(
        "Share this space",
        field("url", "Copy this page link", location.href, "url", "readonly"),
      );
    }
  },
  "submit-search": (el) => el.closest("form").requestSubmit(),
};
export const publicForms = {
  explore: (data) => {
    const q = new URLSearchParams();
    for (const k of ["q", "type", "start"])
      if (data.get(k)) q.set(k, data.get(k));
    navigate("/explore?" + q);
  },
  filters: (data) => {
    const q = new URLSearchParams(location.search);
    for (const k of ["mode", "budget", "sort"])
      data.get(k) ? q.set(k, data.get(k)) : q.delete(k);
    navigate("/explore?" + q);
  },
  "help-search": (data) =>
    navigate("/help?q=" + encodeURIComponent(data.get("q") ?? "")),
};
