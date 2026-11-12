// UNCTRL site: renders content/settings.json and content/work.json (edited from the control panel)
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path + " " + res.status);
  return res.json();
}

function videoEmbed(url, autoplay = false) {
  if (!url) return "";
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0${autoplay ? "&autoplay=1" : ""}" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}${autoplay ? "?autoplay=1" : ""}" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  return `<video src="${esc(url)}" controls playsinline ${autoplay ? "autoplay" : ""}></video>`;
}

function socials(s) {
  return [["Instagram", s.instagram], ["Behance", s.behance], ["LinkedIn", s.linkedin], ["TikTok", s.tiktok]]
    .filter(([, u]) => u).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join("");
}

function fillFooter(s) {
  const f = $("#foot-copy"); if (f) f.textContent = s.copyright || "";
  const n = $("#foot-social"); if (n) n.innerHTML = socials(s);
}

/* ---------- home ---------- */
const VARIANTS = ["v-dark", "v-light", "v-burgundy", "v-dark"];

function card(p, i) {
  const href = `project.html?p=${encodeURIComponent(p.slug)}`;
  const size = p.size === "tall" ? "tall" : "";
  const client = `<span class="client">[${esc(p.client || "Client")}]</span>`;
  if (p.cover) {
    return `<a class="card v-photo ${size}" href="${href}" data-cat="${esc(p.category)}">
      <img class="cover" src="${esc(p.cover)}" alt="" loading="lazy">
      <div class="meta">${client}<h3>${esc(p.title)}</h3></div></a>`;
  }
  if (size === "tall") {
    return `<a class="card ${size}" href="${href}" data-cat="${esc(p.category)}">
      <span class="tall-art" aria-hidden="true"></span>${p.video ? '<span class="reel-tag">Reel</span>' : ""}
      <span></span><div class="meta">${client}<h3>${esc(p.title)}</h3></div></a>`;
  }
  const v = p.style && p.style !== "Auto" ? "v-" + p.style.toLowerCase() : VARIANTS[i % VARIANTS.length];
  const slash = v === "v-dark" ? '<span class="cslash" aria-hidden="true"></span>' : "";
  return `<a class="card ${v} ${size}" href="${href}" data-cat="${esc(p.category)}">${slash}${client}<div class="meta"><h3>${esc(p.title)}</h3></div></a>`;
}

async function initHome() {
  const [s, work] = await Promise.all([getJSON("content/settings.json"), getJSON("content/work.json")]);
  fillFooter(s);

  // hero
  if (s.hero_image) {
    const ph = document.createElement("div");
    ph.className = "hero-photo"; ph.style.backgroundImage = `url("${s.hero_image}")`;
    $(".hero-card").prepend(ph);
  }
  $("#tagline-sr").textContent = s.tagline || "";
  const modal = $("#modal"), frame = $("#modal .frame");
  if (s.showreel) {
    $("#hero-actions").hidden = false;
    $("#play").onclick = () => { frame.innerHTML = videoEmbed(s.showreel, true); modal.classList.add("open"); $("#modal .close").focus(); };
  }
  const closeModal = () => { modal.classList.remove("open"); frame.innerHTML = ""; };
  $("#modal .close").onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // marquee
  const word = esc(s.marquee || "Ideas without limits");
  const unit = `<span>${word} <b>/</b></span>`;
  $("#marquee").innerHTML = unit.repeat(4) + unit.repeat(4);

  // work
  $("#work-title").innerHTML = `${esc(s.work_title)}<br><span class="accent">${esc(s.work_title_accent)}</span>`;
  const grid = $("#work-grid");
  grid.innerHTML = work.length ? work.map(card).join("") : `<p class="empty">No projects yet. Add your first one from the control panel.</p>`;
  const cats = [...new Set(work.map(w => w.category).filter(Boolean))];
  const fb = $("#filters");
  if (cats.length > 1) {
    fb.innerHTML = ["All", ...cats].map((c, i) => `<button type="button" aria-pressed="${i === 0}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
    fb.querySelectorAll("button").forEach(b => b.onclick = () => {
      fb.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
      grid.querySelectorAll(".card").forEach(c => c.style.display = (b.dataset.c === "All" || c.dataset.cat === b.dataset.c) ? "" : "none");
    });
  }

  // process
  $("#steps").innerHTML = (s.process || []).map((p, i) => `<div class="step"><div class="num">${String(i + 1).padStart(2, "0")}</div>
    <span class="label">${esc(p.label)}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`).join("");

  // clients (hidden until logos are added)
  const logos = (s.clients || []).filter(c => c.logo);
  if (logos.length) {
    $("#clients").hidden = false;
    $("#clients-title").textContent = s.clients_title || "";
    $("#logos").innerHTML = logos.map(c => `<div><img src="${esc(c.logo)}" alt="${esc(c.name || "")}" loading="lazy"></div>`).join("");
  }

  // contact
  $("#contact-title").innerHTML = `${esc(s.contact_title)}<br><span class="accent">${esc(s.contact_title_accent)}</span>`;
  $("#contact-text").textContent = s.contact_text || "";
  const direct = [];
  if (s.email) direct.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (s.phone) direct.push(`<a href="tel:${esc(s.phone.replace(/\s/g, ""))}">${esc(s.phone)}</a>`);
  if (s.whatsapp) direct.push(`<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`);
  $("#direct").innerHTML = direct.join("");
  initForm(s);
}

function initForm(s) {
  const form = $("#cform"), msg = $("#form-msg");
  form.onsubmit = async e => {
    e.preventDefault();
    msg.className = "form-msg"; msg.textContent = "";
    const d = Object.fromEntries(new FormData(form));
    if (!d.name || !d.contact || !d.message) { msg.className = "form-msg err"; msg.textContent = "Add your name, a way to reach you and what you need."; return; }
    const text = `New enquiry from the website\nName: ${d.name}\nBrand: ${d.brand || "-"}\nContact: ${d.contact}\n\n${d.message}`;
    if (s.form_key) {
      const btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Sending";
      try {
        const r = await fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ access_key: s.form_key, subject: `Website enquiry: ${d.brand || d.name}`, from_name: "UNCTRL website", name: d.name, brand: d.brand, contact: d.contact, message: d.message }) });
        const j = await r.json();
        if (!j.success) throw new Error(j.message);
        form.reset(); msg.textContent = "Sent. We'll get back to you within one working day.";
      } catch (err) {
        msg.className = "form-msg err"; msg.textContent = "Couldn't send. Email us directly at " + (s.email || "") + ".";
      } finally { btn.disabled = false; btn.textContent = "Send"; }
      return;
    }
    if (s.whatsapp) { window.open(`https://wa.me/${s.whatsapp}?text=${encodeURIComponent(text)}`, "_blank"); return; }
    location.href = `mailto:${s.email}?subject=${encodeURIComponent("Website enquiry: " + (d.brand || d.name))}&body=${encodeURIComponent(text)}`;
  };
}

/* ---------- project page ---------- */
async function initProject() {
  const [s, work] = await Promise.all([getJSON("content/settings.json"), getJSON("content/work.json")]);
  fillFooter(s);
  const slug = new URLSearchParams(location.search).get("p");
  const i = Math.max(0, work.findIndex(w => w.slug === slug));
  const p = work[i];
  const root = $("#project");
  if (!p) { root.innerHTML = `<div class="wrap p-head"><a class="back" href="index.html#work">Back to work</a><h1 class="display">Project not found</h1></div>`; return; }
  document.title = `${p.title} | ${p.client} | UNCTRL`;
  const next = work[(i + 1) % work.length];
  const media = [
    p.video ? `<div class="p-video">${videoEmbed(p.video)}</div>` : "",
    p.cover ? `<div class="p-cover"><img src="${esc(p.cover)}" alt="${esc(p.title)}"></div>` : ""
  ].join("");
  const gallery = (p.gallery || []).filter(Boolean);
  root.innerHTML = `
  <div class="wrap p-head">
    <a class="back" href="index.html#work">Back to work</a>
    <h1 class="display">${esc(p.title)}</h1>
    <div class="p-meta">
      <div><span class="label">Client</span><span>${esc(p.client)}</span></div>
      <div><span class="label">Service</span><span>${esc(p.category)}</span></div>
      ${p.year ? `<div><span class="label">Year</span><span>${esc(p.year)}</span></div>` : ""}
    </div>
  </div>
  <div class="wrap">
    <div class="p-body"><p class="p-sum">${esc(p.summary || "")}</p><p>${esc(p.description || "")}</p></div>
    ${media}
    ${gallery.length ? `<div class="p-gallery">${gallery.map(g => `<img src="${esc(g)}" alt="" loading="lazy">`).join("")}</div>` : ""}
  </div>
  ${work.length > 1 ? `<div class="wrap p-next"><a href="project.html?p=${encodeURIComponent(next.slug)}"><span class="label">Next project</span><span class="display">${esc(next.title)}</span></a></div>` : ""}`;
}

(document.body.dataset.page === "project" ? initProject : initHome)().catch(err => {
  console.error(err);
});
