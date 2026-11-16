#!/usr/bin/env node
// Exercise npm's real local-package install without a platform checkout or network.
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [path.join(root, 'scripts/vendor-sdk.mjs'), '--check'], {
  stdio: 'pipe',
});
const provenance = JSON.parse(await readFile(path.join(root, 'vendor/ep/provenance.json'), 'utf8'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'open-editor-sdk-'));
try {
  await cp(path.join(root, 'vendor'), path.join(temporary, 'vendor'), { recursive: true });
  await writeFile(
    path.join(temporary, 'package.json'),
    JSON.stringify(
      {
        name: 'isolated-editor-sdk-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          provenance.packages.map((entry) => [
            entry.name,
            'file:vendor/ep/packages/' + entry.directory,
          ]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  const options = {
    cwd: temporary,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: '' },
    maxBuffer: 2 * 1024 * 1024,
    stdio: 'pipe',
  };
  const offline = [
    '--ignore-scripts',
    '--offline',
    '--no-audit',
    '--no-fund',
    '--cache',
    path.join(temporary, 'empty-cache'),
  ];
  execFileSync('npm', ['install', '--package-lock-only', ...offline], options);
  execFileSync('npm', ['ci', ...offline], options);
  const allowed = provenance.packages.flatMap((entry) =>
    entry.exports.map((key) => entry.name + (key === '.' ? '' : key.slice(1))),
  );
  const forbidden = [
    '@editor-platform/artifact-core/src/index.ts',
    '@editor-platform/editor-core/src/index.ts',
    '@editor-platform/extension-contract/draft2',
    '@editor-platform/extension-runtime/src/index.ts',
    '@editor-platform/extension-runtime/draft2',
    '@editor-platform/extension-runtime/controlled',
    '@editor-platform/extension-runtime/package-store',
  ];
  const probe =
    [
      'const allowed = ' + JSON.stringify(allowed) + ';',
      'const forbidden = ' + JSON.stringify(forbidden) + ';',
      "const prefix = new URL('./vendor/ep/packages/', import.meta.url).href;",
      'for (const name of allowed) {',
      '  if (!import.meta.resolve(name).startsWith(prefix)) throw Error("Resolution escaped consumer: " + name);',
      '}',
      'for (const name of forbidden) {',
      '  let refused = false;',
      '  try { import.meta.resolve(name); }',
      '  catch (error) { refused = error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"; }',
      '  if (!refused) throw Error("Unexpected export: " + name);',
      '}',
    ].join('\n') + '\n';
  await writeFile(path.join(temporary, 'probe.mjs'), probe);
  execFileSync(process.execPath, ['probe.mjs'], options);
  // npm must not leave additional files or dependencies in the retained source tree.
  await cp(path.join(root, 'scripts'), path.join(temporary, 'scripts'), {
    recursive: true,
    filter: (source) =>
      source === path.join(root, 'scripts') || source === path.join(root, 'scripts/vendor-sdk.mjs'),
  });
  execFileSync(process.execPath, ['scripts/vendor-sdk.mjs', '--check'], options);
  await rm(temporary, { recursive: true });
  console.log(
    'PASS: offline npm ci with five local SDK packages; ' +
      allowed.length +
      ' public entrypoints resolve only inside the consumer; ' +
      forbidden.length +
      ' private or unselected imports are refused.',
  );
} catch (error) {
  console.error('SDK isolation check failed. Inspect ' + temporary);
  if (error.stdout) console.error(String(error.stdout));
  if (error.stderr) console.error(String(error.stderr));
  throw error;
}
