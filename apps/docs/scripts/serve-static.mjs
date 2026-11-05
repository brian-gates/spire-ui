// Serves dist/ the way GitHub Pages does, for e2e: static files only, no SPA fallback. A directory without a
// trailing slash redirects to it, then serves its index.html; a missing path returns 404 with 404.html.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BASE = "/spire-ui/";
const PORT = 4174;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".webp": "image/webp", ".jpg": "image/jpeg", ".map": "application/json",
};

const isDir = async (p) => (await stat(p).catch(() => null))?.isDirectory() ?? false;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = async (status, file, headers = {}) => {
    const body = await readFile(file);
    res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...headers });
    res.end(body);
  };
  const notFound = () => send(404, join(dist, "404.html")).catch(() => { res.writeHead(404); res.end("not found"); });
  if (!url.pathname.startsWith(BASE)) return notFound();
  const rel = normalize(decodeURIComponent(url.pathname.slice(BASE.length)));
  if (rel.startsWith("..")) return notFound();
  const target = join(dist, rel);
  if (await isDir(target)) {
    if (!url.pathname.endsWith("/")) {
      res.writeHead(301, { location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    return send(200, join(target, "index.html")).catch(notFound);
  }
  return send(200, target).catch(notFound);
}).listen(PORT, () => console.log(`serving ${dist} at http://localhost:${PORT}${BASE}`));
