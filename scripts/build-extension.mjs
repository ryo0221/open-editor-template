import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportPaobubBuild } from './export-paobub.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const inlineCss = {
  name: 'editor-inline-css',
  setup(builder) {
    builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: path.relative(root, path.resolve(args.resolveDir, args.path.replace(/\?inline$/, ''))).split(path.sep).join('/'),
      namespace: 'editor-inline-css',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'editor-inline-css' }, async (args) => ({
      contents: await readFile(path.resolve(root, args.path), 'utf8'),
      loader: 'text',
      watchFiles: [path.resolve(root, args.path)],
    }));
  },
};

const importBytes = (bytes) =>
  import(`data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`);

/** Build only trusted local source. A consuming Host must choose its own trusted pin. */
export async function buildExtension({
  write = true,
  outDir = path.join(root, 'dist/extension'),
  paobubOutDir = path.resolve(outDir, '../paobub'),
} = {}) {
  const bundled = await build({
    absWorkingDir: root,
    entryPoints: ['src/extension.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    metafile: true,
    legalComments: 'inline',
    plugins: [inlineCss],
  });
  if (
    bundled.outputFiles.length !== 1 ||
    Object.values(bundled.metafile.outputs).some((output) => output.imports.length !== 0)
  ) {
    throw new Error('Extension must be a closed ESM bundle with no external imports.');
  }
  const entry = bundled.outputFiles[0].contents;
  // The package factory is trusted local build input; mounting is browser-only.
  const { definition } = await importBytes(entry);
  const localDefinition = definition(`sha256:${'0'.repeat(64)}`);
  const { packageHash: _ignored, ...manifest } = localDefinition.manifest;
  // Bundle the public TS helper as upstream's build does; Node never deep-imports
  // internal source or relies on workspace resolution/TypeScript transpilation.
  const helpers = await build({
    absWorkingDir: root,
    stdin: {
      contents:
        "export { describeExtensionPackage } from '@editor-platform/extension-runtime/package';",
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  });
  const { describeExtensionPackage } = await importBytes(helpers.outputFiles[0].contents);
  const files = [
    { path: 'entry.js', bytes: entry },
    { path: 'LICENSE', bytes: new Uint8Array(await readFile(path.join(root, 'LICENSE'))) },
    { path: 'NOTICE.txt', bytes: new Uint8Array(await readFile(path.join(root, 'NOTICE'))) },
  ];
  const prepared = await describeExtensionPackage({ manifest, entry: 'entry.js', files });
  const transport = {
    format: 'open-editor-template-package-1',
    packageHash: prepared.hash,
    manifest,
    entry: 'entry.js',
    files: prepared.files.map((file) => ({
      path: file.path,
      base64: Buffer.from(file.bytes).toString('base64'),
    })),
  };
  if (write) {
    await mkdir(outDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(transport, null, 2)}\n`),
      writeFile(
        path.join(outDir, 'descriptor.json'),
        `${JSON.stringify(prepared.descriptor, null, 2)}\n`,
      ),
      writeFile(
        path.join(outDir, 'trusted-pin.json'),
        `${JSON.stringify(
          {
            id: manifest.id,
            version: manifest.version,
            packageHash: prepared.hash,
          },
          null,
          2,
        )}\n`,
      ),
      ...prepared.files.map((file) => writeFile(path.join(outDir, file.path), file.bytes)),
    ]);
    await exportPaobubBuild({
      prepared,
      nativeContent: JSON.parse(await readFile(path.join(root, 'fixtures/example.json'), 'utf8')),
      validate: localDefinition.validate,
      outDir: paobubOutDir,
    });
  }
  return transport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const transport = await buildExtension();
  console.log(`Built ${transport.manifest.id}@${transport.manifest.version}`);
  console.log(`Package pin: ${transport.packageHash}`);
  console.log('Output: dist/extension/package.json (trust only a pin from your own review/build).');
  console.log('PaoBub setup: dist/paobub/ (Host trust is configured separately after review).');
}
