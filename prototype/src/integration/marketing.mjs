import { link, esc } from "./ui.mjs";
import { icon } from "../ui.mjs";
import { outwardArrow } from "../brand.mjs";
import { placementNft } from "./placement-nft.mjs";

// Both images are illustrative. Blank mode displays the untouched source photo.
export function streetPreview() {
  return `<figure class="street-preview">
    <div class="street-picture" data-ad-preview>
      <img class="preview-original" data-preview-original src="/images/van-dublin.webp" width="1600" height="900" alt="Original photograph of a white van with a blank cargo panel on a Dublin street" aria-hidden="true" decoding="async">
      <img class="preview-ad" data-preview-ad src="/images/van-dublin-ad.webp" width="1600" height="900" alt="Illustrative AI-edited photograph of a yellow GOOD THINGS GET AROUND advertising decal applied to the van’s cargo panel" aria-hidden="false" fetchpriority="high" decoding="async">
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
      <div class="actions">${link("/explore", "Find your space " + outwardArrow, "button primary")}${link("/experience", "Try a takeover " + outwardArrow, "button signal")}</div>
      <p class="hero-footnote">Starting with vehicles. Going everywhere.</p>
    </div>${streetPreview()}
  </section>
  <div class="street-assurances"><span>${icon("check")} Printing & installation included</span><span>${icon("calendar")} Clear dates. One campaign price.</span><span>${icon("shield")} Your placement NFT controls the artwork</span></div>
  <section class="market-section" aria-labelledby="market-title"><div class="section-top"><div><h2 id="market-title">GOOD SPACES.<br>GREAT POSSIBILITIES.</h2><p>Find a place your next customer might pass.</p></div>${link("/explore", "Explore the marketplace " + outwardArrow, "editorial-link")}</div>
    ${search}${categoryLinks()}
    ${inventory || `<div class="market-invitation"><div><h3>Be the first space on the block.</h3><p>The marketplace is just getting started. Add a vehicle, choose your panels, and publish your first campaign.</p></div>${link("/host/assets/new", "List your space " + outwardArrow, "button primary")}</div>`}
    ${!availableCount && publishedCount ? `<p class="inventory-note">Looking for a previous campaign? ${link("/explore?availability=all", "Browse past campaign records", "text-link")}</p>` : ""}
  </section>
  <section class="owner-feature" aria-labelledby="owner-title"><div class="owner-photo"><img src="/images/van-side.webp" alt="An unbranded van with a large side panel, illustrating a potential advertising surface" width="1400" height="933" loading="lazy"><span>See a van? We see possibilities.</span></div><div class="owner-copy"><h2 id="owner-title">THAT EMPTY SPACE<br>HAS POTENTIAL.</h2><p>Your car. Your cargo bike. Your daily route. Give a brand a place in the real world, on your terms.</p><ul><li>Choose exactly where an ad can go.</li><li>Set your dates, rules and all-in price.</li><li>Print, install, share proof. Get paid.</li></ul>${link("/host/assets/new", "Put your space to work " + outwardArrow, "button signal")}</div></section>
  <section class="takeover-feature" aria-labelledby="takeover-title"><div class="takeover-symbol" aria-hidden="true">${icon("takeover")}</div><div><h2 id="takeover-title">FOUND THE SPOT?<br>MAKE YOUR MOVE.</h2><p>Some spaces allow takeovers before booking closes. A new advertiser can claim the spot, while the previous advertiser keeps their refund and any eligible reward.</p>${link("/experience", "Make your move " + outwardArrow, "editorial-link")}</div><div class="takeover-note"><span>Owner’s choice.</span><span>Clear deadline.</span><span>Always before printing.</span></div></section>
  <section class="nft-feature" aria-labelledby="nft-feature-title"><div class="nft-feature-copy"><h2 id="nft-feature-title">A REAL SPOT.<br>A RIGHT YOU CAN MOVE.</h2><p>When booking closes, the final advertiser receives a placement NFT on NEAR. Hand it to your creative studio to manage the artwork. Refunds, rewards and earnings keep their original owners.</p><div class="actions">${link("/experience", "Try the NFT handoff " + outwardArrow, "button primary")}${link("/records/e22dd301-786f-476c-af74-0df7cd2e6168", "Inspect the recorded NFT", "editorial-link")}</div></div><div class="nft-feature-artifact">${placementNft({surface:'Dublin van · side panel',controller:'Creative studio',originalPayer:'Final advertiser',phase:'editable',example:true})}<p>Illustrative placement right. Real artwork editing closes at approval or the published deadline.</p></div></section>`;
}
