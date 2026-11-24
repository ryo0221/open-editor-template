// Independent shared distribution for protocol-2 Hosts. Emit pins separately for Host admission.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { inlineCss } from './build-extension.mjs';
const bundle = async (entry, define = {}) =>
  (
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      target: 'es2022',
      write: false,
      plugins: [inlineCss],
      define,
    })
  ).outputFiles[0].contents;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const codec = await bundle('src/shared-cards.ts');
const codecHash = 'sha256:' + sha(codec);
const ui = await bundle('src/shared-entry.ts', { SHARED_CODEC_HASH: JSON.stringify(codecHash) });
const { definition } = await import(
  'data:text/javascript;base64,' + Buffer.from(ui).toString('base64')
);
const { packageHash: _, ...manifest } = definition('').manifest;
const files = [
  { path: 'ui.js', bytes: ui },
  { path: 'codec.js', bytes: codec },
  ...(await Promise.all(
    ['LICENSE', 'NOTICE'].map(async (path) => ({ path, bytes: await readFile(path) })),
  )),
].sort((a, b) => (a.path < b.path ? -1 : 1));
const helpers = await build({
  stdin: {
    contents: "export {describeExtensionPackage} from '@editor-platform/extension-runtime/package'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { describeExtensionPackage } = await import(
  'data:text/javascript;base64,' + Buffer.from(helpers.outputFiles[0].contents).toString('base64')
);
const { hash: pin } = await describeExtensionPackage({ manifest, entry: 'ui.js', files });
const out = 'dist/shared';
await mkdir(out, { recursive: true });
await writeFile(
  out + '/package.json',
  JSON.stringify({
    manifest,
    entry: 'ui.js',
    files: files.map(({ path, bytes }) => ({
      path,
      base64: Buffer.from(bytes).toString('base64'),
    })),
  }),
);
await writeFile(
  out + '/pins.json',
  JSON.stringify({ id: manifest.id, version: manifest.version, packageHash: pin, codecHash }),
);
