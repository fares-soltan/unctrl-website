// UNCTRL admin panel
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: { "x-unctrl": "1" }, credentials: "same-origin" };
  if (opts.body !== undefined) {
    if (opts.raw) { init.body = opts.body; init.headers["content-type"] = opts.type; }
    else { init.body = JSON.stringify(opts.body); init.headers["content-type"] = "application/json"; }
  }
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.endsWith("/login")) { showLogin(); throw new Error("Please log in again."); }
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

let toastT;
function toast(text, err = false) {
  const t = $("#toast"); t.textContent = text; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastT); toastT = setTimeout(() => t.className = "toast", 2600);
}

/* ---------- auth ---------- */
function showLogin() { $("#app").hidden = true; $("#login").hidden = false; }
async function showApp() {
  $("#login").hidden = true; $("#app").hidden = false;
  await Promise.all([loadWork(), loadSettings(), loadMessages()]);
}
$("#login-form").onsubmit = async e => {
  e.preventDefault();
  const btn = e.target.querySelector("button"); btn.disabled = true; $("#login-msg").textContent = "";
  try { await api("/api/admin/login", { method: "POST", body: { password: e.target.elements.namedItem("password").value } }); e.target.reset(); await showApp(); }
  catch (err) { $("#login-msg").textContent = err.message; }
  finally { btn.disabled = false; }
};
$("#logout").onclick = async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); };

/* ---------- tabs ---------- */
$$(".side nav button").forEach(b => b.onclick = () => {
  $$(".side nav button").forEach(x => x.classList.toggle("on", x === b));
  $$("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== b.dataset.tab);
  if (b.dataset.tab === "messages") loadMessages();
});

/* ---------- image upload (resized in the browser to keep files light) ---------- */
async function shrink(file, max = 2200) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // keep svg, gif, avif as they are
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5e6) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/webp", .86));
  return blob && blob.size < file.size ? new File([blob], "image.webp", { type: "image/webp" }) : file;
}
async function upload(file) {
  const f = await shrink(file);
  const res = await api("/api/admin/upload", { method: "POST", raw: true, type: f.type, body: f });
  return res.url;
}

// single image field: preview + upload + remove; value kept in data-value
function imageField(el, value, { logo = false } = {}) {
  el.dataset.value = value || "";
  const draw = () => {
    const v = el.dataset.value;
    el.innerHTML = `<div class="img-prev${logo ? " logo" : ""}" style="${v ? `background-image:url('${esc(v)}')` : ""}">${v ? "" : "No image"}</div>
      <label class="btn ghost small upload-btn">${v ? "Replace" : "Upload"}<input type="file" accept="image/*" hidden></label>
      ${v ? '<button type="button" class="btn ghost small danger">Remove</button>' : ""}`;
    el.querySelector("input").onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      el.querySelector(".img-prev").textContent = "Uploading…";
      try { el.dataset.value = await upload(file); draw(); } catch (err) { toast(err.message, true); draw(); }
    };
    const rm = el.querySelector(".danger"); if (rm) rm.onclick = () => { el.dataset.value = ""; draw(); };
  };
  draw();
}

/* ---------- portfolio ---------- */
let work = [], editing = null, gallery = [];
const ICON = { up: "↑", down: "↓" };

async function loadWork() {
  work = await api("/api/admin/work");
  const list = $("#work-list");
  if (!work.length) { list.innerHTML = `<div class="empty">No projects yet. Add your first one.</div>`; return; }
  list.innerHTML = work.map((w, i) => `<div class="item">
    <div class="thumb" style="${w.cover ? `background-image:url('${esc(w.cover)}')` : ""}"></div>
    <div><h4>${esc(w.title)}</h4><div class="meta">${esc([w.client, w.category, w.year].filter(Boolean).join(" / "))}${w.video ? " / video" : ""}</div></div>
    <div class="actions">
      <button class="icon-btn" data-move="-1" data-i="${i}" aria-label="Move up" ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
      <button class="icon-btn" data-move="1" data-i="${i}" aria-label="Move down" ${i === work.length - 1 ? "disabled" : ""}>${ICON.down}</button>
      <a class="btn ghost small" href="/project.html?p=${encodeURIComponent(w.slug)}" target="_blank" rel="noopener">View</a>
      <button class="btn ghost small" data-edit="${i}">Edit</button>
      <button class="btn ghost small danger" data-del="${i}">Delete</button>
    </div></div>`).join("");
  $$("[data-edit]", list).forEach(b => b.onclick = () => openEditor(work[b.dataset.edit]));
  $$("[data-del]", list).forEach(b => b.onclick = async () => {
    const w = work[b.dataset.del];
    if (!confirm(`Delete "${w.title}"? This can't be undone.`)) return;
    try { await api(`/api/admin/work/${w.id}`, { method: "DELETE" }); toast("Project deleted"); loadWork(); } catch (err) { toast(err.message, true); }
  });
  $$("[data-move]", list).forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.i), j = i + Number(b.dataset.move);
    [work[i], work[j]] = [work[j], work[i]];
    try { await api("/api/admin/work/reorder", { method: "POST", body: { ids: work.map(w => w.id) } }); loadWork(); } catch (err) { toast(err.message, true); }
  });
}

function drawGallery() {
  $("#gallery").innerHTML = gallery.map((g, i) => `<div class="g" style="background-image:url('${esc(g)}')"><button type="button" data-rm="${i}" aria-label="Remove image">×</button></div>`).join("");
  $$("#gallery [data-rm]").forEach(b => b.onclick = () => { gallery.splice(Number(b.dataset.rm), 1); drawGallery(); });
}
$("#gallery-input").onchange = async e => {
  const files = [...e.target.files]; e.target.value = "";
  for (const f of files) {
    try { gallery.push(await upload(f)); drawGallery(); } catch (err) { toast(err.message, true); }
  }
};

function openEditor(w) {
  editing = w || null;
  const f = $("#work-form"); f.reset();
  $("#drawer-title").textContent = w ? "Edit project" : "New project";
  const el = k => f.elements.namedItem(k);
  ["title", "client", "year", "category", "slug", "summary", "description", "video"].forEach(k => el(k).value = w ? (w[k] || "") : "");
  el("size").value = w ? (w.size || "normal") : "normal";
  el("style").value = w ? (w.style || "Auto") : "Auto";
  el("featured").checked = w ? !!w.featured : true;
  imageField($('[data-name="cover"]'), w ? w.cover : "");
  gallery = w ? [...(w.gallery || [])] : []; drawGallery();
  $("#work-msg").textContent = "";
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); $("#drawer-bg").hidden = false;
  setTimeout(() => el("title").focus(), 100);
}
function closeEditor() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#drawer-bg").hidden = true; }
$("#add-work").onclick = () => openEditor(null);
$("#drawer-close").onclick = closeEditor;
$("#drawer-bg").onclick = closeEditor;
addEventListener("keydown", e => { if (e.key === "Escape") closeEditor(); });

$("#work-form").onsubmit = async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type="submit"]');
  const body = Object.fromEntries(["title", "client", "year", "category", "slug", "summary", "description", "video", "size", "style"].map(k => [k, f.elements.namedItem(k).value.trim()]));
  body.featured = f.elements.namedItem("featured").checked;
  body.cover = $('[data-name="cover"]').dataset.value; body.gallery = gallery;
  btn.disabled = true; $("#work-msg").className = "msg"; $("#work-msg").textContent = "Saving…";
  try {
    if (editing) await api(`/api/admin/work/${editing.id}`, { method: "PUT", body });
    else await api("/api/admin/work", { method: "POST", body });
    closeEditor(); toast("Project saved"); loadWork();
  } catch (err) { $("#work-msg").className = "msg err"; $("#work-msg").textContent = err.message; }
  finally { btn.disabled = false; }
};

/* ---------- site content ---------- */
const SCHEMA = [
  { group: "General: contact and social", fields: [
    { k: "email", l: "Email" }, { k: "phone", l: "Phone" }, { k: "whatsapp", l: "WhatsApp number (digits with country code, e.g. 201001234567)" },
    { k: "address", l: "Address" }, { k: "instagram", l: "Instagram link" }, { k: "behance", l: "Behance link" }, { k: "linkedin", l: "LinkedIn link" }, { k: "tiktok", l: "TikTok link" },
    { k: "copyright", l: "Footer text" }, { k: "tagline", l: "Tagline for search engines" },
    { k: "cta_title", l: "Bottom call to action (white)" }, { k: "cta_accent", l: "Bottom call to action (burgundy)" } ] },
  { group: "Home: hero", fields: [
    { k: "hero_label", l: "Small label" }, { k: "hero_line1", l: "Headline line 1" }, { k: "hero_line2", l: "Headline line 2 (white part)" }, { k: "hero_line2_accent", l: "Headline line 2 (burgundy part)" },
    { k: "hero_text", l: "Text under the headline", t: "textarea" }, { k: "hero_image", l: "Hero photo", t: "image" }, { k: "hero_strip", l: "Small strip text" },
    { k: "showreel", l: "Showreel video link (YouTube or Vimeo, empty hides the play button)" },
    { k: "tape", l: "Moving tape words", t: "list", add: "Add words", item: [{ k: "text", l: "Words" }] } ] },
  { group: "Home: sections", fields: [
    { k: "work_title", l: "Work title (white)" }, { k: "work_title_accent", l: "Work title (burgundy)" },
    { k: "statement_title", l: "Statement (white)" }, { k: "statement_accent", l: "Statement (burgundy)" }, { k: "statement_text", l: "Statement text", t: "textarea" },
    { k: "clients_title", l: "Clients title" },
    { k: "clients", l: "Client logos (the section shows once you add one)", t: "list", add: "Add logo", item: [{ k: "name", l: "Brand name" }, { k: "logo", l: "Logo", t: "image", logo: true }] } ] },
  { group: "Beliefs (Home and About)", fields: [{ k: "beliefs_label", l: "Small label" },
    { k: "beliefs", l: "Beliefs", t: "list", add: "Add belief", item: [{ k: "title", l: "White part" }, { k: "accent", l: "Burgundy part" }] }] },
  { group: "Services page", fields: [
    { k: "services_label", l: "Small label" }, { k: "services_title", l: "Title (white)" }, { k: "services_accent", l: "Title (burgundy)" }, { k: "services_intro", l: "Intro", t: "textarea" },
    { k: "services", l: "Services", t: "list", add: "Add service", item: [{ k: "title", l: "Name" }, { k: "text", l: "Text", t: "textarea" }, { k: "points", l: "What's included (one per line)", t: "textarea" }, { k: "image", l: "Photo", t: "image" }] },
    { k: "process_title", l: "Process title (white)" }, { k: "process_title_accent", l: "Process title (burgundy)" },
    { k: "process", l: "Process steps, in order", t: "list", add: "Add step", item: [{ k: "label", l: "Small label" }, { k: "title", l: "Title" }, { k: "text", l: "Text", t: "textarea" }] } ] },
  { group: "About page", fields: [
    { k: "about_label", l: "Small label" }, { k: "about_title", l: "Title (white)" }, { k: "about_accent", l: "Title (burgundy)" }, { k: "about_text", l: "Intro", t: "textarea" },
    { k: "about_image1", l: "Photo 1", t: "image" }, { k: "about_image2", l: "Photo 2", t: "image" },
    { k: "story_title", l: "Story title (white)" }, { k: "story_accent", l: "Story title (burgundy)" }, { k: "story_text", l: "Story", t: "textarea" },
    { k: "stats", l: "Numbers (e.g. 40+ brands)", t: "list", add: "Add number", item: [{ k: "value", l: "Number" }, { k: "label", l: "Label" }] },
    { k: "team_title", l: "Team title" },
    { k: "team", l: "Team (the section shows once you add someone)", t: "list", add: "Add person", item: [{ k: "name", l: "Name" }, { k: "role", l: "Role" }, { k: "photo", l: "Photo", t: "image" }] },
    { k: "about_statement", l: "Closing statement (white)" }, { k: "about_statement_accent", l: "Closing statement (burgundy)" } ] },
  { group: "Studio page", fields: [{ k: "studio_label", l: "Small label" }, { k: "studio_title", l: "Title (white)" }, { k: "studio_accent", l: "Title (burgundy)" }, { k: "studio_intro", l: "Intro", t: "textarea" }] },
  { group: "Contact page", fields: [{ k: "contact_label", l: "Small label" }, { k: "contact_title", l: "Title (white)" }, { k: "contact_accent", l: "Title (burgundy)" }, { k: "contact_text", l: "Text", t: "textarea" }] },
];
let settings = {};

function fieldHTML(f, value, path) {
  if (f.t === "textarea") return `<label>${esc(f.l)}<textarea rows="3" data-k="${path}">${esc(value || "")}</textarea></label>`;
  if (f.t === "image") return `<div class="field"><span class="flabel">${esc(f.l)}</span><div class="img-field" data-k="${path}" data-img="${esc(value || "")}" ${f.logo ? "data-logo" : ""}></div></div>`;
  return `<label>${esc(f.l)}<input data-k="${path}" value="${esc(value || "")}"></label>`;
}
function listHTML(f, items) {
  return `<div class="field"><span class="flabel">${esc(f.l)}</span><div class="sublist" data-list="${f.k}">${
    (items || []).map((it, i) => `<div class="subitem has-rm" data-i="${i}">${f.item.map(sf => fieldHTML(sf, it[sf.k], `${f.k}.${i}.${sf.k}`)).join("")}
      <button type="button" class="btn ghost small danger rm" data-rmitem="${f.k}.${i}">Remove</button></div>`).join("")
  }</div><button type="button" class="btn ghost small upload-btn" data-additem="${f.k}">${esc(f.add)}</button></div>`;
}
function drawSettings() {
  const form = $("#settings-form");
  form.innerHTML = SCHEMA.map(g => `<div class="group"><h3>${esc(g.group)}</h3>${g.fields.map(f => f.t === "list" ? listHTML(f, settings[f.k]) : fieldHTML(f, settings[f.k], f.k)).join("")}</div>`).join("");
  $$(".img-field[data-k]", form).forEach(el => imageField(el, el.dataset.img, { logo: el.hasAttribute("data-logo") }));
  $$("[data-additem]", form).forEach(b => b.onclick = () => { collectSettings(); (settings[b.dataset.additem] ||= []).push({}); drawSettings(); });
  $$("[data-rmitem]", form).forEach(b => b.onclick = () => { collectSettings(); const [k, i] = b.dataset.rmitem.split("."); settings[k].splice(Number(i), 1); drawSettings(); });
}
function collectSettings() {
  const out = { ...settings };
  SCHEMA.forEach(g => g.fields.forEach(f => { if (f.t === "list") out[f.k] = []; }));
  $$("#settings-form [data-k]").forEach(el => {
    const val = el.classList.contains("img-field") ? el.dataset.value || "" : el.value;
    const parts = el.dataset.k.split(".");
    if (parts.length === 1) out[parts[0]] = val;
    else { const [k, i, sk] = parts; (out[k][Number(i)] ||= {})[sk] = val; }
  });
  SCHEMA.forEach(g => g.fields.forEach(f => { if (f.t === "list") out[f.k] = out[f.k].filter(Boolean); }));
  settings = out;
  return out;
}
async function loadSettings() { settings = await api("/api/admin/settings"); drawSettings(); }
$("#save-settings").onclick = async () => {
  const btn = $("#save-settings"); btn.disabled = true;
  try { await api("/api/admin/settings", { method: "PUT", body: collectSettings() }); toast("Saved. The site is updated."); }
  catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
};

/* ---------- messages ---------- */
async function loadMessages() {
  const msgs = await api("/api/admin/messages");
  const unread = msgs.filter(m => !m.is_read).length;
  $("#unread").hidden = !unread; $("#unread").textContent = unread;
  const list = $("#msg-list");
  if (!msgs.length) { list.innerHTML = `<div class="empty">No messages yet. They'll show here when someone uses the contact form.</div>`; return; }
  list.innerHTML = msgs.map(m => {
    const c = m.contact || "", isMail = c.includes("@"), digits = c.replace(/[^\d+]/g, "");
    const reply = isMail ? `<a class="btn ghost small" href="mailto:${esc(c)}">Reply by email</a>` : (digits.length > 6 ? `<a class="btn ghost small" href="https://wa.me/${esc(digits.replace(/^\+/, "").replace(/^0/, "20"))}" target="_blank" rel="noopener">WhatsApp</a><a class="btn ghost small" href="tel:${esc(digits)}">Call</a>` : "");
    return `<div class="mitem${m.is_read ? "" : " unread"}">
      <div class="mhead"><div class="who">${m.is_read ? "" : '<span class="dot"></span>'}${esc(m.name)} <span>${m.brand ? "from " + esc(m.brand) : ""}</span></div><div class="when">${new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div></div>
      <div class="when">${esc(c)}</div><p>${esc(m.message)}</p>
      <div class="mfoot">${reply}${m.is_read ? "" : `<button class="btn ghost small" data-read="${m.id}">Mark as read</button>`}<button class="btn ghost small danger" data-mdel="${m.id}">Delete</button></div></div>`;
  }).join("");
  $$("[data-read]", list).forEach(b => b.onclick = async () => { await api(`/api/admin/messages/${b.dataset.read}`, { method: "PATCH" }); loadMessages(); });
  $$("[data-mdel]", list).forEach(b => b.onclick = async () => { if (!confirm("Delete this message?")) return; await api(`/api/admin/messages/${b.dataset.mdel}`, { method: "DELETE" }); loadMessages(); });
}

/* ---------- start ---------- */
api("/api/admin/me").then(showApp).catch(() => showLogin());
