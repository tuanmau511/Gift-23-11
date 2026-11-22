import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let api;

export default async function handle(req, res, route) {
  try {
    if (!api) api = createApi(process.env, root);
    await (await api)(req, res, route);
  } catch (error) {
    api = undefined;
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "Máy chủ chưa được cấu hình đúng." }));
  }
}
