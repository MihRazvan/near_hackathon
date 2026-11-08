const group = (scope, items) =>
  items.map(([id, path, title, sample = path]) => ({
    id,
    path,
    title,
    sample,
    scope,
  }));
export const routes = [
  ...group("public", [
    ["P01", "/", "Home"],
    ["P02", "/explore", "Explore spaces"],
    ["P03", "/spaces/:slug", "Vehicle & spot selection", "/spaces/alpine"],
    ["P04", "/owners/:slug", "Owner profile", "/owners/mara"],
    ["P05", "/how-it-works/buy", "How buying works"],
    ["P06", "/how-it-works/list", "How listing works"],
    ["P07", "/help", "Help center"],
    ["P08", "/help/:article", "Help article", "/help/takeovers"],
    ["P09", "/policies/:policy", "Policies", "/policies/refunds"],
  ]),
  ...group("account", [
    ["A01", "/sign-in", "Wallet sign-in"],
    ["A02", "/welcome", "Create your profile"],
    ["A03", "/account/recovery", "Account recovery"],
  ]),
  ...group("buyer", [
    ["B01", "/buy", "Buyer overview"],
    ["B02", "/buy/campaigns", "Campaigns"],
    ["B03", "/buy/campaigns/new", "New campaign"],
    [
      "B04",
      "/buy/campaigns/:id",
      "Campaign workspace",
      "/buy/campaigns/city-launch",
    ],
    ["B05", "/buy/saved", "Saved spaces"],
    [
      "B06",
      "/checkout/:intentId",
      "Checkout",
      "/checkout/sale-alpine?spot=rear",
    ],
    ["B07", "/payments/:id", "Payment progress", "/payments/sample-payment"],
    [
      "B08",
      "/buy/placements/:id",
      "Placement workspace",
      "/buy/placements/booking-door",
    ],
    [
      "B09",
      "/buy/placements/:id/artwork",
      "Creative editor",
      "/buy/placements/booking-door/artwork",
    ],
    [
      "B10",
      "/buy/campaigns/:id/report",
      "Campaign report",
      "/buy/campaigns/city-launch/report",
    ],
    ["B11", "/buy/money", "Money & credits"],
    [
      "B12",
      "/buy/withdrawals/:id",
      "Credit withdrawal",
      "/buy/withdrawals/sample-withdrawal",
    ],
    ["B13", "/receipts/:id", "Receipt", "/receipts/booking-october"],
  ]),
  ...group("owner", [
    ["O01", "/host", "Owner overview"],
    ["O02", "/host/assets", "My assets"],
    ["O03", "/host/assets/new", "Create asset"],
    [
      "O04",
      "/host/capture/:session",
      "Desktop capture handoff",
      "/host/capture/demo-capture",
    ],
    ["O05", "/capture/:session", "Phone capture", "/capture/demo-capture"],
    [
      "O06",
      "/host/assets/:id/review",
      "Review generated asset",
      "/host/assets/alpine/review",
    ],
    ["O07", "/host/assets/:id", "Asset workspace", "/host/assets/alpine"],
    [
      "O08",
      "/host/assets/:id/spots",
      "Surface editor",
      "/host/assets/alpine/spots",
    ],
    ["O09", "/host/sales", "Sales"],
    ["O10", "/host/sales/new", "Create sale"],
    [
      "O11",
      "/host/sales/:id/edit",
      "Edit sale",
      "/host/sales/sale-alpine/edit",
    ],
    ["O12", "/host/sales/:id", "Sale workspace", "/host/sales/sale-alpine"],
    ["O13", "/host/bookings", "Owner bookings"],
    [
      "O14",
      "/host/bookings/:id",
      "Owner booking",
      "/host/bookings/booking-door",
    ],
    [
      "O15",
      "/host/bookings/:id/artwork",
      "Artwork review",
      "/host/bookings/booking-door/artwork",
    ],
    [
      "O16",
      "/host/sales/:id/fulfillment",
      "Production & installation",
      "/host/sales/sale-alpine/fulfillment",
    ],
    ["O17", "/host/calendar", "Availability calendar"],
    ["O18", "/host/analytics", "Owner analytics"],
    ["O19", "/host/earnings", "Earnings"],
    ["O20", "/host/payouts/:id", "Payout", "/host/payouts/sample-payout"],
  ]),
  ...group("shared", [
    ["S01", "/inbox", "Inbox"],
    ["S02", "/inbox/:threadId", "Conversation", "/inbox/thread-1"],
    ["S03", "/notifications", "Notifications"],
    ["S04", "/settings/profile", "Profile"],
    ["S05", "/settings/workspace", "Workspace & brand"],
    ["S06", "/settings/wallets", "Wallets"],
    ["S07", "/settings/notifications", "Notification settings"],
    ["S08", "/settings/billing", "Billing & documents"],
    ["S09", "/support/new", "Contact support"],
    ["S10", "/support/cases/:id", "Support case", "/support/cases/case-101"],
  ]),
  ...group("ops", [
    ["M01", "/ops", "Operations overview"],
    ["M02", "/ops/listings/:id", "Listing review", "/ops/listings/alpine"],
    ["M03", "/ops/cases/:id", "Dispute review", "/ops/cases/case-101"],
    [
      "M04",
      "/ops/payments/:id",
      "Payment reconciliation",
      "/ops/payments/sample-payment",
    ],
    ["M05", "/ops/audit", "Audit history"],
  ]),
  ...group("global", [
    ["G01", "/_not-found", "Not found"],
    ["G02", "/_access", "Access denied"],
    ["G03", "/_maintenance", "Temporarily unavailable"],
  ]),
];
export function matchRoute(path) {
  for (const r of routes) {
    const names = [];
    const pattern = r.path
      .split("/")
      .map((p) => (p.startsWith(":") ? (names.push(p.slice(1)), "([^/]+)") : p))
      .join("/");
    const match = path.match(new RegExp("^" + pattern + "/?$"));
    if (match)
      return {
        ...r,
        params: Object.fromEntries(
          names.map((name, i) => [name, decodeURIComponent(match[i + 1])]),
        ),
      };
  }
  return { ...routes.find((r) => r.id === "G01"), params: {} };
}
