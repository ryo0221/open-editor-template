import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function projectId(value) {
  const id = value.replaceAll('.', '-');
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    throw new Error(`Use a lowercase dotted or hyphenated identity for the PaoBub sample: ${value}`);
  return id;
}

/**
 * Export a locally built package into PaoBub's existing H2 sample-B layout.
 * `prepared` is describeExtensionPackage's build result, never a received payload's hash.
 * These files propose a Project setup; they neither install code nor grant Host trust.
 * Source contract: ryo0221/paobub@83606171, tests/e2e/h2-samples.ts and
 * packages/framework/src/{definition,editor-bindings,repo}.ts.
 */
export async function exportPaobubBuild({ prepared, nativeContent, validate, outDir }) {
  const { manifest, entry } = prepared.descriptor;
  if (
    !validate(nativeContent) ||
    nativeContent.artifactKind !== manifest.artifactKind ||
    nativeContent.schemaVersion !== manifest.schemaVersion
  ) {
    throw new Error('The initial PaoBub native document must match the built Editor and its format.');
  }
  const deliverable = projectId(manifest.artifactKind);
  const nativePath = `docs/${deliverable}.json`;
  const phase = 'edit';
  const acceptance = `${phase}.saved`;
  const pin = { id: manifest.id, version: manifest.version, hash: prepared.hash };
  const editorBindings = { [deliverable]: { editor: `ext:${manifest.id}`, package: pin } };
  const definition = {
    format: 1,
    id: `${projectId(manifest.id)}-demo`,
    version: manifest.version,
    title: 'カードEditorを試す',
    purpose: '独立したEditor packageでカードを編集し、同じ成果物を保存して開き直す。',
    phases: [{
      id: phase,
      name: '編集',
      purpose: 'カードを編集して保存する。',
      after: [],
      deliverables: [deliverable],
      acceptance: [acceptance],
    }],
    deliverables: [{
      id: deliverable,
      name: 'カード',
      form: 'カード',
      outline: [{
        heading: 'カード',
        describe: `${manifest.artifactKind}@${manifest.schemaVersion} のカード本体。`,
      }],
    }],
    acceptance: [{
      id: acceptance,
      text: '編集結果を保存し、開き直して同じ内容とカードIDを確認する。',
      checkedBy: '人',
      target: deliverable,
    }],
  };
  const workflow = {
    format: 1,
    name: definition.title,
    definition: { id: definition.id, version: definition.version },
    citations: 'trace/citations.json',
    deliverables: { [deliverable]: [{ path: nativePath, as: 'plain' }] },
    editorBindings,
    phases: { [phase]: { state: '進行中' } },
    threads: [{ id: '編集', name: '編集', phases: [phase] }],
  };
  const packageDocument = {
    manifest,
    entry,
    files: prepared.files.map((file) => ({
      path: file.path,
      base64: Buffer.from(file.bytes).toString('base64'),
    })),
  };
  const files = {
    [`package-store/${manifest.id}@${manifest.version}.json`]: packageDocument,
    // A pin from this local build for the Host operator to review. No trusted.json
    // is emitted, and PAOBUB_EDITOR_PACKAGES is deliberately never consulted.
    'host-pin.json': pin,
    'editor-binding.json': editorBindings,
    'definition.json': definition,
    'project/workflow.json': workflow,
    [`project/${nativePath}`]: nativeContent,
    'project/trace/citations.json': { citations: [], exemptions: [] },
  };
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(outDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, json(value));
  }
  return { pin, deliverable, nativePath, definition, workflow };
}
