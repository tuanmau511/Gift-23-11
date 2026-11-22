import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createStorage } from "./storage.js";

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(JSON.stringify(body));
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : ""}`;
}

const validVisitor = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");

function sameOrigin(req) {
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}

async function body(req) {
  if (req.body !== undefined) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 8192) throw new Error("Nội dung quá dài");
    return req.body;
  }
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) throw new Error("Nội dung quá dài");
  }
  return JSON.parse(text);
}

export async function createApi(env, root) {
  const password = env.ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error("Hãy đặt ADMIN_PASSWORD với ít nhất 12 ký tự.");
  const storage = await createStorage(env, root);

  return async (req, res, route) => {
    try {
      const visitor = cookies(req).visitor;
      if (req.method === "POST" && !sameOrigin(req)) return send(res, 403, { error: "Yêu cầu không hợp lệ." });
      if (route === "/api/session" && req.method === "POST") {
        const id = validVisitor(visitor) ? visitor : randomUUID();
        await storage.record(id, "visit");
        return send(res, 200, { id }, { "Set-Cookie": cookie("visitor", id, 31536000) });
      }
      if (route === "/api/name" && req.method === "POST") {
        const { name } = await body(req);
        if (typeof name !== "string" || name.length > 500 || !validVisitor(visitor)) return send(res, 400, { error: "Tên không hợp lệ." });
        const ip = env.VERCEL ? req.headers["x-forwarded-for"] : req.socket.remoteAddress;
        if (typeof ip !== "string" || !ip) throw new Error("Không xác định được địa chỉ kết nối.");
        if (!await storage.attempt(ip)) return send(res, 429, { error: "Thử quá nhiều lần, vui lòng quay lại sau 15 phút." });
        const a = Buffer.from(name);
        const b = Buffer.from(password);
        if (a.length === b.length && timingSafeEqual(a, b)) {
          await storage.resetAttempts(ip);
          const token = randomBytes(32).toString("hex");
          await storage.createSession(token, Date.now() + 8 * 60 * 60 * 1000);
          return send(res, 200, { admin: true }, { "Set-Cookie": cookie("admin", token, 28800) });
        }
        await storage.record(visitor, "name", name);
        return send(res, 200, { admin: false });
      }
      if (route === "/api/events" && req.method === "POST") {
        const { type, value = "" } = await body(req);
        if (!validVisitor(visitor) || !["message", "choice", "gift", "recording", "skip"].includes(type) || typeof value !== "string" || value.length > 1000) return send(res, 400, { error: "Dữ liệu không hợp lệ." });
        await storage.record(visitor, type, value);
        return send(res, 200, { ok: true });
      }
      if (route === "/api/admin/events" && req.method === "GET") {
        if (!await storage.authorized(cookies(req).admin)) return send(res, 401, { error: "Chưa đăng nhập." });
        return send(res, 200, { events: await storage.events() });
      }
      if (route === "/api/admin/logout" && req.method === "POST") {
        await storage.deleteSession(cookies(req).admin);
        return send(res, 200, { ok: true }, { "Set-Cookie": cookie("admin", "", 0) });
      }
      return send(res, 404, { error: "Không tìm thấy." });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: "Có lỗi xảy ra trên máy chủ." });
      else res.end();
    }
  };
}
