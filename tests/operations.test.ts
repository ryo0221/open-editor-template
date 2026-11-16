import { EditorSession } from '@editor-platform/editor-core';
import {
  CONTRACT_VERSION,
  OPERATIONS_ADDON,
  type ExtensionDefinition,
} from '@editor-platform/extension-contract';
import {
  ExtensionRegistry,
  operationDeclarationProblems,
  operationInputProblems,
} from '@editor-platform/extension-runtime';
import { describe, expect, it } from 'vitest';
import { removeCard, updateCard } from '../src/commands';
import {
  CARD_ARTIFACT_KIND,
  CARD_SCHEMA_VERSION,
  createDocument,
  isCardDocument,
  type CardDocument,
} from '../src/model';
import { operationDeclarations, operations, renameCardOperation } from '../src/operations';

const operationRef = { id: renameCardOperation.id, version: renameCardOperation.version };
const input = { id: 'card-a', before: '元の名前', title: '新しい名前' };
const initial = (): CardDocument =>
  createDocument([
    { id: 'card-a', title: '元の名前', description: '説明を保つ', color: 'amber' },
    { id: 'card-b', title: 'ほかのカード', description: '別の説明', color: 'green' },
  ]);

/** Exercise the vendored EP registry and history, not a fake operations implementation. */
function fixture() {
  const packageHash = `sha256:${'4'.repeat(64)}`;
  const definition: ExtensionDefinition<CardDocument> = {
    manifest: {
      contractVersion: CONTRACT_VERSION,
      id: 'example.cards-test',
      version: '0.0.1',
      artifactKind: CARD_ARTIFACT_KIND,
      schemaVersion: CARD_SCHEMA_VERSION,
      packageHash,
      capabilities: ['local-edit'],
      permissions: ['artifact:read', 'artifact:write'],
      licenseNotices: [],
      addons: { operations: { version: OPERATIONS_ADDON, declarations: operationDeclarations } },
    },
    validate: isCardDocument,
    operations,
  };
  const session = new EditorSession(initial());
  const registration = new ExtensionRegistry().install(definition, {
    trust: 'trusted',
    verifiedPackageHash: packageHash,
  });
  const handle = registration.open({
    artifactKind: definition.manifest.artifactKind,
    schemaVersion: CARD_SCHEMA_VERSION,
    allowed: () => true,
    readOnly: () => false,
    read: () => session.content,
    execute: (edit) => {
      session.execute(edit);
    },
    undo: () => {
      session.undo();
    },
    redo: () => {
      session.redo();
    },
    save: async () => {},
    select: () => {},
  });
  const state = () => ({
    content: session.content,
    revision: session.revision,
    undo: session.canUndo,
    redo: session.canRedo,
    proposals: session.proposalTransactions,
  });
  return { session, handle, state };
}

describe('rename-card through the EP operations contract', () => {
  it('declares a bounded schema accepted by the real runtime and rejects undeclared input', () => {
    expect(
      operationDeclarationProblems({
        version: OPERATIONS_ADDON,
        declarations: operationDeclarations,
      }),
    ).toEqual([]);
    expect(operationInputProblems(operationDeclarations, operationRef, input)).toEqual([]);
    expect(
      operationInputProblems(operationDeclarations, operationRef, {
        ...input,
        title: '😀'.repeat(80),
      }),
    ).toEqual([]);
    for (const value of [
      { ...input, extra: true },
      { ...input, title: 'x'.repeat(81) },
      { ...input, id: 5 },
    ])
      expect(
        operationInputProblems(operationDeclarations, operationRef, value).length,
      ).toBeGreaterThan(0);
    expect(
      operationInputProblems(operationDeclarations, { ...operationRef, version: '2.0.0' }, input)
        .length,
    ).toBeGreaterThan(0);
  });

  it('produces the same edit as the UI, commits once and supports native Undo/Redo', () => {
    const { handle, session } = fixture();
    const expected = updateCard(input.id, { title: input.title }).apply(initial());
    const prepared = handle.operations!.prepare(operationRef, input);
    expect(session.content).toEqual(initial());
    expect(prepared.candidate).toEqual(expected);
    expect(prepared.candidate).toMatchObject({
      artifactKind: CARD_ARTIFACT_KIND,
      schemaVersion: CARD_SCHEMA_VERSION,
    });
    prepared.commit({ origin: 'proposal', transactionId: 'reviewed-rename' });
    expect(session.content).toEqual(expected);
    expect(session.proposalTransactions).toEqual(['reviewed-rename']);
    expect(() => prepared.commit()).toThrow('Operation already committed');
    session.undo();
    expect(session.content).toEqual(initial());
    expect(session.canUndo).toBe(false);
    expect(session.proposalTransactions).toEqual([]);
    session.redo();
    expect(session.content).toEqual(expected);
    expect(session.proposalTransactions).toEqual(['reviewed-rename']);
  });

  it('rejects missing or unsupported native metadata before preparing or applying a proposal', () => {
    const content = initial();
    const edit = operations.command(operationRef.id, input, content);
    const invalid: unknown[] = [
      { cards: content.cards },
      { ...content, artifactKind: 'other.cards' },
      { ...content, schemaVersion: 1 },
      { ...content, schemaVersion: 3 },
    ];
    for (const value of invalid) {
      const before = structuredClone(value);
      expect(
        operations.checkInput(operationRef.id, input, value as CardDocument).length,
      ).toBeGreaterThan(0);
      expect(() => operations.command(operationRef.id, input, value as CardDocument)).toThrow();
      expect(() => edit.apply(value as CardDocument)).toThrow();
      expect(value).toEqual(before);
    }
  });

  it('refuses wrong targets, stale source titles and blank titles without changing history', () => {
    const { handle, session, state } = fixture();
    handle.api.execute(updateCard('card-b', { title: 'あとで戻せる変更' }));
    session.undo();
    const before = state();
    for (const value of [
      { ...input, id: 'missing' },
      { ...input, before: '古い名前' },
      { ...input, title: ' \n ' },
      { ...input, title: undefined },
      { ...input, extra: true },
    ]) {
      expect(operations.checkInput(operationRef.id, value, session.content).length).toBeGreaterThan(
        0,
      );
      expect(() => handle.operations!.prepare(operationRef, value)).toThrow();
      expect(state()).toEqual(before);
    }
    expect(operations.checkInput('unknown', input, session.content).length).toBeGreaterThan(0);
    expect(() => operations.command('unknown', input, session.content)).toThrow('未対応');
  });

  it('lets the runtime reject a stale prepared candidate without overwriting a newer edit', () => {
    const { handle, state } = fixture();
    const prepared = handle.operations!.prepare(operationRef, input);
    handle.api.execute(updateCard('card-b', { description: '提案の確認中に追加したメモ' }));
    const before = state();
    expect(() => prepared.commit()).toThrow('Operation base changed');
    expect(state()).toEqual(before);
  });

  it('rechecks command preconditions even without the runtime and preserves unrelated changes', () => {
    const value = { ...input };
    const edit = operations.command(operationRef.id, value, initial());
    value.title = '命令作成後に書き換えた入力';
    const newerDescription = updateCard('card-a', { description: '新しい説明' }).apply(initial());
    const result = edit.apply(newerDescription);
    expect(result.cards[0]).toEqual({ ...newerDescription.cards[0], title: input.title });
    expect(result.cards[1]).toEqual(initial().cards[1]);
    expect(() =>
      edit.apply(updateCard('card-a', { title: '競合する変更' }).apply(initial())),
    ).toThrow('タイトルが変更');
    expect(() => edit.apply(removeCard('card-a').apply(initial()))).toThrow('見つかりません');
  });
});
