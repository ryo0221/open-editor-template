import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  describeExtensionPackage,
  loadVerifiedExtension,
  verifyExtensionPackage,
  type PackageManifest,
} from '@editor-platform/extension-runtime/package';
import {
  CARD_ARTIFACT_KIND,
  CARD_SCHEMA_VERSION,
  isCardDocument,
  type CardDocument,
} from '../src/model';
import { buildExtension } from '../scripts/build-extension.mjs';
import { exportPaobubBuild } from '../scripts/export-paobub.mjs';

interface PackageDocument {
  manifest: PackageManifest;
  entry: string;
  files: { path: string; base64: string }[];
}
let temporary: string;
let paobub: string;
let built: Awaited<ReturnType<typeof buildExtension>>;
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const packageInput = (document: PackageDocument) => ({
  manifest: document.manifest,
  entry: document.entry,
  files: document.files.map((file) => ({
    path: file.path,
    bytes: new Uint8Array(Buffer.from(file.base64, 'base64')),
  })),
});

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'editor-paobub-'));
  paobub = path.join(temporary, 'paobub');
  built = await buildExtension({ outDir: path.join(temporary, 'extension'), paobubOutDir: paobub });
}, 20_000);

afterAll(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

it('exports the same verified package, with native content and consistent PaoBub Project files', async () => {
  const pin = await readJson(path.join(paobub, 'host-pin.json'));
  const document: PackageDocument = await readJson(
    path.join(paobub, 'package-store', `${pin.id}@${pin.version}.json`),
  );
  expect(Object.keys(document).sort()).toEqual(['entry', 'files', 'manifest']);
  expect(document).toEqual({ manifest: built.manifest, entry: built.entry, files: built.files });
  expect(pin).toEqual({ id: built.manifest.id, version: built.manifest.version, hash: built.packageHash });
  expect(document.files.map((file) => file.path)).toEqual(
    expect.arrayContaining(['entry.js', 'LICENSE', 'NOTICE.txt']),
  );

  const input = packageInput(document);
  const prepared = await describeExtensionPackage(input);
  expect(prepared.hash).toBe(pin.hash);
  // This test approves its own local build. An absent Host approval must still refuse it.
  await expect(verifyExtensionPackage(input, () => undefined)).rejects.toThrow();
  const verified = await verifyExtensionPackage(input, (id, version) =>
    id === pin.id && version === pin.version ? pin.hash : undefined,
  );
  const loaded = await loadVerifiedExtension<CardDocument>(verified, {
    importModule: (bytes) =>
      import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`),
  });

  const bindings = await readJson(path.join(paobub, 'editor-binding.json'));
  const workflow = await readJson(path.join(paobub, 'project/workflow.json'));
  const definition = await readJson(path.join(paobub, 'definition.json'));
  const deliverable = definition.deliverables[0].id;
  const nativePath = workflow.deliverables[deliverable][0].path;
  const native = await readJson(path.join(paobub, 'project', nativePath));
  expect(workflow.definition).toEqual({ id: definition.id, version: definition.version });
  expect(workflow.editorBindings).toEqual(bindings);
  expect(bindings[deliverable]).toEqual({ editor: `ext:${pin.id}`, package: pin });
  expect(definition.phases[0].deliverables).toContain(deliverable);
  expect(workflow.deliverables[deliverable][0].as).toBe('plain');
  expect(native).toEqual(await readJson(path.join(process.cwd(), 'fixtures/example.json')));
  expect(native.artifactKind).toBe(CARD_ARTIFACT_KIND);
  expect(native.schemaVersion).toBe(CARD_SCHEMA_VERSION);
  expect(loaded.definition.validate(native)).toBe(true);
  expect(loaded.manifest.artifactKind).toBe(native.artifactKind);
  expect(loaded.manifest.schemaVersion).toBe(native.schemaVersion);
  expect(loaded.manifest.permissions).toEqual(['artifact:read', 'artifact:write']);
  expect(loaded.manifest.capabilities).not.toContain('selection');
  expect(await readJson(path.join(paobub, 'project', workflow.citations))).toEqual({
    citations: [], exemptions: [],
  });
  // Build output is not a Host trust store. No automatically usable allowlist is emitted.
  expect(await readdir(path.join(paobub, 'package-store'))).toEqual([`${pin.id}@${pin.version}.json`]);
  await expect(stat(path.join(paobub, 'trusted.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('refuses native data that the built Editor cannot reopen before writing Project files', async () => {
  const native = await readJson(path.join(process.cwd(), 'fixtures/example.json'));
  const outDir = path.join(temporary, 'invalid-export');
  const prepared = await describeExtensionPackage(packageInput(built));
  await expect(exportPaobubBuild({
    prepared,
    nativeContent: { ...native, schemaVersion: native.schemaVersion + 1 },
    validate: isCardDocument,
    outDir,
  })).rejects.toThrow('must match');
  await expect(stat(outDir)).rejects.toMatchObject({ code: 'ENOENT' });
});
