import { link, esc } from "./ui.mjs";
import { icon } from "../ui.mjs";
import { outwardArrow } from "../brand.mjs";
import {entryHref} from './entry-context.mjs';
import {recordedProof} from './recorded-proof.mjs';
import {setupPreview} from "./setup-preview.mjs";

// Both images are illustrative. Blank mode displays the untouched source photo.
export function streetPreview() {
  return `<figure class="street-preview">
    <div class="street-picture" data-ad-preview>
      <img class="preview-original" data-preview-original src="/images/van-dublin.webp" width="1600" height="900" alt="Original photograph of a white van with a blank cargo panel on a Dublin street" aria-hidden="true" decoding="async">
      <img class="preview-ad" data-preview-ad src="/images/van-dublin-ad.webp" width="1600" height="900" alt="Illustrative AI-edited photograph of a yellow GOOD THINGS GET AROUND advertising decal applied to the van\'s cargo panel" aria-hidden="false" fetchpriority="high" decoding="async">
      <span class="photo-location">${icon("map")} Dublin, Ireland</span>
      <span class="surface-pointer">An ad on the van's side panel.</span>
    </div>
    <figcaption><span class="demo-tag" title="AI-edited placement example">Demo</span><button type="button" class="preview-toggle" data-preview-toggle aria-pressed="true">See the blank canvas ${icon("arrow")}</button></figcaption>
  </figure>`;
}

export function categoryLinks(selected = "") {
  const current = new URLSearchParams(globalThis.location?.search ?? "");
  const destination = (type) => {
    const query = new URLSearchParams();
    for (const key of ["q", "city", "campaign", "availability", "sort", "booking"])
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
  session,
  inventory,
  availableCount,
  publishedCount,
  teamTests = false,
}) {
  return `<section class="street-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <h1 id="home-title" tabindex="-1">advertise on<br>everything.</h1>
      <p class="hero-description">Find ad space on vehicles. List your own with a photo or a prompt.</p>
      <div class="actions hero-actions">${link("/explore", "Find ad space " + outwardArrow, "button primary")}${link(entryHref("/host/assets/new?mode=photo",session), "List my vehicle", "hero-owner-link")}</div>
    </div>${setupPreview()}
  </section>
  <section class="market-section" aria-labelledby="market-title"><div class="section-top"><div><h2 id="market-title">Find your next spot.</h2><p>Choose a vehicle and the panel you want to book.</p></div>${link("/explore", "Explore the marketplace " + outwardArrow, "editorial-link")}</div>
    ${inventory || `<div class="market-invitation"><div><h3>List the first space.</h3><p>Add your vehicle and choose which panels advertisers can book.</p></div>${link("/host/assets/new", "List your space " + outwardArrow, "button primary")}</div>`}
    ${!availableCount && publishedCount ? `<p class="inventory-note">Looking for a previous campaign? ${link("/explore?availability=all", "Browse past campaign records", "text-link")}</p>` : ""}
  </section>
  <div class="street-assurances"><span>${icon("check")} Printing & installation included</span><span>${icon("calendar")} Fixed dates and one campaign price.</span><span>${icon("shield")} Your placement NFT controls the artwork</span></div>
  <section class="owner-feature" aria-labelledby="owner-title"><div class="owner-photo">${streetPreview()}</div><div class="owner-copy"><h2 id="owner-title">your vehicle.<br>your next listing.</h2><p>AI suggests editable spots from a photo or description. You choose the outline, campaign dates, prices and takeover rules.</p><div class="actions">${link(entryHref('/host/assets/new?mode=photo',session),'Scan a vehicle '+outwardArrow,'button signal')}${link(entryHref('/host/assets/new?mode=describe',session),'Describe a vehicle','editorial-link')}</div><p class="owner-draft-note">Start with a private draft. Publish when you are ready.</p></div></section>
  ${recordedProof()}`;
}
