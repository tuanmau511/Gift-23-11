import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./lib/api.js";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };
const handleApi = await createApi(process.env, root);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url.pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Phương thức không được hỗ trợ." });
    const route = url.pathname === "/" ? "/index.html" : url.pathname === "/ad5112311" ? "/admin.html" : url.pathname;
    const filename = path.resolve(publicDir, "." + decodeURIComponent(route));
    if (!filename.startsWith(publicDir + path.sep)) return send(res, 403, { error: "Không có quyền truy cập." });
    if (path.relative(publicDir, filename).split(path.sep).some((part) => part.startsWith("."))) return send(res, 404, { error: "Không tìm thấy." });
    let content;
    try { content = await readFile(filename); } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
      return send(res, 404, { error: "Không tìm thấy." });
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: "Có lỗi xảy ra trên máy chủ." });
    else res.end();
  }
});

server.listen(port, () => console.log(`Trang sinh nhật: http://localhost:${server.address().port}`));
