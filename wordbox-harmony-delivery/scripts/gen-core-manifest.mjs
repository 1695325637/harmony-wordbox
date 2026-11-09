/**
 * Shared helpers + CLI for the deterministic `core-manifest.json`.
 *
 * The manifest maps every TypeScript source file under `core/src` to its
 * sha256 and to the sha256 of the EXACT mirror bytes that `sync-core.mjs`
 * produces. Output is byte-for-byte deterministic: sorted keys, fixed header,
 * no timestamps.
 * This module is imported by `sync-core.mjs` and `check-core-sync.mjs`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..');
export const SOURCE_ROOT = join(PROJECT_ROOT, 'core', 'src');
export const MIRROR_ROOT = join(PROJECT_ROOT, 'harmony', 'entry', 'src', 'main', 'ets', 'core');
export const MANIFEST_PATH = join(PROJECT_ROOT, 'core-manifest.json');
export const MANIFEST_VERSION = 1;
export const ALGORITHM = 'sha256';

/** Deterministic first lines of every generated mirror file. */
export const MIRROR_HEADER_LINES = [
  '// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.',
  '// Mechanical mirror of core/src produced by scripts/sync-core.mjs.',
  '// Edit the source under core/src/ then run `npm run sync:core`.',
  '// Verified by `npm run check:core-sync`. Business bytes are unchanged.',
];

/** Convert a path to a POSIX-style relative key (portable across OSes). */
export function toPosix(path) {
  return path.split(sep).join('/');
}

/** Recursively list all `.ts` sources under `core/src`, sorted, POSIX-relative. */
export function listCoreSources() {
  const out = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(toPosix(relative(SOURCE_ROOT, full)));
      }
    }
  };
  walk(SOURCE_ROOT);
  out.sort();
  return out;
}

/** sha256 of a string or Buffer. */
export function sha256(input) {
  return createHash(ALGORITHM).update(input).digest('hex');
}

/** Absolute path of a source file given its POSIX-relative key. */
export function sourceAbs(rel) {
  return join(SOURCE_ROOT, ...rel.split('/'));
}

/** The mirror relative key for a source key (`x.ts` -> `x.ets`). */
export function mirrorRelOf(rel) {
  return rel.slice(0, -'.ts'.length) + '.ets';
}

/** Absolute path of the mirror file for a source key. */
export function mirrorAbs(rel) {
  return join(MIRROR_ROOT, ...mirrorRelOf(rel).split('/'));
}

/** The exact bytes `sync-core.mjs` writes for a given source key. */
export function expectedMirrorContent(rel, sourceText) {
  const header = MIRROR_HEADER_LINES.join('\n') + '\n// Source: core/src/' + rel + '\n\n';
  return header + sourceText;
}

/** Read a source file as UTF-8 text. */
export function readSource(rel) {
  return readFileSync(sourceAbs(rel), 'utf8');
}

/** Build the complete deterministic manifest object. */
export function buildManifest() {
  const files = {};
  for (const rel of listCoreSources()) {
    const text = readSource(rel);
    const mirrorContent = expectedMirrorContent(rel, text);
    files['core/src/' + rel] = {
      sha256: sha256(text),
      mirror: toPosix(relative(PROJECT_ROOT, mirrorAbs(rel))),
      mirrorSha256: sha256(mirrorContent),
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  }
  return {
    version: MANIFEST_VERSION,
    generator: 'scripts/gen-core-manifest.mjs',
    algorithm: ALGORITHM,
    sourceRoot: 'core/src',
    mirrorRoot: 'harmony/entry/src/main/ets/core',
    fileCount: Object.keys(files).length,
    files,
  };
}

/** Serialize a manifest deterministically (stable key order + trailing NL). */
export function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

/** Write `core-manifest.json` and return the manifest object. */
export function writeManifest(manifest = buildManifest()) {
  writeFileSync(MANIFEST_PATH, serializeManifest(manifest), 'utf8');
  return manifest;
}

/** Recursively list all `.ets` files under the mirror root (POSIX-relative). */
export function listMirrorFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.ets')) {
        out.push(toPosix(relative(MIRROR_ROOT, full)));
      }
    }
  };
  walk(MIRROR_ROOT);
  out.sort();
  return out;
}

/** True when `p` exists and is a regular file. */
export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// CLI entry: regenerate the manifest from the current core/src tree.
const invoked = process.argv.length > 1 ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  const manifest = writeManifest();
  process.stdout.write(
    '[gen:manifest] core-manifest.json written: ' + String(manifest.fileCount)
    + ' core/src files hashed (' + ALGORITHM + ').\n',
  );
}
