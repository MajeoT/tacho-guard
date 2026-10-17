// TachoGuard phone notifications.
// - GET  ?vapid=1            (signed in driver) -> the public key the phone needs to subscribe
// - POST {test:true}         (signed in driver) -> sends a test notification to that driver's phones
// - POST {cron:true} + x-cron-secret header (the database timer) -> sends every reminder that is due
// The key pair is made on first use and kept in public.tg_push_keys, which only this function (service role) can read.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function keys() {
  let { data } = await db.from("tg_push_keys").select("*").eq("id", 1).maybeSingle();
  if (!data) {
    const secret = crypto.randomUUID().replaceAll("-", "");
    await db.from("tg_push_keys").upsert({ id: 1, cron_secret: secret }, { ignoreDuplicates: true });
    data = (await db.from("tg_push_keys").select("*").eq("id", 1).single()).data;
  }
  if (!data.public_key || !data.private_key) {
    const k = webpush.generateVAPIDKeys();
    // only fill the blanks, so two calls at once cannot swap the pair
    await db.from("tg_push_keys").update({ public_key: k.publicKey, private_key: k.privateKey }).eq("id", 1).is("public_key", null);
    data = (await db.from("tg_push_keys").select("*").eq("id", 1).single()).data;
  }
  webpush.setVapidDetails("https://tacho-guard.slynch85.workers.dev", data.public_key, data.private_key);
  return data;
}

async function userOf(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  if (!t) return null;
  const { data, error } = await db.auth.getUser(t);
  return error || !data.user ? null : data.user;
}

// send one message to every phone a driver has registered; forget phones the push service says are gone
async function sendTo(userId: string, msg: { title: string; body: string; tag: string }) {
  const { data: subs } = await db.from("tg_push_subs").select("endpoint,p256dh,auth").eq("user_id", userId);
  let ok = 0, gone = 0, failed = 0;
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...msg, url: "./" }), { TTL: 1800, urgency: "high" });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { gone++; await db.from("tg_push_subs").delete().eq("user_id", userId).eq("endpoint", s.endpoint); }
      else { failed++; console.error("push failed", code, (e as Error).message); }
    }
  }));
  return { phones: (subs || []).length, ok, gone, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const k = await keys();
    const url = new URL(req.url);

    if (req.method === "GET" && url.searchParams.get("vapid")) {
      if (!(await userOf(req))) return json({ error: "sign in first" }, 401);
      return json({ key: k.public_key });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (body.test) {
      const u = await userOf(req);
      if (!u) return json({ error: "sign in first" }, 401);
      const r = await sendTo(u.id, { title: "TachoGuard", body: "Test notification. Phone notifications are working.", tag: "tg-test" });
      return json(r);
    }

    if (body.cron) {
      const given = req.headers.get("x-cron-secret") || "";
      if (!given || given !== k.cron_secret) return json({ error: "no" }, 401);
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 60000).toISOString(); // anything older than 30 minutes is stale, so it is never sent late
      const { data: due } = await db.from("tg_reminders").select("user_id,key,title,body").is("sent_at", null).lte("fire_at", now.toISOString()).gte("fire_at", from).limit(200);
      let sent = 0;
      for (const r of due || []) {
        // claim it first, so an overlapping run cannot send it twice
        const { data: claimed } = await db.from("tg_reminders").update({ sent_at: now.toISOString() }).eq("user_id", r.user_id).eq("key", r.key).is("sent_at", null).select("key");
        if (!claimed || !claimed.length) continue;
        await sendTo(r.user_id, { title: r.title, body: r.body, tag: "tg-" + r.key });
        sent++;
      }
      // tidy up: reminders over a day old
      await db.from("tg_reminders").delete().lt("fire_at", new Date(now.getTime() - 864e5).toISOString());
      return json({ due: (due || []).length, sent });
    }

    return json({ error: "unknown request" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "something went wrong" }, 500);
  }
});
