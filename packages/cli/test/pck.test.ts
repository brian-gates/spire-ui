import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { PckError, readPckFile, readPckIndex } from "../src/pck";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spire-pck-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

interface FakeFile {
  path: string;
  data: Buffer;
  flags?: number;
}

interface FakePck {
  magic?: string;
  version?: number;
  packFlags?: number;
  /** Bytes between the header and file base, to prove offsets are relative to it. */
  gap?: number;
  files: FakeFile[];
  /** Overrides the directory's entry count. */
  count?: number;
  /** Cuts the finished pack to this many bytes. */
  truncate?: number;
  /** Overrides one entry's stored offset (relative to file base). */
  badOffset?: bigint;
}

/** Builds a Godot 4 PCK (format v3 layout): header, file data from file base, directory at the end. */
function fakePck(name: string, o: FakePck): string {
  const header = Buffer.alloc(4 + 4 * 4 + 4 + 8 + 8 + 16 * 4);
  header.write(o.magic ?? "GDPC", 0, "latin1");
  header.writeUInt32LE(o.version ?? 3, 4);
  header.writeUInt32LE(4, 8);
  header.writeUInt32LE(5, 12);
  header.writeUInt32LE(1, 16);
  header.writeUInt32LE(o.packFlags ?? 2, 20);
  const fileBase = header.length + (o.gap ?? 0);
  header.writeBigUInt64LE(BigInt(fileBase), 24);

  const bodies: Buffer[] = [];
  const offsets: bigint[] = [];
  let at = 0n;
  for (const f of o.files) {
    offsets.push(at);
    bodies.push(f.data);
    at += BigInt(f.data.length);
  }
  const dirOffset = BigInt(fileBase) + at;
  header.writeBigUInt64LE(dirOffset, 32);

  const dir: Buffer[] = [];
  const count = Buffer.alloc(4);
  count.writeUInt32LE(o.count ?? o.files.length);
  dir.push(count);
  o.files.forEach((f, i) => {
    const raw = Buffer.from(f.path, "utf8");
    const padded = Buffer.alloc(Math.ceil((raw.length + 1) / 4) * 4);
    raw.copy(padded);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(padded.length);
    const rest = Buffer.alloc(8 + 8 + 16 + 4);
    rest.writeBigUInt64LE(i === 0 && o.badOffset !== undefined ? o.badOffset : offsets[i]!, 0);
    rest.writeBigUInt64LE(BigInt(f.data.length), 8);
    rest.fill(0xab, 16, 32);
    rest.writeUInt32LE(f.flags ?? 0, 32);
    dir.push(len, padded, rest);
  });

  let pck = Buffer.concat([header, Buffer.alloc(o.gap ?? 0, 0xee), ...bodies, ...dir]);
  if (o.truncate !== undefined) pck = pck.subarray(0, o.truncate);
  const file = path.join(tmp, name);
  fs.writeFileSync(file, pck);
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
