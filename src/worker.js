// UNCTRL website backend (Cloudflare Worker)
// - Static site is served from ./public through the ASSETS binding
// - Content (settings, portfolio, contact messages) lives in D1 (binding: DB)
// - Uploaded images live in KV (binding: MEDIA) and are served from /media/<key>
// - Admin login uses the ADMIN_PASSWORD secret

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const bad = (msg, status = 400) => json({ error: msg }, status);

const COOKIE = "unctrl_admin";
const SESSION_DAYS = 7;
const MAX_UPLOAD = 8 * 1024 * 1024; // 8 MB per image
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif"];

/* ---------- database ---------- */
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS work (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, position INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, updated_at TEXT)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, brand TEXT, contact TEXT, message TEXT, created_at TEXT, is_read INTEGER DEFAULT 0)"),
  ]);
  schemaReady = true;
}

// Starter content lives in public/content/*.json.
// SEED_VERSION bumps when the site structure changes; older databases are migrated without touching real projects.
const SEED_VERSION = "2";
const SAMPLE_SLUGS = ["brand-identity", "social-media-reel", "content-production", "campaign", "rebrand-launch"];
const CARRY_OVER = ["email", "phone", "whatsapp", "address", "instagram", "behance", "linkedin", "tiktok", "copyright", "showreel", "clients", "tape", "process", "process_title", "process_title_accent"];
let defaultsCache = null;
async function starter(env, request) {
  if (defaultsCache) return defaultsCache;
  const origin = new URL(request.url).origin;
  const [settings, work] = await Promise.all([
    env.ASSETS.fetch(new Request(origin + "/content/settings.json")).then(r => r.json()),
    env.ASSETS.fetch(new Request(origin + "/content/work.json")).then(r => r.json()),
  ]);
  return (defaultsCache = { settings, work });
}

async function ensureSeed(env, request) {
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = 'seeded'").first();
  const version = row ? row.value : null;
  if (version === SEED_VERSION) return;
  const { settings, work } = await starter(env, request);
  const now = new Date().toISOString();
  const stmts = [];
  if (!version) {
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('settings', ?)").bind(JSON.stringify(settings)));
    work.forEach((w, i) => stmts.push(env.DB.prepare("INSERT OR IGNORE INTO work (slug, position, data, updated_at) VALUES (?, ?, ?, ?)").bind(w.slug, i, JSON.stringify(w), now)));
  } else {
    // migrate: keep contact details, socials and lists the client may have edited; take the new page content
    const old = await env.DB.prepare("SELECT value FROM kv WHERE key = 'settings'").first();
    const prev = old ? JSON.parse(old.value) : {};
    const next = { ...settings };
    CARRY_OVER.forEach(k => { if (prev[k] !== undefined && prev[k] !== "" && !(Array.isArray(prev[k]) && !prev[k].length)) next[k] = prev[k]; });
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('settings', ?)").bind(JSON.stringify(next)));
    work.filter(w => SAMPLE_SLUGS.includes(w.slug)).forEach(w =>
      stmts.push(env.DB.prepare("UPDATE work SET data = ?, updated_at = ? WHERE slug = ?").bind(JSON.stringify(w), now, w.slug)));
  }
  stmts.push(env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('seeded', ?)").bind(SEED_VERSION));
  await env.DB.batch(stmts);
}

// stored settings on top of the starter defaults, so new fields always have a value
async function getSettings(env, request) {
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = 'settings'").first();
  const { settings: defaults } = await starter(env, request);
  return { ...defaults, ...(row ? JSON.parse(row.value) : {}) };
}
async function getWork(env) {
  const { results } = await env.DB.prepare("SELECT id, slug, data FROM work ORDER BY position ASC, id ASC").all();
  return results.map(r => ({ ...JSON.parse(r.data), id: r.id, slug: r.slug }));
}

/* ---------- auth ---------- */
const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmacKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("unctrl-session:" + env.ADMIN_PASSWORD));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(env) {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(exp));
  return exp + "." + b64url(sig);
}
async function validToken(env, token) {
  if (!token || !env.ADMIN_PASSWORD) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expect = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(exp)));
  return safeEqual(expect, sig);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0; for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function getCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
const cookieHeader = (value, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------- helpers ---------- */
const slugify = s => String(s || "").toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "project";
const str = (v, max = 5000) => (v == null ? "" : String(v)).slice(0, max);
function cleanWork(b) {
  return {
    title: str(b.title, 120), client: str(b.client, 120), category: str(b.category, 60), year: str(b.year, 10),
    featured: !!b.featured, size: b.size === "tall" ? "tall" : "normal", style: ["Auto", "Dark", "Burgundy", "Light"].includes(b.style) ? b.style : "Auto",
    cover: str(b.cover, 500), summary: str(b.summary, 600), description: str(b.description, 8000), video: str(b.video, 500),
    gallery: Array.isArray(b.gallery) ? b.gallery.slice(0, 40).map(g => str(g, 500)).filter(Boolean) : [],
  };
}
async function uniqueSlug(env, base, ignoreId = 0) {
  let slug = slugify(base), n = 1;
  while (await env.DB.prepare("SELECT id FROM work WHERE slug = ? AND id != ?").bind(slug, ignoreId).first()) slug = `${slugify(base)}-${++n}`;
  return slug;
}

/* ---------- routes ---------- */
async function handleApi(request, env, url) {
  const path = url.pathname, method = request.method;
  await ensureSeed(env, request);

  // public
  if (path === "/api/content" && method === "GET") {
    const [settings, work] = await Promise.all([getSettings(env, request), getWork(env)]);
    return json({ settings, work });
  }
  if (path === "/api/contact" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (b.website) return json({ ok: true }); // honeypot field filled by bots
    const name = str(b.name, 120).trim(), contact = str(b.contact, 200).trim(), message = str(b.message, 4000).trim();
    if (!name || !contact || !message) return bad("Add your name, a way to reach you and what you need.");
    await env.DB.prepare("INSERT INTO messages (name, brand, contact, message, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(name, str(b.brand, 120).trim(), contact, message, new Date().toISOString()).run();
    return json({ ok: true });
  }

  // admin login
  if (path === "/api/admin/login" && method === "POST") {
    if (!env.ADMIN_PASSWORD) return bad("ADMIN_PASSWORD is not set in Cloudflare yet.", 500);
    const b = await request.json().catch(() => ({}));
    await new Promise(r => setTimeout(r, 400)); // slow down guessing
    if (!safeEqual(String(b.password || ""), env.ADMIN_PASSWORD)) return bad("Wrong password.", 401);
    return json({ ok: true }, 200, { "set-cookie": cookieHeader(await makeToken(env), SESSION_DAYS * 86400) });
  }
  if (path === "/api/admin/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });

  // everything below needs a valid session
  if (path.startsWith("/api/admin/")) {
    if (!(await validToken(env, getCookie(request, COOKIE)))) return bad("Please log in.", 401);
    if (method !== "GET" && request.headers.get("x-unctrl") !== "1") return bad("Bad request.", 403);

    if (path === "/api/admin/me") return json({ ok: true });

    if (path === "/api/admin/settings" && method === "GET") return json(await getSettings(env, request));
    if (path === "/api/admin/settings" && method === "PUT") {
      const b = await request.json();
      if (typeof b !== "object" || Array.isArray(b)) return bad("Invalid settings.");
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES ('settings', ?)").bind(JSON.stringify(b).slice(0, 200000)).run();
      return json({ ok: true });
    }

    if (path === "/api/admin/work" && method === "GET") return json(await getWork(env));
    if (path === "/api/admin/work" && method === "POST") {
      const b = await request.json(), data = cleanWork(b);
      if (!data.title) return bad("Add a title.");
      const slug = await uniqueSlug(env, b.slug || data.title);
      const max = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM work").first();
      const r = await env.DB.prepare("INSERT INTO work (slug, position, data, updated_at) VALUES (?, ?, ?, ?)")
        .bind(slug, max.m + 1, JSON.stringify({ ...data, slug }), new Date().toISOString()).run();
      return json({ ok: true, id: r.meta.last_row_id, slug });
    }
    if (path === "/api/admin/work/reorder" && method === "POST") {
      const { ids } = await request.json();
      if (!Array.isArray(ids)) return bad("Invalid order.");
      await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE work SET position = ? WHERE id = ?").bind(i, Number(id))));
      return json({ ok: true });
    }
    const m = path.match(/^\/api\/admin\/work\/(\d+)$/);
    if (m && method === "PUT") {
      const id = Number(m[1]), b = await request.json(), data = cleanWork(b);
      if (!data.title) return bad("Add a title.");
      const slug = await uniqueSlug(env, b.slug || data.title, id);
      await env.DB.prepare("UPDATE work SET slug = ?, data = ?, updated_at = ? WHERE id = ?").bind(slug, JSON.stringify({ ...data, slug }), new Date().toISOString(), id).run();
      return json({ ok: true, slug });
    }
    if (m && method === "DELETE") {
      await env.DB.prepare("DELETE FROM work WHERE id = ?").bind(Number(m[1])).run();
      return json({ ok: true });
    }

    if (path === "/api/admin/upload" && method === "POST") {
      const type = (request.headers.get("content-type") || "").split(";")[0];
      if (!IMAGE_TYPES.includes(type)) return bad("Upload a JPG, PNG, WebP, GIF, AVIF or SVG image.");
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_UPLOAD) return bad("Image is larger than 8 MB.");
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif" }[type];
      const key = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await env.MEDIA.put(key, body, { metadata: { type } });
      return json({ ok: true, url: "/media/" + key });
    }

    if (path === "/api/admin/messages" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 500").all();
      return json(results);
    }
    const mm = path.match(/^\/api\/admin\/messages\/(\d+)$/);
    if (mm && method === "PATCH") { await env.DB.prepare("UPDATE messages SET is_read = 1 WHERE id = ?").bind(Number(mm[1])).run(); return json({ ok: true }); }
    if (mm && method === "DELETE") { await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(Number(mm[1])).run(); return json({ ok: true }); }
  }
  return bad("Not found.", 404);
}

async function handleMedia(request, env, ctx, key) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;
  const { value, metadata } = await env.MEDIA.getWithMetadata(key, { type: "arrayBuffer" });
  if (!value) return new Response("Not found", { status: 404 });
  const res = new Response(value, { headers: {
    "content-type": metadata?.type || "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    ...(metadata?.type === "image/svg+xml" ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
  } });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname.startsWith("/media/")) return await handleMedia(request, env, ctx, decodeURIComponent(url.pathname.slice(7)));
      if (url.pathname === "/admin") return Response.redirect(url.origin + "/admin/", 301);
    } catch (err) {
      console.error(err);
      return bad("Server error: " + (err && err.message ? err.message : "unknown"), 500);
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith("/admin")) {
      const h = new Headers(res.headers);
      h.set("x-robots-tag", "noindex"); h.set("cache-control", "no-store");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};
