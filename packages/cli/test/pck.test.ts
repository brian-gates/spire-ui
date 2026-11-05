import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { PckError, readPckFile, readPckIndex } from "../src/pck";
import { buildPck, type FakeFile, type FakePck } from "./fixtures";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spire-pck-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Writes a synthetic pack into the test's temp dir. */
function fakePck(name: string, o: FakePck): string {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, buildPck(o));
  return file;
}

const files: FakeFile[] = [
  { path: "images/relics/anchor.png.import", data: Buffer.from('[remap]\npath="res://.godot/imported/anchor.ctex"\n') },
  { path: "res://.godot/imported/anchor.ctex", data: Buffer.from([1, 2, 3, 4, 5, 6, 7]) },
];

describe("readPckIndex", () => {
  test("lists entries with paths, sizes, absolute offsets and flags", async () => {
    const file = fakePck("ok.pck", { files, gap: 13 });
    const index = await readPckIndex(file);
    expect(index.formatVersion).toBe(3);
    expect(index.engine).toEqual([4, 5, 1]);
    expect(index.entries.map((e) => e.path)).toEqual(["images/relics/anchor.png.import", ".godot/imported/anchor.ctex"]);
    expect(index.entries.map((e) => e.size)).toEqual([BigInt(files[0]!.data.length), 7n]);
    expect(index.entries.map((e) => e.flags)).toEqual([0, 0]);
    expect(index.entries[0]!.offset).toBe(BigInt(4 + 16 + 4 + 8 + 8 + 64 + 13));
  });

  test("readPckFile returns exactly an entry's bytes", async () => {
    const file = fakePck("read.pck", { files, gap: 5 });
    const { entries } = await readPckIndex(file);
    expect((await readPckFile(file, entries[0]!)).equals(files[0]!.data)).toBe(true);
    expect((await readPckFile(file, entries[1]!)).equals(files[1]!.data)).toBe(true);
  });

  test("offsets are relative to file base even without the relative-file-base flag", async () => {
    // Godot 4 always adds file_base; PACK_REL_FILEBASE only shifts file_base by the pack's start
    // position, which is 0 for a standalone .pck.
    const file = fakePck("abs.pck", { files, gap: 9, packFlags: 0 });
    const { entries } = await readPckIndex(file);
    expect((await readPckFile(file, entries[1]!)).equals(files[1]!.data)).toBe(true);
  });

  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(PckError);
      return (e as PckError).code;
    }
    throw new Error("expected a PckError");
  };

  test("wrong magic throws not-a-pck", async () => {
    expect(await code(readPckIndex(fakePck("magic.pck", { files, magic: "NOPE" })))).toBe("not-a-pck");
    const tiny = path.join(tmp, "tiny.pck");
    fs.writeFileSync(tiny, "GD");
    expect(await code(readPckIndex(tiny))).toBe("not-a-pck");
  });

  test("an encrypted directory throws encrypted", async () => {
    expect(await code(readPckIndex(fakePck("enc.pck", { files, packFlags: 3 })))).toBe("encrypted");
  });

  test("other format versions throw unsupported-version", async () => {
    expect(await code(readPckIndex(fakePck("v2.pck", { files, version: 2 })))).toBe("unsupported-version");
    expect(await code(readPckIndex(fakePck("v4.pck", { files, version: 4 })))).toBe("unsupported-version");
  });

  test("unknown pack flags (e.g. sparse bundle) throw unsupported-feature", async () => {
    expect(await code(readPckIndex(fakePck("sparse.pck", { files, packFlags: 2 | 4 })))).toBe("unsupported-feature");
  });

  test("a truncated or inconsistent directory throws corrupt", async () => {
    const whole = fs.statSync(fakePck("full.pck", { files })).size;
    expect(await code(readPckIndex(fakePck("trunc.pck", { files, truncate: whole - 3 })))).toBe("corrupt");
    expect(await code(readPckIndex(fakePck("count.pck", { files, count: 1_000_000 })))).toBe("corrupt");
    expect(await code(readPckIndex(fakePck("off.pck", { files, badOffset: 1n << 40n })))).toBe("corrupt");
  });

  test("readPckFile refuses encrypted and unsupported entries", async () => {
    const file = fakePck("entry-flags.pck", {
      files: [
        { path: "a", data: Buffer.from("secret"), flags: 1 },
        { path: "b", data: Buffer.alloc(0), flags: 2 },
      ],
    });
    const { entries } = await readPckIndex(file);
    expect(await code(readPckFile(file, entries[0]!))).toBe("encrypted");
    expect(await code(readPckFile(file, entries[1]!))).toBe("unsupported-feature");
  });
});
