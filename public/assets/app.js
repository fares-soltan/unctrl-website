// UNCTRL site: renders content/settings.json and content/work.json (edited from the control panel)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/></svg>';

// content comes from the backend; falls back to the starter JSON if the API is unavailable
async function getContent() {
  try {
    const r = await fetch("/api/content", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    const [settings, work] = await Promise.all([getJSON("/content/settings.json"), getJSON("/content/work.json")]);
    return { settings, work };
  }
}

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

// split "line one|line two" style titles into masked lines for the reveal animation
function lines(parts) {
  return parts.filter(p => p && p.text).map(p => `<span class="ln"><span${p.accent ? ' class="accent"' : ""}>${esc(p.text)}</span></span>`).join("");
}

function socials(s) {
  return [["Instagram", s.instagram], ["Behance", s.behance], ["LinkedIn", s.linkedin], ["TikTok", s.tiktok]]
    .filter(([, u]) => u).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join("");
}

function fillFooter(s) {
  const f = $("#foot-copy"); if (f) f.textContent = s.copyright || "";
  const n = $("#foot-social"); if (n) n.innerHTML = socials(s);
}

/* ---------- shared effects ---------- */
function effects() {
  requestAnimationFrame(() => document.body.classList.add("loaded"));

  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .15 });
  $$(".reveal,.fade,.card,.step").forEach(el => { if (el.matches(".card,.step")) el.classList.add("fade"); io.observe(el); });

  // header hides on scroll down, shows on scroll up
  const head = $(".site-head"); let last = 0;
  addEventListener("scroll", () => { const y = scrollY; head.classList.toggle("hide", y > 200 && y > last); last = y; }, { passive: true });

  // statement text fills as it scrolls through the viewport
  const fills = $$(".fill");
  if (fills.length) {
    const upd = () => fills.forEach(el => {
      const r = el.getBoundingClientRect(), vh = innerHeight;
      const p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (vh * .55)));
      el.style.setProperty("--p", (p * 100).toFixed(1) + "%");
    });
    if (reduce) fills.forEach(el => el.style.setProperty("--p", "100%")); else { addEventListener("scroll", upd, { passive: true }); upd(); }
  }

  // card spotlight follows the pointer
  document.addEventListener("pointermove", e => {
    const c = e.target.closest && e.target.closest(".card"); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });

  // custom cursor
  const cur = $(".cursor");
  if (cur && finePointer && !reduce) {
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; }, { passive: true });
    (function loop() { cx += (x - cx) * .2; cy += (y - cy) * .2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
    document.addEventListener("pointerover", e => {
      const t = e.target;
      cur.classList.toggle("view", !!t.closest(".card"));
      cur.classList.toggle("link", !t.closest(".card") && !!t.closest("a,button,input,textarea"));
    });
    document.documentElement.style.cursor = "none";
    const st = document.createElement("style"); st.textContent = "a,button,.card{cursor:none}"; document.head.appendChild(st);
  } else if (cur) cur.remove();

  // magnetic buttons
  if (finePointer && !reduce) $$(".btn,.play .ring").forEach(b => {
    b.addEventListener("pointermove", e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .2}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener("pointerleave", () => b.style.transform = "");
  });

  // hero slash drifts with the pointer
  const sl = $$(".hero-slash");
  if (sl.length && finePointer && !reduce) $(".hero-card").addEventListener("pointermove", e => {
    const k = (e.clientX / innerWidth - .5);
    sl.forEach((s, i) => s.style.setProperty("--sx", `${k * (i ? 40 : -25)}px`));
  });
}

/* ---------- home ---------- */
const VARIANTS = ["v-dark", "v-light", "v-burgundy", "v-dark"];

function card(p, i) {
  const href = `project.html?p=${encodeURIComponent(p.slug)}`;
  const tall = p.size === "tall" ? "tall" : "";
  const client = `<span class="client">${esc(p.client || "Client")}</span>`;
  const meta = `<div class="meta"><h3>${esc(p.title)}</h3><span class="go">${ARROW}</span></div>`;
  if (p.cover) return `<a class="card v-photo ${tall}" href="${href}" data-cat="${esc(p.category)}"><img class="cover" src="${esc(p.cover)}" alt="" loading="lazy">${client}${meta}</a>`;
  if (tall) return `<a class="card ${tall}" href="${href}" data-cat="${esc(p.category)}"><span class="tall-art" aria-hidden="true"></span>${p.video ? '<span class="reel"><i></i>Reel</span>' : ""}${client}${meta}</a>`;
  const v = p.style && p.style !== "Auto" ? "v-" + p.style.toLowerCase() : VARIANTS[i % VARIANTS.length];
  const slash = v === "v-dark" ? '<span class="cslash" aria-hidden="true"></span>' : "";
  return `<a class="card ${v}" href="${href}" data-cat="${esc(p.category)}">${slash}${client}${meta}</a>`;
}

function tape(words, el) {
  const unit = (words || []).map(w => `<span>${esc(w)} ${STAR}</span>`).join("");
  el.innerHTML = (unit.repeat(3)).repeat(2);
}

async function initHome() {
  const { settings: s, work } = await getContent();
  fillFooter(s);

  // hero
  if (s.hero_image) {
    const ph = document.createElement("div");
    ph.className = "hero-photo"; ph.style.backgroundImage = `url("${s.hero_image}")`;
    $(".hero-card").prepend(ph);
  }
  $("#tagline-sr").textContent = s.tagline || "";
  if (s.hero_kicker) $("#kicker-text").textContent = s.hero_kicker; else $("#kicker").remove();
  $("#hero-line").textContent = s.hero_text || "";
  const modal = $("#modal"), frame = $("#modal .frame");
  if (s.showreel) {
    $("#play").hidden = false;
    $("#play").onclick = () => { frame.innerHTML = videoEmbed(s.showreel, true); modal.classList.add("open"); $("#modal .close").focus(); };
  }
  const closeModal = () => { modal.classList.remove("open"); frame.innerHTML = ""; };
  $("#modal .close").onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  // tapes
  const words = (s.tape || []).map(t => typeof t === "string" ? t : t.text).filter(Boolean);
  tape(words.length ? words : ["Ideas without limits"], $("#tape1"));
  tape([...(words.length ? words : ["Ideas without limits"])].reverse(), $("#tape2"));

  // work
  $("#work-title").innerHTML = lines([{ text: s.work_title }, { text: s.work_title_accent, accent: true }]);
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
  } else fb.remove();

  // statement
  $("#statement-label").textContent = s.statement_label || "";
  $("#statement").innerHTML = `<span class="fill">${esc(s.statement || "")}</span><br><span class="fill accent">${esc(s.statement_accent || "")}</span>`;

  // process
  $("#process-title").innerHTML = lines([{ text: s.process_title }, { text: s.process_title_accent, accent: true }]);
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
  $("#contact-title").innerHTML = lines([{ text: s.contact_title }, { text: s.contact_title_accent, accent: true }]);
  $("#contact-text").textContent = s.contact_text || "";
  const direct = [];
  if (s.email) direct.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (s.phone) direct.push(`<a href="tel:${esc(s.phone.replace(/\s/g, ""))}">${esc(s.phone)}</a>`);
  if (s.whatsapp) direct.push(`<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`);
  $("#direct").innerHTML = direct.join("");
  initForm(s);
  effects();
}

function initForm(s) {
  const form = $("#cform"), msg = $("#form-msg");
  form.onsubmit = async e => {
    e.preventDefault();
    msg.className = "form-msg"; msg.textContent = "";
    const d = Object.fromEntries(new FormData(form));
    if (!d.name || !d.contact || !d.message) { msg.className = "form-msg err"; msg.textContent = "Add your name, a way to reach you and what you need."; return; }
    const btn = form.querySelector("button"); btn.disabled = true; btn.textContent = "Sending";
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't send.");
      form.reset(); msg.textContent = "Sent. We'll get back to you within one working day.";
    } catch (err) {
      msg.className = "form-msg err";
      msg.textContent = (err.message && err.message !== "Failed to fetch" ? err.message + " " : "") + (s.email ? "You can also email us at " + s.email + "." : "");
    } finally { btn.disabled = false; btn.textContent = "Send"; }
  };
}

/* ---------- project page ---------- */
async function initProject() {
  const { settings: s, work } = await getContent();
  fillFooter(s);
  const slug = new URLSearchParams(location.search).get("p");
  const i = Math.max(0, work.findIndex(w => w.slug === slug));
  const p = work[i];
  const root = $("#project");
  if (!p) { root.innerHTML = `<div class="wrap p-head"><a class="back" href="/#work">Back to work</a><h1 class="display">Project not found</h1></div>`; effects(); return; }
  document.title = `${p.title} | ${p.client} | UNCTRL`;
  const next = work[(i + 1) % work.length];
  const media = [
    p.video ? `<div class="p-video fade">${videoEmbed(p.video)}</div>` : "",
    p.cover ? `<div class="p-cover fade"><img src="${esc(p.cover)}" alt="${esc(p.title)}"></div>` : ""
  ].join("");
  const gallery = (p.gallery || []).filter(Boolean);
  root.innerHTML = `
  <div class="wrap p-head">
    <a class="back" href="/#work">Back to work</a>
    <h1 class="display reveal">${lines([{ text: p.title }])}</h1>
    <div class="p-meta fade">
      <div><span class="label">Client</span><span>${esc(p.client)}</span></div>
      <div><span class="label">Service</span><span>${esc(p.category)}</span></div>
      ${p.year ? `<div><span class="label">Year</span><span>${esc(p.year)}</span></div>` : ""}
    </div>
  </div>
  <div class="wrap">
    <div class="p-body fade"><p class="p-sum">${esc(p.summary || "")}</p><p>${esc(p.description || "")}</p></div>
    ${media}
    ${gallery.length ? `<div class="p-gallery">${gallery.map(g => `<img class="fade" src="${esc(g)}" alt="" loading="lazy">`).join("")}</div>` : ""}
  </div>
  ${work.length > 1 ? `<div class="wrap p-next"><a href="project.html?p=${encodeURIComponent(next.slug)}"><span class="label">Next project</span><span class="display">${esc(next.title)}</span></a></div>` : ""}`;
  effects();
}

(document.body.dataset.page === "project" ? initProject : initHome)().catch(err => console.error(err));
