import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createApi } from "../lib/api.js";

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test("lưu Supabase và phiên admin dùng được giữa các instance", async (t) => {
  const events = [];
  const sessions = new Map();
  const attempts = new Map();
  let unavailable = false;
  const fake = await listen(async (req, res) => {
    if (unavailable) { res.writeHead(503).end(); return; }
    assert.equal(req.headers.apikey, "sb_secret_test");
    const url = new URL(req.url, "http://localhost");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : null;
    const reply = (value) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    const empty = () => { res.writeHead(204); res.end(); };
    if (url.pathname === "/rest/v1/rpc/birthday_login_attempt") {
      const count = (attempts.get(data.p_client_hash) || 0) + 1;
      attempts.set(data.p_client_hash, count);
      return reply(count <= 20);
    }
    if (url.pathname === "/rest/v1/birthday_login_attempts" && req.method === "DELETE") {
      attempts.delete(url.searchParams.get("client_hash").slice(3));
      return empty();
    }
    if (url.pathname === "/rest/v1/birthday_events" && req.method === "POST") {
      events.push({ ...data, event_id: events.length + 1, created_at: new Date().toISOString() });
      return empty();
    }
    if (url.pathname === "/rest/v1/birthday_events" && req.method === "GET") {
      const before = url.searchParams.get("event_id");
      return reply([...events].reverse().filter((event) => !before || event.event_id < Number(before.slice(3))).slice(0, Number(url.searchParams.get("limit"))));
    }
    if (url.pathname === "/rest/v1/birthday_admin_sessions" && req.method === "POST") {
      sessions.set(data.token_hash, data.expires_at);
      return empty();
    }
    if (url.pathname === "/rest/v1/birthday_admin_sessions") {
      const key = url.searchParams.get("token_hash").slice(3);
      if (req.method === "DELETE") { sessions.delete(key); return empty(); }
      return reply(sessions.has(key) && sessions.get(key) > new Date().toISOString() ? [{ token_hash: key }] : []);
    }
    res.writeHead(404).end();
  });
  t.after(() => fake.server.close());
  const env = { ADMIN_PASSWORD: "test-password-only-123", SUPABASE_URL: fake.url, SUPABASE_SECRET_KEY: "sb_secret_test", NODE_ENV: "test" };
  const firstApi = await createApi(env, process.cwd());
  const secondApi = await createApi(env, process.cwd());
  const first = await listen((req, res) => firstApi(req, res, new URL(req.url, "http://localhost").pathname));
  const second = await listen((req, res) => secondApi(req, res, new URL(req.url, "http://localhost").pathname));
  t.after(() => { first.server.close(); second.server.close(); });
  const post = (base, route, data, cookie = "") => fetch(base + route, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, cookie },
    body: JSON.stringify(data),
  });

  const visitorResponse = await post(first.url, "/api/session", {});
  const visitor = visitorResponse.headers.get("set-cookie").split(";")[0];
  await post(first.url, "/api/name", { name: "Vy" }, visitor);
  const login = await post(first.url, "/api/name", { name: env.ADMIN_PASSWORD }, visitor);
  assert.equal((await login.json()).admin, true);
  const admin = login.headers.get("set-cookie").split(";")[0];
  assert.notEqual([...sessions.keys()][0], admin.split("=")[1]);
  const authHeaders = { headers: { cookie: admin } };
  const response = await fetch(second.url + "/api/admin/events", authHeaders);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).events.map((event) => event.type), ["name", "visit"]);
  assert.equal(JSON.stringify(events).includes(env.ADMIN_PASSWORD), false);

  for (let index = 0; index < 501; index += 1) events.push({ event_id: events.length + 1, visitor_id: "id", type: "choice", value: String(index), created_at: new Date().toISOString() });
  assert.equal((await (await fetch(second.url + "/api/admin/events", authHeaders)).json()).events.length, 503);
  await post(second.url, "/api/admin/logout", {}, admin);
  assert.equal((await fetch(first.url + "/api/admin/events", authHeaders)).status, 401);

  for (let index = 0; index < 20; index += 1) assert.equal((await post(first.url, "/api/name", { name: "Sai" }, visitor)).status, 200);
  assert.equal((await post(second.url, "/api/name", { name: env.ADMIN_PASSWORD }, visitor)).status, 429);

  unavailable = true;
  assert.equal((await post(first.url, "/api/session", {})).status, 500);
  unavailable = false;

  const savedEnv = { ...process.env };
  Object.assign(process.env, env, { VERCEL: "1" });
  t.after(() => {
    for (const key of ["ADMIN_PASSWORD", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "NODE_ENV", "VERCEL"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });
  const handlers = {
    "/api/session": (await import("../api/session.js")).default,
    "/api/name": (await import("../api/name.js")).default,
    "/api/admin/events": (await import("../api/admin/events.js")).default,
    "/api/admin/logout": (await import("../api/admin/logout.js")).default,
  };
  const vercel = await listen(async (req, res) => {
    req.headers["x-forwarded-for"] = "203.0.113.1";
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      req.body = JSON.parse(raw);
    }
    await handlers[req.url](req, res);
  });
  t.after(() => vercel.server.close());
  const deployedVisitor = await post(vercel.url, "/api/session", {});
  assert.match(deployedVisitor.headers.get("set-cookie"), /Secure/);
  const deployedCookie = deployedVisitor.headers.get("set-cookie").split(";")[0];
  const deployedLogin = await post(vercel.url, "/api/name", { name: env.ADMIN_PASSWORD }, deployedCookie);
  const deployedAdmin = deployedLogin.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(vercel.url + "/api/admin/events", { headers: { cookie: deployedAdmin } })).status, 200);
  await post(vercel.url, "/api/admin/logout", {}, deployedAdmin);
  assert.equal((await fetch(vercel.url + "/api/admin/events", { headers: { cookie: deployedAdmin } })).status, 401);
});

test("Vercel không chạy nếu thiếu cấu hình Supabase", async () => {
  await assert.rejects(createApi({ ADMIN_PASSWORD: "test-password-only-123", VERCEL: "1" }, process.cwd()), /Supabase|SUPABASE/);
});
