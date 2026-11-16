// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createArtifact, MemoryStorage, type Artifact } from '@editor-platform/artifact-core';
import { ExtensionRegistry } from '@editor-platform/extension-runtime';
import {
  installVerifiedExtension,
  loadVerifiedExtension,
  verifyExtensionPackage,
  type LoadedExtension,
} from '@editor-platform/extension-runtime/package';
import { createLocalHost } from '../dev/host';
import { createDocument, type Card, type CardDocument } from '../src/model';

// jsdom checks DOM/events here, not native modal behavior, focus trapping or layout.
// Its missing dialog methods are the only UI polyfill; editing uses the real SDK.
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let loaded: LoadedExtension<CardDocument>;
const cleanups: Array<() => void> = [];

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
  // esbuild is a Node build tool. Run the real build in Node, outside jsdom's
  // alternate typed-array realm, then verify its bytes in this test environment.
  const built = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    "const { buildExtension } = await import('./scripts/build-extension.mjs'); process.stdout.write(JSON.stringify(await buildExtension({ write: false })));",
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 }));
  const verified = await verifyExtensionPackage({
    manifest: built.manifest,
    entry: built.entry,
    files: built.files.map((file: { path: string; base64: string }) => ({
      path: file.path,
      bytes: new Uint8Array(Buffer.from(file.base64, 'base64')),
    })),
  }, (id, version) => id === built.manifest.id && version === built.manifest.version ? built.packageHash : undefined);
  loaded = await loadVerifiedExtension<CardDocument>(verified, {
    importModule: (bytes) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`),
  });
}, 15_000);

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.replaceChildren();
});

afterAll(() => {
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
});

function setup(cards: Card[] = []) {
  const registration = installVerifiedExtension(new ExtensionRegistry(), loaded);
  const artifact = createArtifact(registration.manifest.artifactKind, 'Surface test', createDocument(cards));
  const host = createLocalHost(registration, artifact, new MemoryStorage<Artifact<CardDocument>>());
  const container = document.createElement('div');
  document.body.append(container);
  host.handle.mount(container);
  const unmount = () => host.handle.close();
  cleanups.push(() => {
    unmount();
    host.close(true);
    registration.uninstall();
  });
  return { host, container, unmount };
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((item) =>
    (item.getAttribute('aria-label') ?? item.textContent) === name,
  );
  if (!found) throw new Error(`Button not found: ${name}`);
  return found;
}

function field<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  dialog: HTMLDialogElement,
  name: string,
  value: string,
) {
  const input = dialog.querySelector<T>(`[name="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function unloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const firstCard: Card = { id: 'first', title: '最初のカード', description: '説明', color: 'blue' };

describe('DOM Surface with the actual EP Host', () => {
  it('adds and edits through modal submission while preserving the stable ID', () => {
    const { host, container } = setup();
    button(container, '＋ 候補を追加').click();
    let dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    field(dialog, 'title', '制作メモ 🌱');
    field(dialog, 'description', '人とAIで作る');
    field(dialog, 'color', 'green');
    button(dialog, '候補を追加').click();
    expect(container.querySelector('dialog')).toBeNull();
    expect(host.editor.content.cards).toHaveLength(1);
    const id = host.editor.content.cards[0].id;
    expect(host.editor.content.cards[0]).toMatchObject({ title: '制作メモ 🌱', description: '人とAIで作る', color: 'green' });
    expect(container.querySelector('tbody tr[data-card-id] h3')?.textContent).toBe('制作メモ 🌱');
    button(container, '「制作メモ 🌱」を編集').click();
    dialog = container.querySelector('dialog')!;
    field(dialog, 'title', '次のアイデア');
    button(dialog, '変更を適用').click();
    expect(host.editor.content.cards[0]).toMatchObject({ id, title: '次のアイデア' });
    expect(container.querySelector('tbody tr[data-card-id] h3')?.textContent).toBe('次のアイデア');
    expect(host.editor.canUndo).toBe(true);
  });

  it('keeps invalid Unicode input in the dialog and accepts the documented code point limit', () => {
    const { host, container } = setup([firstCard]);
    button(container, '「最初のカード」を編集').click();
    const dialog = container.querySelector('dialog')!;
    const before = host.editor.snapshot;
    field(dialog, 'title', '🌱'.repeat(81));
    button(dialog, '変更を適用').click();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('1〜80文字');
    expect(host.editor.snapshot).toEqual(before);
    field(dialog, 'title', '🌱'.repeat(80));
    button(dialog, '変更を適用').click();
    expect(container.querySelector('dialog')).toBeNull();
    expect(host.editor.content.cards[0].title).toBe('🌱'.repeat(80));
  });

  it('refuses a DOM edit when the Host is read-only and retains both data and the pending form', () => {
    const { host, container } = setup([firstCard]);
    button(container, '「最初のカード」を編集').click();
    const dialog = container.querySelector('dialog')!;
    field(dialog, 'title', '権限のない変更');
    host.setReadOnly(true);
    const before = host.editor.snapshot;
    button(dialog, '変更を適用').click();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toMatch(/Permission denied/);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe('権限のない変更');
    expect(host.editor.snapshot).toEqual(before);
    button(dialog, 'キャンセル').click();
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('guards pending modal input and removes that guard on cancel and Surface cleanup', () => {
    const { host, container, unmount } = setup();
    button(container, '＋ 候補を追加').click();
    let dialog = container.querySelector('dialog')!;
    expect(unloadPrevented()).toBe(false);
    field(dialog, 'title', '未確定の入力');
    expect(unloadPrevented()).toBe(true);
    button(dialog, 'キャンセル').click();
    expect(unloadPrevented()).toBe(false);
    expect(host.editor.content.cards).toEqual([]);
    button(container, '＋ 候補を追加').click();
    dialog = container.querySelector('dialog')!;
    field(dialog, 'description', '破棄する入力');
    expect(unloadPrevented()).toBe(true);
    unmount();
    expect(container.childElementCount).toBe(0);
    expect(unloadPrevented()).toBe(false);
    expect(host.editor.content.cards).toEqual([]);
  });
});
