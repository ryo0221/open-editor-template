// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { EditorSession } from '@editor-platform/editor-core';
import { ExtensionRegistry } from '@editor-platform/extension-runtime';
import {
  installVerifiedExtension,
  loadVerifiedExtension,
  verifyExtensionPackage,
  type LoadedExtension,
} from '@editor-platform/extension-runtime/package';
import { createDocument, type CardDocument } from '../src/model';
import { updateCard } from '../src/commands';

// DOM/event coverage, not a substitute for PaoBub's real-browser integration.
// The test uses the real registry/EditorSession; only jsdom's native dialog gaps
// are filled. PaoBub supplies these same read/write permissions and keeps a
// mounted Surface alive when its Host history or public operations change data.
let loaded: LoadedExtension<CardDocument>;
let cleanup: (() => void) | undefined;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

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
  const built = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    "const { buildExtension } = await import('./scripts/build-extension.mjs'); process.stdout.write(JSON.stringify(await buildExtension({ write: false })));",
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 20_000 }));
  const verified = await verifyExtensionPackage({
    manifest: built.manifest,
    entry: built.entry,
    files: built.files.map((file: { path: string; base64: string }) => ({
      path: file.path, bytes: new Uint8Array(Buffer.from(file.base64, 'base64')),
    })),
  }, (id, version) =>
    id === built.manifest.id && version === built.manifest.version ? built.packageHash : undefined,
  );
  loaded = await loadVerifiedExtension<CardDocument>(verified, {
    importModule: (bytes) =>
      import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`),
  });
}, 20_000);

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  document.body.replaceChildren();
});

afterAll(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
});

function setup() {
  vi.useFakeTimers();
  const registration = installVerifiedExtension(new ExtensionRegistry(), loaded);
  const content = createDocument([
    { id: 'first', title: '最初', description: '説明を維持', color: 'blue' },
    { id: 'second', title: '次', description: '', color: 'green' },
  ]);
  const session = new EditorSession(content);
  const handle = registration.open({
    artifactKind: content.artifactKind,
    schemaVersion: content.schemaVersion,
    allowed: (permission) => permission === 'artifact:read' || permission === 'artifact:write',
    readOnly: () => false,
    read: () => session.content,
    execute: (command) => session.execute(command),
    undo: () => session.undo(),
    redo: () => session.redo(),
    save: async () => {},
    select: () => { throw new Error('This Host does not provide selection.'); },
  });
  const container = document.createElement('div');
  document.body.append(container);
  handle.mount(container);
  cleanup = () => { handle.close(); registration.uninstall(); };
  const titles = () => [...container.querySelectorAll('[role="listitem"] h3')].map((node) => node.textContent);
  return { session, handle, container, titles };
}

function button(container: ParentNode, name: string) {
  const found = [...container.querySelectorAll('button')].find((node) =>
    (node.getAttribute('aria-label') ?? node.textContent) === name,
  );
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}

it('refreshes the mounted bundle after Host Undo/Redo and public operations, and stops on close', () => {
  const { session, handle, container, titles } = setup();
  expect(titles()).toEqual(['最初', '次']);
  expect(container.querySelector('.ep-card-select')).toBeNull();
  session.execute(updateCard('first', { title: '外部からの変更' }));
  vi.advanceTimersByTime(200);
  expect(titles()).toEqual(['外部からの変更', '次']);
  handle.api.undo();
  vi.advanceTimersByTime(200);
  expect(titles()).toEqual(['最初', '次']);
  handle.api.redo();
  vi.advanceTimersByTime(200);
  expect(titles()).toEqual(['外部からの変更', '次']);
  handle.operations!.prepare({ id: 'rename-card', version: '1.0.0' }, {
    id: 'first', before: '外部からの変更', title: '採用した提案',
  }).commit();
  vi.advanceTimersByTime(200);
  expect(titles()).toEqual(['採用した提案', '次']);
  handle.close();
  expect(container.childElementCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves a pending modal during Host changes and refuses overwriting a changed target', () => {
  const { session, container, titles } = setup();
  button(container, '「最初」を編集').click();
  const dialog = container.querySelector('dialog')!;
  const input = dialog.querySelector<HTMLInputElement>('[name="title"]')!;
  input.value = 'まだ適用していない入力';
  session.execute(updateCard('second', { title: 'ほかのカードの変更' }));
  vi.advanceTimersByTime(200);
  expect(titles()).toEqual(['最初', 'ほかのカードの変更']);
  expect(container.querySelector('dialog')).toBe(dialog);
  expect(dialog.open).toBe(true);
  expect(input.value).toBe('まだ適用していない入力');
  session.execute(updateCard('first', { title: '新しい正本' }));
  vi.advanceTimersByTime(200);
  button(dialog, '変更を適用').click();
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('編集中に変更');
  expect(input.value).toBe('まだ適用していない入力');
  expect(session.content.cards[0].title).toBe('新しい正本');
  button(dialog, 'キャンセル').click();
  expect(container.querySelector('dialog')).toBeNull();
});
