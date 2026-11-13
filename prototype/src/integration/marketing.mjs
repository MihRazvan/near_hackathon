import { link, esc } from "./ui.mjs";
import { icon } from "../ui.mjs";
import { outwardArrow } from "../brand.mjs";
import { placementNft } from "./placement-nft.mjs";

// Both images are illustrative. Blank mode displays the untouched source photo.
export function streetPreview() {
  return `<figure class="street-preview">
    <div class="street-picture" data-ad-preview>
      <img class="preview-original" data-preview-original src="/images/van-dublin.webp" width="1600" height="900" alt="Original photograph of a white van with a blank cargo panel on a Dublin street" aria-hidden="true" decoding="async">
      <img class="preview-ad" data-preview-ad src="/images/van-dublin-ad.webp" width="1600" height="900" alt="Illustrative AI-edited photograph of a yellow GOOD THINGS GET AROUND advertising decal applied to the van\'s cargo panel" aria-hidden="false" fetchpriority="high" decoding="async">
      <span class="photo-location">${icon("map")} Dublin, Ireland</span>
      <span class="surface-pointer">An ad on the side panel.<br>Seen along the daily route.</span>
    </div>
    <figcaption><span class="demo-tag" title="AI-edited placement example">Demo</span><button type="button" class="preview-toggle" data-preview-toggle aria-pressed="true">See the blank canvas ${icon("arrow")}</button></figcaption>
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
    ["truck", "Trucks", "car"],
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
  teamTests = false,
}) {
  return `<section class="street-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <h1 id="home-title" tabindex="-1">advertise on<br>everything.</h1>
      <p class="hero-description">Have a vehicle? Add a photo or describe it. AI turns it into editable advertising space. Review the panels, set your offer, and go live.</p>
      <div class="actions">${link("/host/assets/new?mode=photo", "Scan a vehicle " + outwardArrow, "button primary")}${link("/host/assets/new?mode=describe", "Describe a vehicle " + outwardArrow, "button signal")}${link("/explore", "Find advertising space", "editorial-link")}</div>
      <p class="hero-footnote">Starting with vehicles. Going everywhere.</p>
    </div>${streetPreview()}
  </section>
  <div class="street-assurances"><span>${icon("check")} Printing & installation included</span><span>${icon("calendar")} Clear dates. One campaign price.</span><span>${icon("shield")} Your placement NFT controls the artwork</span></div>
  <section class="market-section" aria-labelledby="market-title"><div class="section-top"><div><h2 id="market-title">Find your next spot.</h2><p>Choose a vehicle. Pick a panel. Make it yours.</p></div>${link("/explore", "Explore the marketplace " + outwardArrow, "editorial-link")}</div>
    ${inventory || `<div class="market-invitation"><div><h3>List the first space.</h3><p>Add your vehicle and choose which panels advertisers can book.</p></div>${link("/host/assets/new", "List your space " + outwardArrow, "button primary")}</div>`}
    ${!availableCount && publishedCount ? `<p class="inventory-note">Looking for a previous campaign? ${link("/explore?availability=all", "Browse past campaign records", "text-link")}</p>` : ""}
  </section>
  <section class="owner-feature" aria-labelledby="owner-title"><div class="owner-photo"><img src="/images/van-side.webp" alt="An unbranded van with a large side panel, illustrating a potential advertising surface" width="1400" height="933" loading="lazy"><span>Your side panel could carry an ad.</span></div><div class="owner-copy"><h2 id="owner-title">put your<br>vehicle to work.</h2><p>Start with a photo or a description. AI suggests editable panels; you choose the dates, prices and booking rules, then arrange printing and installation.</p><ul><li>Review the suggested panels and adjust their outlines.</li><li>Set campaign dates and a price that includes installation.</li><li>Upload installation evidence. Earnings become available after the campaign and issue review end.</li></ul>${link("/host/assets/new", "List your vehicle " + outwardArrow, "button signal")}</div></section>
  <section class="takeover-feature" aria-labelledby="takeover-title"><div class="takeover-symbol" aria-hidden="true">${icon("takeover")}</div><div><h2 id="takeover-title">new advertiser.<br>same spot.</h2><p>If the owner enables takeovers, another advertiser can buy the spot before booking closes. The previous advertiser can claim a refund, with an extra reward if the campaign succeeds.</p></div><div class="takeover-note"><span>Enabled by the owner.</span><span>Closes before printing.</span></div></section>
  <section class="nft-feature" aria-labelledby="nft-feature-title"><div class="nft-feature-copy"><h2 id="nft-feature-title">hand the<br>creative over.</h2><p>When booking closes, the final advertiser receives a placement NFT on NEAR. Transfer it to your creative studio so they can submit artwork before approval or the deadline. Payment claims stay with their original wallets.</p><div class="actions">${link("/records/e22dd301-786f-476c-af74-0df7cd2e6168", "Inspect the recorded NFT", "editorial-link")}</div></div><div class="nft-feature-artifact">${placementNft({surface:'Dublin van · side panel',controller:'Creative studio',originalPayer:'Final advertiser',phase:'editable',example:true})}<p>Illustrative placement right. Real artwork editing closes at approval or the published deadline.</p></div></section>`;
}
