#!/usr/bin/env node
// Reproduce the vendored SDK from one public commit. Node built-ins only.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'vendor/ep');
const pin = 'c5dcc2b70a6e8fc2de1c77e02d9f9855037803dd';
const repository = 'ryo0221/open-editor-platform';
const lock = JSON.parse(await readFile(path.join(vendor, 'provenance.json'), 'utf8'));
if (
  lock.format !== 'open-editor-template-vendor-1' ||
  lock.source.repository !== repository ||
  lock.source.commit !== pin ||
  lock.contractVersion !== '1.0.0-draft.1'
) {
  throw new Error('Unexpected provenance: expected the pinned public draft.1 snapshot.');
}
const args = process.argv.slice(2);
const mode = args[0] ?? '--check';
const sourceFlag = args.indexOf('--source');
const sourceDirectory = sourceFlag === -1 ? undefined : args[sourceFlag + 1];
if (
  !['--check', '--generate', '--restore'].includes(mode) ||
  (sourceFlag !== -1 && (mode !== '--restore' || sourceFlag !== 1 || !sourceDirectory)) ||
  args.length !== (sourceFlag === -1 ? (args.length === 0 ? 0 : 1) : 3)
) {
  throw new Error(
    'Usage: node scripts/vendor-sdk.mjs [--check | --generate | --restore [--source PUBLIC_CHECKOUT]]',
  );
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blobHash = (bytes) =>
  createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
const safeRelative = (value) => {
  if (
    typeof value !== 'string' ||
    value.startsWith('/') ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.split('/').some((part) => !part || part === '..' || part === '.')
  ) {
    throw new Error('Invalid vendored path: ' + value);
  }
};
const assertSource = (file, bytes) => {
  if (
    bytes.length !== file.byteLength ||
    digest(bytes) !== file.sha256 ||
    blobHash(bytes) !== file.gitBlobSha
  ) {
    throw new Error('Pinned upstream bytes differ: ' + file.upstreamPath);
  }
};
const sources = new Map();
const upstreamPaths = new Set();
for (const file of lock.files) {
  safeRelative(file.path);
  safeRelative(file.upstreamPath);
  if (sources.has(file.path) || upstreamPaths.has(file.upstreamPath)) {
    throw new Error('Duplicate source record: ' + file.path);
  }
  sources.set(file.path, file);
  upstreamPaths.add(file.upstreamPath);
}
if (mode === '--restore') {
  if (sourceDirectory) {
    const actual = execFileSync('git', ['rev-parse', pin + '^{commit}'], {
      cwd: sourceDirectory,
      encoding: 'utf8',
    }).trim();
    if (actual !== pin) throw new Error('The public checkout lacks the exact commit.');
  }
  const staged = [];
  for (const file of lock.files) {
    let bytes;
    if (sourceDirectory) {
      bytes = execFileSync('git', ['show', pin + ':' + file.upstreamPath], {
        cwd: sourceDirectory,
        maxBuffer: 2 * 1024 * 1024,
      });
    } else {
      const url =
        'https://raw.githubusercontent.com/' +
        repository +
        '/' +
        pin +
        '/' +
        file.upstreamPath.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error('Download failed (' + response.status + '): ' + file.upstreamPath);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    assertSource(file, bytes);
    staged.push([file.path, bytes]);
  }
  // All downloaded bytes pass before any source is replaced.
  for (const [relative, bytes] of staged) {
    const destination = path.join(vendor, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}
for (const file of lock.files) {
  assertSource(file, await readFile(path.join(vendor, file.path)));
}
const sourceUrl = 'https://github.com/' + repository + '/tree/' + pin;
const license = await readFile(path.join(vendor, 'LICENSE'));
const derived = new Map();
const packageNames = new Map(lock.packages.map((entry) => [entry.name, entry.directory]));
if (packageNames.size !== 5) throw new Error('Expected the five reviewed SDK packages.');
for (const entry of lock.packages) {
  safeRelative(entry.directory);
  const original = JSON.parse(
    await readFile(path.join(vendor, 'upstream-manifests', entry.directory + '.json'), 'utf8'),
  );
  if (original.name !== entry.name) throw new Error('Package name differs from upstream.');
  const upstreamExports =
    typeof original.exports === 'string' ? { '.': original.exports } : original.exports;
  const exports = {};
  for (const key of entry.exports) {
    const target = upstreamExports[key];
    if (
      typeof target !== 'string' ||
      !target.startsWith('./src/') ||
      !sources.has('packages/' + entry.directory + '/' + target.slice(2))
    ) {
      throw new Error('Unknown public entrypoint: ' + entry.name + '/' + key);
    }
    exports[key] = target;
  }
  const dependencies = {};
  for (const dependency of Object.keys(original.dependencies ?? {})) {
    const directory = packageNames.get(dependency);
    if (!directory) throw new Error('Non-vendored SDK dependency: ' + dependency);
    dependencies[dependency] = 'file:../' + directory;
  }
  const manifest = {
    name: original.name,
    version: original.version,
    private: true,
    type: 'module',
    description: 'Pinned public Open Editor Platform source subset for the editor template',
    license: 'AGPL-3.0-only',
    repository: {
      type: 'git',
      url: 'https://github.com/' + repository + '.git',
      directory: 'packages/' + entry.directory,
    },
    exports,
    files: ['src', 'LICENSE', 'NOTICE.md'],
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
    openEditorTemplateVendor: {
      sourceCommit: pin,
      packagingModified: '2026-11-16',
      originalManifest: '../../upstream-manifests/' + entry.directory + '.json',
    },
  };
  const directory = 'packages/' + entry.directory + '/';
  derived.set(directory + 'package.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  derived.set(directory + 'LICENSE', license);
  derived.set(
    directory + 'NOTICE.md',
    Buffer.from(
      [
        '# Open Editor Platform source notice',
        '',
        'Upstream: ' + sourceUrl + '/packages/' + entry.directory,
        '',
        'Package: ' + entry.name + '@' + original.version,
        '',
        'Source in src/ is copied byte for byte from the public commit above. The unmodified',
        'GNU AGPLv3 text is in LICENSE. The upstream release declares AGPL-3.0-only.',
        '',
        'Packaging modifications by Open Editor Template on 2026-11-16: package.json exposes',
        'only the reviewed public entrypoints, replaces wildcard dependencies with sibling',
        'file dependencies, removes development dependencies, and adds license/provenance',
        'metadata. No upstream implementation was changed.',
        '',
        'Original manifests, per-file Git blob and SHA-256 hashes, upstream license guidance,',
        'and complete upstream runtime notices are retained in vendor/ep in the template.',
        'The runtime notices cover the full upstream repository; the five SDK packages here',
        'do not include those external runtime libraries. No draft additional permission is granted.',
        '',
      ].join('\n'),
    ),
  );
}
derived.set(
  'README.md',
  Buffer.from(
    [
      '# Vendored public Editor Platform SDK',
      '',
      'Source: [' + repository + '@' + pin.slice(0, 7) + '](' + sourceUrl + ').',
      'Runtime contract: 1.0.0-draft.1.',
      '',
      'These are actual unchanged upstream TypeScript implementations. The five packages',
      'are installed with local file dependencies and require no platform checkout, private',
      'repository access, unpublished registry packages, or workspace configuration.',
      'Consumers use declared @editor-platform package entrypoints. Vite/esbuild/tsx handle',
      'the TypeScript; these are not precompiled packages for direct Node.js imports.',
      '',
      '| Package | Included public entrypoints |',
      '| --- | --- |',
      ...lock.packages.map((entry) => '| ' + entry.name + ' | ' + entry.exports.join(', ') + ' |'),
      '',
      'Only the source closure of those exports is retained. Draft2, controlled, schema',
      'experiments, and package retention are not exposed. Original package manifests are',
      'under upstream-manifests. Generated manifests record the packaging changes and date.',
      'provenance.json records every copied file with its public path, Git blob SHA, SHA-256',
      'and byte length. Implementation source files are unchanged.',
      '',
      '## Reproduce and verify',
      '',
      'Run from the template root. These commands use Node built-ins, before or after npm ci.',
      '',
      '    node scripts/vendor-sdk.mjs --check',
      '    node scripts/vendor-sdk.mjs --generate',
      '    node scripts/vendor-sdk.mjs --restore',
      '    node scripts/vendor-sdk.mjs --restore --source /path/to/open-editor-platform',
      '',
      '--check verifies all copied bytes, generated manifests, legal copies, and the file',
      'inventory. It rejects unexpected files and symlinks. --generate first verifies the',
      'retained source, then recreates package metadata and per-package legal files.',
      '--restore reads only the fixed public commit (from GitHub or a local public checkout),',
      'validates every downloaded byte before writing, and recreates the same result.',
      'It never follows a moving branch or adopts new dependencies. Normal development',
      'and CI use committed files and do not contact GitHub.',
      '',
      '## License and notices',
      '',
      'The upstream release declares AGPL-3.0-only. LICENSE, LICENSE-SCOPE.md, LICENSE-GUIDE.md,',
      'dual-licensing and draft additional-permission documents, docs/legal/NOTICE.ja.md,',
      'and docs/third-party/RUNTIME-NOTICES.txt are preserved unchanged. The runtime notice',
      'file covers the full upstream inventory, including libraries absent from this subset.',
      'The additional permission is an upstream non-operative draft. Follow the public',
      'source links for related upstream documents outside this minimal copy.',
      '',
    ].join('\n'),
  ),
);
for (const [relative, bytes] of derived) {
  const destination = path.join(vendor, relative);
  if (mode === '--generate' || mode === '--restore') {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  } else if (!(await readFile(destination)).equals(bytes)) {
    throw new Error('Generated vendor file differs: ' + relative);
  }
}
const expected = new Set([...sources.keys(), ...derived.keys(), 'provenance.json']);
async function inventory(directory, prefix = '') {
  for (const entry of await readdir(directory)) {
    const relative = prefix + entry;
    const absolute = path.join(directory, entry);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error('Symlink in vendor source: ' + relative);
    if (info.isDirectory()) await inventory(absolute, relative + '/');
    else if (!info.isFile() || !expected.delete(relative)) {
      throw new Error('Unexpected vendor file: ' + relative);
    }
  }
}
await inventory(vendor);
if (expected.size) throw new Error('Missing vendor files: ' + [...expected].join(', '));
console.log(
  'Verified ' +
    lock.files.length +
    ' upstream files and ' +
    lock.packages.length +
    ' source packages at public commit ' +
    pin +
    ' (' +
    lock.contractVersion +
    ').',
);
