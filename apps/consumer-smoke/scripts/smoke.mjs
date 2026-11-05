// Consumer install smoke: proves a clean `shadcn add` of a Spire UI item works in a fresh Vite + Tailwind v4 app.
//
//  1. Serves the BUILT registry (apps/docs/dist/r, run `bun run docs:build` first) at /spire-ui/r/ on a local port.
//     Item JSON is rewritten on the fly: the production base (https://brian-gates.github.io/spire-ui) becomes
//     http://localhost:<port>/spire-ui, so registryDependencies resolve locally. Nothing else is rewritten.
//  2. Copies ./template to a temp dir (nothing installed is ever committed), runs npm install,
//     `shadcn init` and `shadcn add <local url>/spire-run-row.json` non-interactively, then builds the app.
//  3. Runs the Playwright spec against `vite preview` of the built app.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const registryDir = resolve(root, "..", "docs", "dist", "r");
const PROD = "https://brian-gates.github.io/spire-ui";
const ITEM = process.env.SMOKE_ITEM ?? "spire-run-row";
const REGISTRY_PORT = Number(process.env.SMOKE_REGISTRY_PORT ?? 4180);
const APP_PORT = Number(process.env.SMOKE_APP_PORT ?? 4181);
const LOCAL = `http://localhost:${REGISTRY_PORT}/spire-ui`;

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

// Async on purpose: a synchronous spawn would block this process's event loop and with it the registry server.
function exec(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  return new Promise((done) => {
    spawn(cmd, args, { cwd: app, stdio: "inherit", env: { ...process.env, CI: "1" }, ...opts }).on("exit", (c) => done(c ?? 1));
  });
}
async function run(cmd, args) {
  const c = await exec(cmd, args);
  if (c !== 0) { server.close(); console.error(`FAILED: ${cmd} ${args.join(" ")}`); process.exit(c); }
}

await run("npm", ["install", "--no-audit", "--no-fund"]);
await run("npx", ["--yes", "shadcn@latest", "init", "--yes", "--defaults", "--base", "radix", "--template", "vite", "--no-monorepo"]);
await run("npx", ["--yes", "shadcn@latest", "add", "--yes", `${LOCAL}/r/${ITEM}.json`]);
// The documented consumer step: import the installed theme. `~` is the project root for a Vite app (src/ for
// frameworks with a src dir), so the theme lands at ./styles/spire.css here.
const css = join(app, "src", "index.css");
const theme = ["styles/spire.css", "src/styles/spire.css"].find((f) => existsSync(join(app, f)));
if (!theme) { server.close(); console.error("FAILED: shadcn add did not install styles/spire.css"); process.exit(1); }
writeFileSync(css, readFileSync(css, "utf8") + `\n@import "${relative(dirname(css), join(app, theme))}";\n`);
await run("npm", ["run", "build"]);

const preview = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(APP_PORT), "--strictPort"], { cwd: app, stdio: "ignore" });
let code = 1;
try {
  await new Promise((r) => setTimeout(r, 1500)); // let vite preview bind
  code = await exec("npx", ["playwright", "test"], { cwd: root, env: { ...process.env, SMOKE_APP_URL: `http://127.0.0.1:${APP_PORT}/` } });
} finally {
  preview.kill();
  server.close();
}
process.exit(code);
