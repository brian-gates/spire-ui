import { Link } from "react-router";
import { CodeBlock } from "../code-block";

const OPTIONS: [string, string, string][] = [
  ["--game-dir <dir>", "Steam's usual folders", "Folder holding the game's .pck. Without it the CLI looks in Steam's default library on macOS, Windows and Linux, plus every library in libraryfolders.vdf."],
  ["--out <dir>", "./public/spire", "Output folder, replaced as a whole on every run, and only if it is empty or was written by this CLI."],
  ["--sizes <list>", "64", "Icon box sizes in px. Icons keep their aspect ratio and are never upscaled."],
  ["--kinds <list>", "relic,potion,class,room,ui", "Add card for card portraits."],
  ["--fonts", "off", "Also copy the game's fonts, for your local use only."],
];

export function ExtractArt() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-spire-display text-3xl font-bold">Extract art</h1>
      <p className="mt-3">
        The components work with their own fallback icons. If you own Slay the Spire 2 you can also give them the game's
        icons by extracting them from your own install, locally, with the <code>spire-ui</code> CLI.
      </p>

      <h2 className="font-spire-display mt-8 text-xl font-bold">Run it</h2>
      <div className="mt-2"><CodeBlock>{"npx spire-ui extract-art\nnpx spire-ui extract-art --game-dir \"D:/Games/Slay the Spire 2\" --out public/spire --sizes 32,64"}</CodeBlock></div>
      <p className="mt-2 text-spire-muted">Requires Node.js 20.9 or later. It reads the game's resource pack and writes WebP icons plus a manifest.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-spire-panel-edge text-spire-muted"><th className="py-2 pr-3">Option</th><th className="py-2 pr-3">Default</th><th className="py-2">What it does</th></tr>
          </thead>
          <tbody>
            {OPTIONS.map(([o, d, w]) => (
              <tr key={o} className="border-b border-spire-panel-edge/50 align-top">
                <td className="py-2 pr-3"><code>{o}</code></td><td className="py-2 pr-3"><code>{d}</code></td><td className="py-2">{w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-spire-display mt-8 text-xl font-bold">Use the output</h2>
      <p className="mt-2">Serve the output folder and wrap your app (or just the part that shows game objects) in <code>SpireAssets</code>:</p>
      <div className="mt-2">
        <CodeBlock>{`import { SpireAssets } from "@/lib/spire/lib/assets-provider";\n\n<SpireAssets base="/spire" manifestUrl="/spire/manifest.json">\n  <App />\n</SpireAssets>`}</CodeBlock>
      </div>
      <p className="mt-2 text-spire-muted">
        Anything the manifest lacks, such as a modded relic, keeps its fallback icon. See{" "}
        <Link to="/components/run-row">RunRow</Link> for a before and after.
      </p>

      <h2 className="font-spire-display mt-8 text-xl font-bold">Licensing and responsibility</h2>
      <ul className="mt-2 grid list-disc gap-2 pl-5">
        <li>Spire UI's code is MIT. The package and the registry contain no game art, text or fonts.</li>
        <li>Extraction is local only, from your own install. The CLI never downloads game art from anywhere.</li>
        <li>What you extract belongs to its owners. Do not commit it to a public repository or redistribute it. Treat it as local development material.</li>
        <li>The game's own fonts are foundry-licensed and are never redistributed by this project. <code>--fonts</code> copies them into your project for your own use, and how you then publish them is your responsibility. The kit's default fonts are the free Kreon and Spectral.</li>
        <li>The example art on this site is a small, curated set of images shown to illustrate the components, used as fair-use examples. It is not part of the package or the registry and is never offered as a download.</li>
      </ul>
    </div>
  );
}
