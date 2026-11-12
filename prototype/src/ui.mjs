export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (n) =>
  `${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
export const date = (v) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(v + "T12:00:00Z"))
    : "Not set";
export const short = (v) =>
  v?.length > 20 ? v.slice(0, 6) + "…" + v.slice(-4) : v;
export const label = (v) =>
  String(v ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const paths = {
  bike: "M5 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 14l5-9 5 9H5m8-9h4l2 9M8 5h4",
  moto: "M5 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 15l4-7h6l4 7M9 8 7 5H3M15 8l-1-5h3M9 8l4 7h3",
  surface: "M3 4h18v16H3zM3 10h18M9 4v6M15 10v10M3 15h12",
  takeover: "M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  plus: "M12 5v14M5 12h14",
  heart: "M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 0 10 8 16 8-6 13-11 8-16Z",
  check: "m5 12 4 4L20 5",
  chevron: "m9 5 7 7-7 7",
  wallet: "M3 6h17v14H3zM3 6V3h15v3M15 11h7v5h-7z",
  car: "M3 11 6 5h12l3 6v8h-3v-3H6v3H3zM3 11h18M6 13h2M16 13h2",
  calendar: "M3 5h18v16H3zM7 2v6M17 2v6M3 10h18",
  chart: "M4 19V9M10 19V4M16 19v-7M22 21H2",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  bell: "M5 16h14l-2-3V8a5 5 0 0 0-10 0v5l-2 3ZM10 20h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  file: "M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v6l4 2",
  upload: "M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7",
  logout: "M9 3H3v18h6M9 12h12m-5-5 5 5-5 5",
  map: "m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3zM9 2v17M15 5v17",
  close: "m5 5 14 14M5 19 19 5",
  download: "M12 3v13m-5-5 5 5 5-5M4 19v3h16v-3",
  copy: "M8 8h13v13H8zM3 16V3h13",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 11l3 3 5-6",
  menu: "M3 6h18M3 12h18M3 18h18",
};
export const icon = (name = "arrow") =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.arrow}"/></svg>`;
export const link = (href, text, cls = "button") =>
  `<a class="${cls}" href="${esc(href)}">${text}</a>`;
export const button = (action, text, attrs = "", cls = "button") =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
export const badge = (text, tone = "") =>
  `<span class="badge ${tone || (["approved", "accepted", "completed", "issued", "available", "published", "paid"].includes(text) ? "green" : ["displaced", "changes-requested", "open case"].includes(text) ? "orange" : "")}">${esc(label(text))}</span>`;
export const heading = (eyebrow, title, description = "", action = "") =>
  `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 tabindex="-1">${esc(title)}</h1>${description ? `<p class="lede">${description}</p>` : ""}</div>${action ? `<div class="heading-actions">${action}</div>` : ""}</div>`;
export const card = (title, body, cls = "") =>
  `<section class="panel ${cls}">${title ? `<div class="section-heading"><h2>${title}</h2></div>` : ""}${body}</section>`;
export const stat = (name, value, detail = "", trend = "") =>
  `<div class="stat"><span>${name}</span><strong>${value}</strong><small class="${trend}">${detail}</small></div>`;
export const stats = (items) =>
  `<div class="stats">${items.map((x) => stat(...x)).join("")}</div>`;
export const field = (name, title, value = "", type = "text", extra = "") =>
  `<label class="field"><span>${title}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}/></label>`;
export const textarea = (name, title, value = "", extra = "") =>
  `<label class="field"><span>${title}</span><textarea name="${name}" rows="4" ${extra}>${esc(value)}</textarea></label>`;
export const select = (name, title, options, value = "", extra = "") =>
  `<label class="field"><span>${title}</span><select name="${name}" ${extra}>${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`;
    })
    .join("")}</select></label>`;
export const empty = (title, text, action = "") =>
  `<div class="empty"><div class="empty-icon">${icon("grid")}</div><h2>${title}</h2><p>${text}</p>${action}</div>`;
export const banner = (title, text, tone = "") =>
  `<div class="notice ${tone}">${icon(tone === "orange" ? "clock" : "shield")}<div><strong>${title}</strong><p>${text}</p></div></div>`;
export const table = (headers, rows) =>
  `<div class="table-region"><p class="table-scroll-hint">${icon('arrow')} Scroll across to see all columns</p><div class="table-wrap" role="region" aria-label="Data table, scroll horizontally for more columns" tabindex="0"><table><thead><tr>${headers.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>${rows.length ? "" : '<p class="muted table-empty">Nothing here yet.</p>'}</div></div>`;
export function tabs(items, selected) {
  return `<nav class="tabs" aria-label="Page sections">${items.map(([title, href, id]) => `<a href="${esc(href)}" class="${selected === (id ?? title) ? "active" : ""}">${title}</a>`).join("")}</nav>`;
}
export const timeline = (items, current = 0) =>
  `<ol class="timeline">${items.map(([title, detail], i) => `<li class="${i < current ? "done" : i === current ? "current" : ""}"><i>${i < current ? icon("check") : String(i + 1).padStart(2, "0")}</i><div><strong>${title}</strong><p>${detail}</p></div></li>`).join("")}</ol>`;
export const avatar = (name, cls = "") =>
  `<span class="avatar ${cls}">${esc(
    name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join(""),
  )}</span>`;
let scene = 0;
export function vehicle(
  a,
  {
    large = false,
    selected = "",
    interactive = false,
    editor = false,
    spots = true,
  } = {},
) {
  const id = `scene-${++scene}`, layout = a.spots ?? [];
  const body =
    a.type === "bike"
      ? `<g stroke="#30372f" stroke-width="12" fill="none"><circle cx="265" cy="340" r="92"/><circle cx="670" cy="340" r="92"/><path d="m265 340 160-175 94 175H265m160-175 245 175-80-235h-60m40-3h65M425 165l-40-55h70"/></g><path d="M150 190h190l25 135H150z" fill="${a.color}" stroke="#596357" stroke-width="4"/><path d="M175 200h140v115H175z" fill="#fbfaf2"/><path d="m395 110 65 0" stroke="#30372f" stroke-width="15"/>`
      : a.type === "moto"
        ? `<g fill="#272d29"><circle cx="265" cy="350" r="78"/><circle cx="690" cy="350" r="78"/></g><g fill="#bcc2b8"><circle cx="265" cy="350" r="40"/><circle cx="690" cy="350" r="40"/></g><path d="m245 280 110-110 120 3 93-65 93 65 65 90-100 45-120 38-105-29z" fill="${a.color}" stroke="#687060" stroke-width="3"/><path d="m270 155 125 0 40 32H310z" fill="#30372f"/><path d="m535 165 50-60 65 25 20 53z" fill="#61736b"/><path d="m642 205 48 145M373 260l-108 90" stroke="#414a42" stroke-width="13"/><path d="m382 217 146-15 38 85-110 20z" fill="#f2f1e8"/>`
        : `<path d="M125 283q5-25 48-35l85-12 102-107q18-16 50-16h${a.type === "van" ? "257" : "179"}q35 0 52 27l${a.type === "van" ? "42 80" : "77 102"} 80 22q24 9 24 39v53H125z" fill="${a.color}" stroke="#6c776b" stroke-width="3"/><path d="m284 233 90-94h193l62 94z" fill="#677970"/><path d="m401 139-5 94M527 139l20 94" stroke="#b6c3b6" stroke-width="8"/><path d="M148 291h70M758 282h65" stroke="#f1f0d9" stroke-width="12"/><path d="M150 330h647" stroke="#7a8579" stroke-width="7"/><g fill="#252b27"><circle cx="277" cy="338" r="62"/><circle cx="698" cy="338" r="62"/></g><g fill="#b6bcb3"><circle cx="277" cy="338" r="31"/><circle cx="698" cy="338" r="31"/></g><path d="M366 247h154v69H366z" fill="#f5f4eb" opacity=".6"/>`;
  const overlays =
    spots && large
      ? layout
          .map((p, i) => {
            const active = p.id === selected;
            return `<g class="spot-shape ${active ? "selected" : ""}" ${interactive ? `data-action="select-spot" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Select ${esc(p.name)}"` : ""} data-spot="${esc(p.id)}"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5" fill="${active ? "#e7ff87" : "#fcfbef"}" fill-opacity="${active ? ".9" : ".7"}" stroke="${active ? "#242c24" : "#8c9684"}" stroke-width="${active ? 3 : 1.5}" stroke-dasharray="${active ? "" : "5 4"}"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 5}" text-anchor="middle" font-size="17" font-family="sans-serif" fill="#333c30">${esc(String(i + 1).padStart(2, "0"))}</text>${editor && active ? `<rect class="resize-handle" x="${p.x + p.w - 8}" y="${p.y + p.h - 8}" width="16" height="16" fill="#283527" stroke="white" stroke-width="2"/>` : ""}</g>`;
          })
          .join("")
      : "";
  return `<div class="vehicle-scene ${large ? "large" : ""}" style="--scene:${a.color}">${a.photos?.[0] ? `<img class="uploaded-scene" src="${esc(a.photos[0])}" alt="${a.imageProvenance==='ai-generated'?'AI-generated reference:':'Uploaded photo:'} ${esc(a.title)}"/>` : ""}<svg viewBox="0 0 960 480" class="vehicle-svg" ${editor ? 'data-editor-canvas="true"' : ""} aria-label="Illustrative ${esc(a.model)} and advertising surfaces"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="${a.color}" stop-opacity=".4"/></linearGradient></defs>${a.photos?.[0] ? "" : `<rect width="960" height="480" fill="url(#${id})"/><path d="M0 407Q350 368 960 403" stroke="#9da992" stroke-opacity=".3" fill="none"/><ellipse cx="475" cy="400" rx="350" ry="14" fill="#4b5f40" opacity=".1"/>`}${a.photos?.[0] ? "" : body}${overlays}</svg><span class="scene-caption">${a.photos?.[0] ? a.imageProvenance==='ai-generated'?"AI-GENERATED VEHICLE":"UPLOADED PHOTO" : "ILLUSTRATIVE VEHICLE"} <i>↗</i> ${esc(a.model)}</span></div>`;
}
export const checkList = (items) =>
  `<ul class="check-list">${items.map((x) => `<li>${icon("check")}<span>${x}</span></li>`).join("")}</ul>`;
export function modal(title, body) {
  const d = document.querySelector("#modal");
  d.innerHTML = `<header><div><div class="eyebrow">EVERYWHERE</div><h2>${title}</h2></div>${button("close-modal", icon("close"), 'aria-label="Close dialog"', "icon-button")}</header><div class="modal-body">${body}</div>`;
  if (!d.open) d.showModal();
  d.querySelector("input,select,button")?.focus();
}
export function closeModal() {
  document.querySelector("#modal")?.close();
}
export function download(name, content, type = "text/plain") {
  const url = URL.createObjectURL(new globalThis.Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readImage(file) {
  if (!file?.size) return "";
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 1_500_000
  )
    throw new Error(
      "Choose a PNG, JPEG or WebP smaller than 1.5 MB.",
    );
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
