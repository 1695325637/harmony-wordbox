/**
 * Mechanical mirror: every TypeScript file under `core/src` is projected into
 * `harmony/entry/src/main/ets/core` with the same tree and an `.ets` extension.
 *
 * Each mirror file = a fixed generated-file header + the UNCHANGED source
 * bytes (business bytes are byte-identical; only the extension and a comment
 * header differ). Then `core-manifest.json` is regenerated deterministically.
 * Running the script twice produces identical output (idempotent).
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIRROR_ROOT, PROJECT_ROOT, listCoreSources, mirrorAbs, mirrorRelOf,
  expectedMirrorContent, readSource, writeManifest, listMirrorFiles, toPosix,
} from './gen-core-manifest.mjs';

function readFileIfExists(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

/** Regenerate the whole Harmony core mirror and the manifest. */
export function syncCore() {
  const sources = listCoreSources();
  const expectedMirrorRels = new Set(sources.map(mirrorRelOf));

  // Remove stale mirror files whose source no longer exists.
  for (const rel of listMirrorFiles()) {
    if (!expectedMirrorRels.has(rel)) {
      rmSync(join(MIRROR_ROOT, ...rel.split('/')), { force: true });
    }
  }

  let written = 0;
  for (const rel of sources) {
    const text = readSource(rel);
    const content = expectedMirrorContent(rel, text);
    const destination = mirrorAbs(rel);
    mkdirSync(dirname(destination), { recursive: true });
    const existing = readFileIfExists(destination);
    if (existing !== content) {
      writeFileSync(destination, content, 'utf8');
      written += 1;
    }
  }

  const manifest = writeManifest();
  return { sources: sources.length, written, manifest };
}

const invoked = process.argv.length > 1 ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  const result = syncCore();
  process.stdout.write(
    '[sync:core] mirrored ' + String(result.sources) + ' core/src files -> '
    + toPosix(relative(PROJECT_ROOT, MIRROR_ROOT)) + '/\n'
    + '[sync:core] wrote/updated ' + String(result.written) + ' .ets file(s); '
    + String(result.manifest.fileCount) + ' entries in core-manifest.json\n'
    + '[sync:core] business bytes unchanged; generated header only. Idempotent.\n',
  );
}
