import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

await mkdir(path.join("public", "vendor"), { recursive: true });
await copyFile(path.join("node_modules", "gsap", "dist", "gsap.min.js"), path.join("public", "vendor", "gsap.min.js"));
