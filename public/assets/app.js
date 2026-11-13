// UNCTRL site: every page renders its content from /api/content (managed in /admin)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/></svg>';
const pad = i => String(i + 1).padStart(2, "0");
const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; return el; };
const text = (sel, t) => { const el = $(sel); if (el) el.textContent = t || ""; return el; };

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path + " " + res.status);
  return res.json();
}
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

function videoEmbed(url, autoplay = false) {
  if (!url) return "";
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0${autoplay ? "&autoplay=1" : ""}" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}${autoplay ? "?autoplay=1" : ""}" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  return `<video src="${esc(url)}" controls playsinline ${autoplay ? "autoplay" : ""}></video>`;
}

// masked lines for the reveal animation
function lines(parts) {
  return parts.filter(p => p && p.text).map(p => `<span class="ln"><span${p.accent ? ' class="accent"' : ""}>${p.html || esc(p.text)}</span></span>`).join("");
}
const title2 = (a, b) => lines([{ text: a }, { text: b, accent: true }]);

function socials(s) {
  return [["Instagram", s.instagram], ["Behance", s.behance], ["LinkedIn", s.linkedin], ["TikTok", s.tiktok]]
    .filter(([, u]) => u).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join("");
}
function contactLinks(s) {
  return [
    s.email && `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`,
    s.phone && `<a href="tel:${esc(s.phone.replace(/\s/g, ""))}">${esc(s.phone)}</a>`,
    s.whatsapp && `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`,
  ].filter(Boolean).join("");
}

/* ---------- shared: footer, CTA, modal, menu ---------- */
function shared(s) {
  text("#foot-copy", s.copyright); text("#foot-address", s.address);
  set("#foot-social", socials(s)); set("#foot-contact", contactLinks(s));
  set("#cta-title", title2(s.cta_title, s.cta_accent));
  const mail = $("#cta-mail"); if (mail && s.email) { mail.href = "mailto:" + s.email; mail.textContent = s.email; }

  const modal = $("#modal"), frame = $("#modal .frame");
  window.openVideo = url => { frame.innerHTML = videoEmbed(url, true); modal.classList.add("open"); $("#modal .close").focus(); };
  const closeModal = () => { modal.classList.remove("open"); frame.innerHTML = ""; };
  $("#modal .close").onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };

  const btn = $(".menu-btn"), menu = $("#mnav");
  const toggle = open => { menu.hidden = !open; btn.setAttribute("aria-expanded", open); document.body.style.overflow = open ? "hidden" : ""; };
  btn.onclick = () => toggle(menu.hidden);
  $$("a", menu).forEach(a => a.addEventListener("click", () => toggle(false)));
  addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); toggle(false); } });
}

function beliefs(s) {
  text("#beliefs-label", s.beliefs_label);
  set("#beliefs", (s.beliefs || []).map(b => `<div class="belief"><h3>${esc(b.title)}<br><span class="accent">${esc(b.accent)}</span></h3><img src="/assets/brand/unctrl-logo-white.svg" alt=""></div>`).join(""));
}

/* ---------- effects ---------- */
function effects() {
  requestAnimationFrame(() => document.body.classList.add("loaded"));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  $$(".reveal,.fade,.card,.step,.svc-card,.belief,.svc-row,.wrow,.stat,.member").forEach(el => { if (!el.matches(".reveal,.fade")) el.classList.add("fade"); io.observe(el); });

  const head = $(".site-head"); let last = 0;
  addEventListener("scroll", () => { const y = scrollY; head.classList.toggle("hide", y > 200 && y > last && $("#mnav").hidden); last = y; }, { passive: true });

  const fills = $$(".fill");
  if (fills.length) {
    const upd = () => fills.forEach(el => {
      const r = el.getBoundingClientRect(), vh = innerHeight;
      el.style.setProperty("--p", (Math.min(1, Math.max(0, (vh * .85 - r.top) / (vh * .55))) * 100).toFixed(1) + "%");
    });
    if (reduce) fills.forEach(el => el.style.setProperty("--p", "100%")); else { addEventListener("scroll", upd, { passive: true }); upd(); }
  }

  document.addEventListener("pointermove", e => {
    const c = e.target.closest && e.target.closest(".card"); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });

  const cur = $(".cursor");
  if (cur && finePointer && !reduce) {
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; }, { passive: true });
    (function loop() { cx += (x - cx) * .2; cy += (y - cy) * .2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
    document.addEventListener("pointerover", e => {
      const t = e.target;
      cur.classList.toggle("view", !!t.closest(".card,.wrow"));
      cur.classList.toggle("link", !t.closest(".card,.wrow") && !!t.closest("a,button,input,textarea"));
    });
    document.documentElement.style.cursor = "none";
    const st = document.createElement("style"); st.textContent = "a,button,.card{cursor:none}"; document.head.appendChild(st);
  } else if (cur) cur.remove();

  if (finePointer && !reduce) $$(".btn,.play .ring").forEach(b => {
    b.addEventListener("pointermove", e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .2}px,${(e.clientY - r.top - r.height / 2) * .3}px)`; });
    b.addEventListener("pointerleave", () => b.style.transform = "");
  });

  const sl = $(".hero2-slash");
  if (sl && finePointer && !reduce) $(".hero2").addEventListener("pointermove", e => sl.style.setProperty("--sx", `${(e.clientX / innerWidth - .5) * -40}px`));
}

/* ---------- cards (studio grid) ---------- */
const VARIANTS = ["v-dark", "v-light", "v-burgundy", "v-dark"];
function card(p, i) {
  const href = `/project?p=${encodeURIComponent(p.slug)}`;
  const tall = p.size === "tall" ? "tall" : "";
  const client = `<span class="client">${esc(p.client || "Client")}</span>`;
  const reel = p.video ? '<span class="reel"><i></i>Video</span>' : "";
  const meta = `<div class="meta"><h3>${esc(p.title)}</h3><span class="go">${ARROW}</span></div>`;
  if (p.cover) return `<a class="card v-photo ${tall}" href="${href}" data-cat="${esc(p.category)}"><img class="cover" src="${esc(p.cover)}" alt="" loading="lazy">${reel}${client}${meta}</a>`;
  if (tall) return `<a class="card ${tall}" href="${href}" data-cat="${esc(p.category)}"><span class="tall-art" aria-hidden="true"></span>${reel}${client}${meta}</a>`;
  const v = p.style && p.style !== "Auto" ? "v-" + p.style.toLowerCase() : VARIANTS[i % VARIANTS.length];
  const slash = v === "v-dark" ? '<span class="cslash" aria-hidden="true"></span>' : "";
  return `<a class="card ${v}" href="${href}" data-cat="${esc(p.category)}">${slash}${reel}${client}${meta}</a>`;
}
function tape(words, el) { if (el) el.innerHTML = (words.map(w => `<span>${esc(w)} ${STAR}</span>`).join("").repeat(3)).repeat(2); }

/* ---------- pages ---------- */
const PAGES = {
  home(s, work) {
    if (s.hero_image) { const img = $("#hero-img"); img.src = s.hero_image; } else $("#hero-media").remove();
    text("#hero-label", s.hero_label);
    set("#hero-title", lines([{ text: s.hero_line1 }, { text: s.hero_line2, html: `${esc(s.hero_line2)} <span class="accent">${esc(s.hero_line2_accent)}</span>` }]));
    text("#hero-text", s.hero_text); text("#hero-strip", s.hero_strip);
    if (s.showreel) { $("#play").hidden = false; $("#play").onclick = () => openVideo(s.showreel); }

    const words = (s.tape || []).map(t => typeof t === "string" ? t : t.text).filter(Boolean);
    if (words.length) { tape(words, $("#tape1")); tape([...words].reverse(), $("#tape2")); } else $(".tapes").remove();

    set("#work-title", title2(s.work_title, s.work_title_accent));
    const featured = work.filter(w => w.featured);
    const list = (featured.length ? featured : work).slice(0, 6);
    set("#work-rows", list.length ? list.map(p => `<a class="wrow" href="/project?p=${encodeURIComponent(p.slug)}" data-img="${esc(p.cover || "")}">
      <h3>${esc(p.client || p.title)}</h3><span class="svc">${esc([p.title, p.category].filter(Boolean).join(" / "))}</span><span class="yr">${esc(p.year || "")}</span><span class="go">${ARROW}</span></a>`).join("")
      : `<p class="empty">No projects yet. Add them from the admin panel.</p>`);
    const prev = $("#row-preview");
    if (finePointer) $$(".wrow").forEach(r => {
      r.addEventListener("pointerenter", () => { if (r.dataset.img) { prev.src = r.dataset.img; prev.classList.add("on"); } });
      r.addEventListener("pointerleave", () => prev.classList.remove("on"));
      r.addEventListener("pointermove", e => { prev.style.left = e.clientX + "px"; prev.style.top = e.clientY + "px"; });
    });

    set("#statement-title", title2(s.statement_title, s.statement_accent));
    text("#statement-text", s.statement_text);
    text("#svc-label", s.services_label);
    set("#svc-title", title2(s.services_title, s.services_accent));
    set("#svc-grid", (s.services || []).map((v, i) => `<a class="svc-card" href="/services#s${i + 1}">${v.image ? `<img src="${esc(v.image)}" alt="" loading="lazy">` : ""}<span class="num">${pad(i)}</span><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p></a>`).join(""));
    beliefs(s);
    const logos = (s.clients || []).filter(c => c.logo);
    if (logos.length) {
      $("#clients").hidden = false; text("#clients-title", s.clients_title);
      set("#logos", logos.map(c => `<div><img src="${esc(c.logo)}" alt="${esc(c.name || "")}" loading="lazy"></div>`).join(""));
    }
  },

  services(s) {
    text("#services-label", s.services_label);
    set("#services-title", title2(s.services_title, s.services_accent));
    text("#services-intro", s.services_intro);
    set("#svc-list", (s.services || []).map((v, i) => `<article class="svc-row" id="s${i + 1}">
      <span class="num">${pad(i)}</span>
      <div><h2 class="display">${esc(v.title)}</h2><p class="txt">${esc(v.text)}</p>
        ${v.points ? `<ul>${String(v.points).split("\n").map(p => p.trim()).filter(Boolean).map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div>
      ${v.image ? `<div class="pic"><img src="${esc(v.image)}" alt="" loading="lazy"></div>` : "<div></div>"}
    </article>`).join(""));
    set("#process-title", title2(s.process_title, s.process_title_accent));
    set("#steps", (s.process || []).map((p, i) => `<div class="step"><div class="num">${pad(i)}</div><span class="label">${esc(p.label)}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`).join(""));
  },

  about(s) {
    text("#about-label", s.about_label);
    set("#about-title", title2(s.about_title, s.about_accent));
    text("#about-text", s.about_text);
    set("#collage", [s.about_image1, s.about_image2].filter(Boolean).map(u => `<img src="${esc(u)}" alt="" loading="lazy">`).join(""));
    set("#story-title", title2(s.story_title, s.story_accent));
    text("#story-text", s.story_text);
    const stats = (s.stats || []).filter(x => x.value);
    if (stats.length) { $("#stats").hidden = false; set("#stats", stats.map(x => `<div class="stat"><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join("")); }
    beliefs(s);
    const team = (s.team || []).filter(m => m.name);
    if (team.length) {
      $("#team-sec").hidden = false; set("#team-title", lines([{ text: s.team_title }]));
      set("#team", team.map(m => `<div class="member"><div class="ph">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">` : ""}</div><b>${esc(m.name)}</b><span>${esc(m.role || "")}</span></div>`).join(""));
    }
    set("#statement", `<span class="fill">${esc(s.about_statement)}</span><br><span class="fill accent">${esc(s.about_statement_accent)}</span>`);
  },

  studio(s, work) {
    text("#studio-label", s.studio_label);
    set("#studio-title", title2(s.studio_title, s.studio_accent));
    text("#studio-intro", s.studio_intro);
    const grid = $("#work-grid");
    grid.innerHTML = work.length ? work.map(card).join("") : `<p class="empty">No projects yet. Add your first one from the admin panel.</p>`;
    const cats = [...new Set(work.map(w => w.category).filter(Boolean))];
    const fb = $("#filters");
    if (cats.length > 1) {
      fb.innerHTML = ["All", ...cats].map((c, i) => `<button type="button" aria-pressed="${i === 0}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
      $$("button", fb).forEach(b => b.onclick = () => {
        $$("button", fb).forEach(x => x.setAttribute("aria-pressed", x === b));
        $$(".card", grid).forEach(c => c.style.display = (b.dataset.c === "All" || c.dataset.cat === b.dataset.c) ? "" : "none");
      });
    } else fb.remove();
  },

  contact(s) {
    text("#contact-label", s.contact_label);
    set("#contact-title", title2(s.contact_title, s.contact_accent));
    text("#contact-text", s.contact_text);
    set("#direct", contactLinks(s) + (s.address ? `<span class="addr">${esc(s.address)}</span>` : ""));
    set("#contact-social", socials(s));
    initForm(s);
  },

  project(s, work) {
    const slug = new URLSearchParams(location.search).get("p");
    const i = Math.max(0, work.findIndex(w => w.slug === slug));
    const p = work[i], root = $("#project");
    if (!p) { root.innerHTML = `<div class="wrap p-head"><a class="back" href="/studio">Back to studio</a><h1 class="display">Project not found</h1></div>`; return; }
    document.title = `${p.title} | ${p.client} | UNCTRL`;
    const next = work[(i + 1) % work.length];
    const gallery = (p.gallery || []).filter(Boolean);
    root.innerHTML = `
    <div class="wrap p-head">
      <a class="back" href="/studio">Back to studio</a>
      <h1 class="display reveal">${lines([{ text: p.title }])}</h1>
      <div class="p-meta fade">
        <div><span class="label">Client</span><span>${esc(p.client)}</span></div>
        <div><span class="label">Service</span><span>${esc(p.category)}</span></div>
        ${p.year ? `<div><span class="label">Year</span><span>${esc(p.year)}</span></div>` : ""}
      </div>
    </div>
    <div class="wrap">
      <div class="p-body fade"><p class="p-sum">${esc(p.summary || "")}</p><p>${esc(p.description || "")}</p></div>
      ${p.video ? `<div class="p-video fade">${videoEmbed(p.video)}</div>` : ""}
      ${p.cover ? `<div class="p-cover fade"><img src="${esc(p.cover)}" alt="${esc(p.title)}"></div>` : ""}
      ${gallery.length ? `<div class="p-gallery">${gallery.map(g => `<img class="fade" src="${esc(g)}" alt="" loading="lazy">`).join("")}</div>` : ""}
    </div>
    ${work.length > 1 ? `<div class="wrap p-next"><a href="/project?p=${encodeURIComponent(next.slug)}"><span class="label">Next project</span><span class="display">${esc(next.title)}</span></a></div>` : ""}`;
  },
};

function initForm(s) {
  const form = $("#cform"), msg = $("#form-msg");
  if (!form) return;
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

(async () => {
  const { settings: s, work } = await getContent();
  shared(s);
  const page = document.body.dataset.page;
  if (PAGES[page]) PAGES[page](s, work);
  effects();
})().catch(err => console.error(err));
