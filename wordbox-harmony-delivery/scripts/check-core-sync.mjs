/**
 * CI gate: verify the Harmony `ets/core` mirror is byte-identical to the
 * mechanical projection of `core/src`, and that `core-manifest.json` is current.
 * Any manual edit of a mirror file, missing mirror, stale manifest, or extra
 * `.ets` file makes the command print diagnostics and exit with code 1.
 */
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_PATH, MIRROR_ROOT, PROJECT_ROOT, listCoreSources, listMirrorFiles,
  mirrorAbs, mirrorRelOf, expectedMirrorContent, readSource, sha256,
  serializeManifest, buildManifest, isFile, toPosix,
} from './gen-core-manifest.mjs';

function readTextOrUndefined(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

/** Run all consistency checks; returns a list of human-readable problems. */
export function checkCoreSync() {
  const problems = [];
  const sources = listCoreSources();
  const expectedRels = new Set(sources.map(mirrorRelOf));

  // 1) Manifest must exist and match a freshly computed deterministic build.
  const manifestText = readTextOrUndefined(MANIFEST_PATH);
  if (manifestText === undefined) {
    problems.push('core-manifest.json is missing — run `npm run sync:core`');
  }
  const freshText = serializeManifest(buildManifest());
  if (manifestText !== undefined && manifestText !== freshText) {
    problems.push('core-manifest.json is stale or hand-edited — run `npm run sync:core`');
  }

  // 2) Every source must have a mirror whose bytes equal header + source.
  for (const rel of sources) {
    const destination = mirrorAbs(rel);
    if (!isFile(destination)) {
      problems.push('missing mirror: ' + toPosix(relative(PROJECT_ROOT, destination)));
      continue;
    }
    const actual = readTextOrUndefined(destination);
    const expected = expectedMirrorContent(rel, readSource(rel));
    if (actual !== expected) {
      problems.push('mirror drift / manual edit: ' + toPosix(relative(PROJECT_ROOT, destination))
        + ' (sha256=' + sha256(actual ?? '') + ')');
    }
  }

  // 3) No stray `.ets` files are allowed in the generated mirror directory.
  for (const rel of listMirrorFiles()) {
    if (!expectedRels.has(rel)) {
      problems.push('stray mirror file (not in core/src): ' + toPosix(join(MIRROR_ROOT, ...rel.split('/'))));
    }
  }

  return { problems, sourceCount: sources.length, mirrorCount: listMirrorFiles().length };
}

const invoked = process.argv.length > 1 ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  const result = checkCoreSync();
  if (result.problems.length > 0) {
    process.stderr.write('[check:core-sync] FAILED — ' + String(result.problems.length) + ' problem(s):\n');
    for (const problem of result.problems) process.stderr.write('  - ' + problem + '\n');
    process.stderr.write('Fix: `npm run sync:core` (never edit harmony/.../ets/core by hand).\n');
    process.exit(1);
  }
  process.stdout.write(
    '[check:core-sync] OK — ' + String(result.sourceCount) + ' core/src files, '
    + String(result.mirrorCount) + ' mirrored .ets files, manifest current.\n'
    + '[check:core-sync] Track A (core), Track B (Harmony mirror) and Track C '
    + '(Vite alias) share one kernel.\n',
  );
}
