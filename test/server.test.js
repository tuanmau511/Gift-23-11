import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

test("xác thực quản trị và lưu lịch sử mà không lưu mật khẩu", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "zyzy-test-"));
  const password = "test-password-only-123";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "0", ADMIN_PASSWORD: password, DATA_DIR: directory, NODE_ENV: "test", VERCEL: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    await rm(directory, { recursive: true, force: true });
  });
  const [output] = await once(child.stdout, "data");
  const port = String(output).match(/localhost:(\d+)/)[1];
  const origin = `http://localhost:${port}`;
  const post = (route, data, cookie = "", extra = {}) => fetch(origin + route, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie, ...extra },
    body: JSON.stringify(data),
  });

  assert.equal((await fetch(origin + "/api/admin/events")).status, 401);
  assert.equal((await fetch(origin + "/ad5112311")).status, 200);
  assert.equal((await fetch(origin + "/admin")).status, 404);
  assert.equal((await fetch(origin + "/.env")).status, 404);
  assert.equal((await post("/api/session", {}, "", { origin: "http://example.com" })).status, 403);
  const session = await post("/api/session", {});
  const visitorCookie = session.headers.get("set-cookie").split(";")[0];
  const { id } = await session.json();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal((await (await post("/api/name", { name: "Tường Vy" }, visitorCookie)).json()).admin, false);
  assert.equal((await post("/api/events", { type: "message", value: "Xin chào" }, visitorCookie)).status, 200);
  assert.equal((await post("/api/events", { type: "bad", value: "" }, visitorCookie)).status, 400);
  const login = await post("/api/name", { name: password }, visitorCookie);
  assert.equal((await login.json()).admin, true);
  const adminCookie = login.headers.get("set-cookie").split(";")[0];
  const events = await (await fetch(origin + "/api/admin/events", { headers: { cookie: adminCookie } })).json();
  assert.deepEqual(events.events.map((event) => event.type), ["message", "name", "visit"]);
  assert.equal(events.events[0].value, "Xin chào");
  assert.ok(events.events.every((event) => event.id === id && !Number.isNaN(Date.parse(event.time))));
  assert.equal((await readFile(path.join(directory, "events.jsonl"), "utf8")).includes(password), false);
  await post("/api/admin/logout", {}, adminCookie);
  assert.equal((await fetch(origin + "/api/admin/events", { headers: { cookie: adminCookie } })).status, 401);
});
