import { createHash, createHmac } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const hash = (value) => createHash("sha256").update(value).digest("hex");

export async function createStorage(env, root) {
  const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = env;
  if (Boolean(url) !== Boolean(key)) throw new Error("Cần đặt cả SUPABASE_URL và SUPABASE_SECRET_KEY.");
  if (!url && env.VERCEL) throw new Error("Vercel cần SUPABASE_URL và SUPABASE_SECRET_KEY.");

  if (url && key) {
    const hashClient = (ip) => createHmac("sha256", env.ADMIN_PASSWORD).update(ip).digest("hex");
    const base = new URL(url);
    if (base.protocol !== "https:" && !(env.NODE_ENV === "test" && base.protocol === "http:")) {
      throw new Error("SUPABASE_URL phải sử dụng HTTPS.");
    }
    const request = async (endpoint, { method = "GET", data, headers = {} } = {}) => {
      const auth = key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` };
      const response = await fetch(new URL(`/rest/v1/${endpoint}`, base), {
        method,
        headers: { apikey: key, ...auth, "Content-Type": "application/json", ...headers },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      if (!response.ok) {
        console.error(`Supabase trả về HTTP ${response.status} cho ${method} ${endpoint.split("?")[0]}.`);
        throw new Error("Không thể truy cập dữ liệu Supabase.");
      }
      if (response.status === 204 || response.headers.get("content-length") === "0") return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    };

    return {
      async record(id, type, value = "") {
        await request("birthday_events", { method: "POST", data: { visitor_id: id, type, value }, headers: { Prefer: "return=minimal" } });
      },
      async events() {
        const events = [];
        const pageSize = 500;
        let before = "";
        for (;;) {
          const page = await request(`birthday_events?select=event_id,visitor_id,type,value,created_at&order=event_id.desc&limit=${pageSize}${before ? `&event_id=lt.${before}` : ""}`);
          events.push(...page.map((event) => ({ id: event.visitor_id, type: event.type, value: event.value, time: event.created_at })));
          if (page.length < pageSize) return events;
          before = page[page.length - 1].event_id;
        }
      },
      async attempt(ip) {
        return request("rpc/birthday_login_attempt", { method: "POST", data: { p_client_hash: hashClient(ip) } });
      },
      async resetAttempts(ip) {
        await request(`birthday_login_attempts?client_hash=eq.${hashClient(ip)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      },
      async createSession(token, expires) {
        await request("birthday_admin_sessions", { method: "POST", data: { token_hash: hash(token), expires_at: new Date(expires).toISOString() }, headers: { Prefer: "return=minimal" } });
      },
      async authorized(token) {
        if (!/^[a-f0-9]{64}$/.test(token || "")) return false;
        const rows = await request(`birthday_admin_sessions?select=token_hash&token_hash=eq.${hash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
        return rows.length === 1;
      },
      async deleteSession(token) {
        if (/^[a-f0-9]{64}$/.test(token || "")) {
          await request(`birthday_admin_sessions?token_hash=eq.${hash(token)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        }
      },
    };
  }

  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root, "data");
  const logFile = path.join(dataDir, "events.jsonl");
  const sessions = new Map();
  const attempts = new Map();
  await mkdir(dataDir, { recursive: true });
  return {
    async record(id, type, value = "") {
      await appendFile(logFile, JSON.stringify({ id, type, value, time: new Date().toISOString() }) + "\n", { mode: 0o600 });
    },
    async events() {
      let contents;
      try { contents = await readFile(logFile, "utf8"); } catch (error) {
        if (error.code !== "ENOENT") throw error;
        contents = "";
      }
      return contents.split("\n").filter(Boolean).map((line) => JSON.parse(line)).reverse();
    },
    async attempt(ip) {
      const recent = (attempts.get(ip) || []).filter((time) => Date.now() - time < 15 * 60 * 1000);
      if (recent.length >= 20) return false;
      recent.push(Date.now());
      attempts.set(ip, recent);
      return true;
    },
    async resetAttempts(ip) { attempts.delete(ip); },
    async createSession(token, expires) { sessions.set(token, expires); },
    async authorized(token) {
      const expires = sessions.get(token);
      if (!expires) return false;
      if (expires <= Date.now()) { sessions.delete(token); return false; }
      return true;
    },
    async deleteSession(token) { sessions.delete(token); },
  };
}
