// Consumer install smoke: proves a clean `shadcn add` of a Spire UI item works in a fresh Vite + Tailwind v4 app.
//
//  1. Serves the BUILT registry (apps/docs/dist/r, run `bun run docs:build` first) at /spire-ui/r/ on a local port.
//     Item JSON is rewritten on the fly: the production base (https://brian-gates.github.io/spire-ui) becomes
//     http://localhost:<port>/spire-ui, so registryDependencies resolve locally. Nothing else is rewritten.
//  2. Copies ./template to a temp dir (nothing installed is ever committed), runs npm install,
//     `shadcn init` and `shadcn add <local url>/spire-run-row.json` non-interactively, then builds the app.
//     The install runs once per shadcn base (radix, and the default Base UI base) so the kit is proven under both.
//     Run with SMOKE_BASE=radix|default for one pass; with no SMOKE_BASE both run in sequence. KEEP_SMOKE=1 keeps the temp app.
//  3. Runs the Playwright spec against `vite preview` of the built app.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SMOKE_BASE;
if (!BASE) {
  for (const b of ["radix", "default"]) {
    console.log(`\n=== consumer smoke: shadcn base ${b} ===`);
    const code = await new Promise((done) => {
      spawn(process.execPath, [fileURLToPath(import.meta.url)], { stdio: "inherit", env: { ...process.env, SMOKE_BASE: b } }).on("exit", (c) => done(c ?? 1));
    });
    if (code !== 0) { console.error(`consumer smoke FAILED for base ${b}`); process.exit(code); }
  }
  process.exit(0);
}
if (BASE !== "radix" && BASE !== "default") { console.error("SMOKE_BASE must be radix or default"); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const registryDir = resolve(root, "..", "docs", "dist", "r");
const PROD = "https://brian-gates.github.io/spire-ui";
const ITEM = process.env.SMOKE_ITEM ?? "spire-run-row";
const REGISTRY_PORT = Number(process.env.SMOKE_REGISTRY_PORT ?? 4180);
const APP_PORT = Number(process.env.SMOKE_APP_PORT ?? 4181);
const LOCAL = `http://127.0.0.1:${REGISTRY_PORT}/spire-ui`;

if (!existsSync(join(registryDir, `${ITEM}.json`))) {
  console.error(`Missing ${registryDir}/${ITEM}.json. Run "bun run docs:build" first.`);
  process.exit(2);
}

const server = createServer((req, res) => {
  const m = /^\/spire-ui\/r\/([\w.-]+\.json)$/.exec(req.url ?? "");
  const file = m && join(registryDir, m[1]);
  if (!file || !existsSync(file)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(readFileSync(file, "utf8").replaceAll(PROD, LOCAL));
});
await new Promise((ok) => server.listen(REGISTRY_PORT, "127.0.0.1", ok));

const app = mkdtempSync(join(tmpdir(), "spire-consumer-"));
cpSync(join(root, "template"), app, { recursive: true });
console.log(`consumer app: ${app}`);

function cleanup() {
  server.close();
  if (!process.env.KEEP_SMOKE) rmSync(app, { recursive: true, force: true });
}

// Async on purpose: a synchronous spawn would block this process's event loop and with it the registry server.
function exec(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  return new Promise((done) => {
    spawn(cmd, args, { cwd: app, stdio: "inherit", env: { ...process.env, CI: "1" }, ...opts }).on("exit", (c) => done(c ?? 1));
  });
}
async function run(cmd, args) {
  const c = await exec(cmd, args);
  if (c !== 0) { cleanup(); console.error(`FAILED: ${cmd} ${args.join(" ")}`); process.exit(c); }
}

await run("npm", ["install", "--no-audit", "--no-fund"]);
await run("npx", ["--yes", "shadcn@latest", "init", "--yes", "--defaults", ...(BASE === "radix" ? ["--base", "radix"] : []), "--template", "vite", "--no-monorepo"]);
await run("npx", ["--yes", "shadcn@latest", "add", "--yes", `${LOCAL}/r/${ITEM}.json`]);
// The documented consumer step: import the installed theme. `~` is the project root for a Vite app (src/ for
// frameworks with a src dir), so the theme lands at ./styles/spire.css here.
const css = join(app, "src", "index.css");
const theme = ["styles/spire.css", "src/styles/spire.css"].find((f) => existsSync(join(app, f)));
if (!theme) { cleanup(); console.error("FAILED: shadcn add did not install styles/spire.css"); process.exit(1); }
writeFileSync(css, readFileSync(css, "utf8") + `\n@import "${relative(dirname(css), join(app, theme))}";\n`);
await run("npm", ["run", "build"]);

const preview = spawn(join(app, "node_modules", ".bin", "vite"), ["preview", "--host", "127.0.0.1", "--port", String(APP_PORT), "--strictPort"], { cwd: app, stdio: "ignore" });
function waitForPort(port, ms = 30_000) {
  const end = Date.now() + ms;
  return new Promise((ok, fail) => {
    const probe = () => {
      const sock = connect(port, "127.0.0.1", () => { sock.destroy(); ok(); });
      sock.on("error", () => { sock.destroy(); Date.now() > end ? fail(new Error(`port ${port} never opened`)) : setTimeout(probe, 200); });
    };
    probe();
  });
}
let code = 1;
try {
  await waitForPort(APP_PORT);
  code = await exec("npx", ["playwright", "test"], { cwd: root, env: { ...process.env, SMOKE_APP_URL: `http://127.0.0.1:${APP_PORT}/` } });
} finally {
  preview.kill();
  cleanup();
}
process.exit(code);
