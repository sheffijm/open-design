type KVNamespace = {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
};

type PagesFunctionContext<Env> = {
  request: Request & { cf?: Record<string, unknown> };
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

interface Env {
  NEWSLETTER_SUBSCRIBERS?: KVNamespace;
  NEWSLETTER_SALT?: string;
}

type SubscribeRecord = {
  email: string;
  subscribedAt: string;
  source: string;
  referer: string | null;
  userAgentHash: string;
  country?: string;
  region?: string;
};

// Origins allowed to POST here: the marketing site and the desktop client.
// The desktop client (apps/web) is served from a localhost daemon and Tauri
// shell, so its Origin differs from the landing domain — list those too.
const ALLOWED_ORIGINS = [
  "https://open-design.ai",
  "https://www.open-design.ai",
  "tauri://localhost",
  "http://localhost",
  "http://127.0.0.1",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const ALLOWED_SOURCES = new Set(["landing", "client"]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin &&
    ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(`${o}:`))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  }

  let payload: { email?: unknown; source?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, origin);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: "invalid_email" }, 400, origin);
  }

  const source =
    typeof payload.source === "string" && ALLOWED_SOURCES.has(payload.source)
      ? payload.source
      : "unknown";

  const ip = request.headers.get("cf-connecting-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const salt = context.env.NEWSLETTER_SALT || "open-design-newsletter";
  const cf = request.cf || {};
  const record: SubscribeRecord = {
    email,
    subscribedAt: new Date().toISOString(),
    source,
    referer: request.headers.get("referer"),
    userAgentHash: await sha256Hex(`${salt}:${ip}:${userAgent}`),
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
  };

  // sha256(email) as the key makes the write idempotent: a repeated signup
  // overwrites the same record instead of growing the namespace unbounded.
  const key = `sub:${await sha256Hex(email)}`;

  if (context.env.NEWSLETTER_SUBSCRIBERS) {
    context.waitUntil(context.env.NEWSLETTER_SUBSCRIBERS.put(key, JSON.stringify(record)));
  } else {
    console.log("newsletter_subscribe", JSON.stringify(record));
  }

  return json({ ok: true }, 200, origin);
};
