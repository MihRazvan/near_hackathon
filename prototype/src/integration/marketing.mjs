import { link, esc } from "./ui.mjs";
import { icon } from "../ui.mjs";
import { outwardArrow } from "../brand.mjs";

// This photograph and overlaid campaign are an illustration, never inventory.
export function streetPreview({ compact = false } = {}) {
  return `<figure class="street-preview ${compact ? "compact" : ""}">
    <div class="street-picture" data-ad-preview>
      <svg viewBox="0 0 1600 900" role="img" aria-label="Illustration of a yellow advertising panel on a white van on a Dublin street">
        <image href="/images/van-dublin.webp" width="1600" height="900"/>
        <g class="preview-campaign" transform="rotate(1.2 710 473)">
          <rect x="437" y="389" width="558" height="172" rx="2" fill="#f5e642"/>
          <text x="464" y="459" class="preview-message">GOOD THINGS</text>
          <text x="464" y="525" class="preview-message">GET AROUND.</text>
          <path d="m903 514 55-55m-55 0h55v55" fill="none" stroke="#123e42" stroke-width="8"/>
        </g>
        <g class="preview-outline" fill="none" stroke="#f5e642" stroke-width="3" stroke-dasharray="10 8"><rect x="437" y="389" width="558" height="172"/></g>
      </svg>
      <span class="photo-location">${icon("map")} Dublin, Ireland</span>
      <span class="surface-pointer">One ordinary van.<br>A whole new audience.</span>
    </div>
    <figcaption><span>Illustrative placement. Your brand could be next.</span><button type="button" class="preview-toggle" data-preview-toggle aria-pressed="true">See the blank canvas ${icon("arrow")}</button></figcaption>
  </figure>`;
}

export function categoryLinks(selected = "") {
  const current = new URLSearchParams(globalThis.location?.search ?? "");
  const destination = (type) => {
    const query = new URLSearchParams();
    for (const key of ["q", "city", "campaign", "availability", "sort"])
      if (current.has(key)) query.set(key, current.get(key));
    if (type) query.set("type", type);
    return "/explore" + (query.size ? "?" + query : "");
  };
  return `<nav class="surface-types" aria-label="Types of advertising space">${[
    ["", "All spaces", "grid"],
    ["car", "Cars", "car"],
    ["van", "Vans", "car"],
    ["bike", "Bikes", "bike"],
    ["motorcycle", "Motorcycles", "moto"],
    ["other", "Other surfaces", "surface"],
  ]
    .map(
      ([type, title, glyph]) =>
        `<a href="${esc(destination(type))}" class="surface-type ${selected === type ? "selected" : ""}" ${selected === type ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${title}</span></a>`,
    )
    .join("")}</nav>`;
}

export function homeView({
  search,
  inventory,
  availableCount,
  publishedCount,
}) {
  return `<section class="street-hero" aria-labelledby="home-title">
    <div class="hero-copy"><p class="hero-intro"><span class="status-dot"></span> Big ideas belong out here.</p>
      <h1 id="home-title" tabindex="-1">ADVERTISE<br>ON EVERYTHING.</h1>
      <p class="hero-description">The next great ad space isn’t on a screen. It’s on the car next door. Find a real-world spot for your brand, or turn your own space into one.</p>
      <div class="actions">${link("/explore", "Find your space " + outwardArrow, "button primary")}${link("/host/assets/new", "Earn with your space", "button quiet")}</div>
      <p class="hero-footnote">Starting with vehicles. Going everywhere.</p>
    </div>${streetPreview()}
  </section>
  <div class="street-assurances"><span>${icon("check")} Printing & installation included</span><span>${icon("calendar")} Clear dates. One campaign price.</span><span>${icon("shield")} Your payment follows the campaign</span></div>
  <section class="market-section" aria-labelledby="market-title"><div class="section-top"><div><h2 id="market-title">GOOD SPACES.<br>GREAT POSSIBILITIES.</h2><p>Find a place your next customer might pass.</p></div>${link("/explore", "Explore the marketplace " + outwardArrow, "editorial-link")}</div>
    ${search}${categoryLinks()}
    ${inventory || `<div class="market-invitation"><div><h3>Be the first space on the block.</h3><p>The marketplace is just getting started. Add a vehicle, choose your panels, and publish your first campaign.</p></div>${link("/host/assets/new", "List your space " + outwardArrow, "button primary")}</div>`}
    ${!availableCount && publishedCount ? `<p class="inventory-note">Looking for a previous campaign? ${link("/explore?availability=all", "Browse past campaign records", "text-link")}</p>` : ""}
  </section>
  <section class="owner-feature" aria-labelledby="owner-title"><div class="owner-photo"><img src="/images/van-side.webp" alt="An unbranded van with a large side panel, illustrating a potential advertising surface" width="1400" height="933" loading="lazy"><span>See a van? We see possibilities.</span></div><div class="owner-copy"><h2 id="owner-title">THAT EMPTY SPACE<br>HAS POTENTIAL.</h2><p>Your car. Your cargo bike. Your daily route. Give a brand a place in the real world, on your terms.</p><ul><li>Choose exactly where an ad can go.</li><li>Set your dates, rules and all-in price.</li><li>Print, install, share proof. Get paid.</li></ul>${link("/host/assets/new", "Put your space to work " + outwardArrow, "button signal")}${link("/how-it-works/list", "How listing works", "owner-guide")}</div></section>
  <section class="campaign-process" aria-labelledby="process-title"><div class="section-top"><h2 id="process-title">FROM A GOOD SPOT<br>TO A GREAT CAMPAIGN.</h2>${link("/how-it-works/buy", "The whole process " + outwardArrow, "editorial-link")}</div><ol class="process-line"><li><span class="process-index">01</span><h3>Find your place.</h3><p>Choose the space, location and campaign dates that work for you.</p></li><li><span class="process-index">02</span><h3>Make your mark.</h3><p>Book your spot and share your artwork. The owner takes care of printing and installation.</p></li><li><span class="process-index">03</span><h3>Take it out there.</h3><p>See the installation proof, follow your campaign, and keep everything in one workspace.</p></li></ol></section>
  <section class="takeover-feature" aria-labelledby="takeover-title"><div class="takeover-symbol" aria-hidden="true">${icon("takeover")}</div><div><h2 id="takeover-title">FOUND THE SPOT?<br>MAKE YOUR MOVE.</h2><p>Some spaces allow takeovers before booking closes. A new advertiser can claim the spot, while the previous advertiser keeps their refund and any eligible reward.</p>${link("/help/takeovers", "Get to know takeovers " + outwardArrow, "editorial-link")}</div><div class="takeover-note"><span>Owner’s choice.</span><span>Clear deadline.</span><span>Always before printing.</span></div></section>
  <section class="closing-line"><h2>SMALL SPACE.<br>BIG POTENTIAL.</h2><div><p>For the brands with something to say.<br>And the people with a place to say it.</p>${link("/explore", "Find your space " + outwardArrow, "button primary")}</div></section>`;
}

export function howItWorksHero(owner) {
  return `<div class="guide-hero"><div><h1 tabindex="-1">${owner ? "YOUR SPACE.<br>YOUR TERMS." : "YOUR BRAND.<br>OUT IN THE WORLD."}</h1><p>${owner ? "A little space on your vehicle. A whole new way to earn. You choose the panels, the rules and the dates." : "Find a space, share your artwork, and follow your campaign all the way to the street."}</p>${link(owner ? "/host/assets/new" : "/explore", (owner ? "List your space " : "Find your space ") + outwardArrow, "button primary")}</div>${streetPreview({ compact: true })}</div>`;
}
