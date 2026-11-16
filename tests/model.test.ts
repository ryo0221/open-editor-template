import { EditorSession } from '@editor-platform/editor-core';
import { describe, expect, it } from 'vitest';
import example from '../fixtures/example.json';
import { addCard, moveCard, removeCard, updateCard } from '../src/commands';
import {
  CARD_LIMITS,
  createDocument,
  isCardDocument,
  validateDocument,
  type Card,
  type CardDocument,
} from '../src/model';

const card = (id = 'card-a'): Card => ({
  id,
  title: '試してみたいこと',
  description: '残しておく説明',
  color: 'blue',
});
function freezeDocument(document: CardDocument): CardDocument {
  document.cards.forEach(Object.freeze);
  Object.freeze(document.cards);
  Object.freeze(document);
  return document;
}

describe('native card model and commands', () => {
  it('loads the example and round-trips stable IDs without sharing caller-owned objects', () => {
    validateDocument(example);
    const original = createDocument(example.cards);
    const copy = createDocument(original.cards);
    copy.cards[0].title = '別のタイトル';
    expect(original.cards[0].title).toBe(example.cards[0].title);
    expect(copy.cards[0].id).toBe(original.cards[0].id);
    const restored: unknown = JSON.parse(JSON.stringify(original));
    validateDocument(restored);
    expect(restored).toEqual(original);
    expect(createDocument()).toEqual({ cards: [] });
  });

  it('rejects malformed structures, extra fields, duplicate IDs and unsupported colors', () => {
    const valid = card();
    const invalid: unknown[] = [
      null,
      '{"cards":[]}',
      {},
      { cards: 'not-an-array' },
      { cards: [], schemaVersion: 1 },
      { cards: [valid, valid] },
      { cards: [{ ...valid, extra: 'silently dropping data would be wrong' }] },
      { cards: [{ ...valid, id: '' }] },
      { cards: [{ ...valid, id: '../card' }] },
      { cards: [{ ...valid, color: 'neon' }] },
      { cards: [{ ...valid, description: undefined }] },
      { cards: new Array(1) },
    ];
    for (const value of invalid) {
      expect(isCardDocument(value)).toBe(false);
      expect(() => validateDocument(value)).toThrow();
    }
  });

  it('enforces count and text bounds using the same Unicode length as operations', () => {
    const maximum = {
      ...card(),
      title: '😀'.repeat(CARD_LIMITS.title),
      description: '🌿'.repeat(CARD_LIMITS.description),
    };
    expect(isCardDocument({ cards: [maximum] })).toBe(true);
    expect(isCardDocument({ cards: [{ ...maximum, title: `${maximum.title}a` }] })).toBe(false);
    expect(
      isCardDocument({ cards: [{ ...maximum, description: `${maximum.description}a` }] }),
    ).toBe(false);
    expect(isCardDocument({ cards: [{ ...card(), title: '  \n ' }] })).toBe(false);
    const cards = Array.from({ length: CARD_LIMITS.cards }, (_, index) => card(`card-${index}`));
    expect(isCardDocument({ cards })).toBe(true);
    expect(() => addCard(card('one-more')).apply({ cards })).toThrow('100枚まで');
  });

  it('adds, edits, moves and removes without mutating inputs or changing unrelated fields', () => {
    const original = freezeDocument(createDocument([card('card-a'), card('card-b')]));
    const added = addCard(card('card-c')).apply(original);
    expect(original.cards).toHaveLength(2);
    const edited = updateCard('card-a', { title: '新しい名前' }).apply(freezeDocument(added));
    expect(edited.cards[0]).toEqual({ ...original.cards[0], title: '新しい名前' });
    expect(edited.cards[1]).toEqual(original.cards[1]);
    const moved = moveCard('card-a', 1).apply(freezeDocument(edited));
    expect(moved.cards.map((item) => item.id)).toEqual(['card-b', 'card-a', 'card-c']);
    expect(edited.cards.map((item) => item.id)).toEqual(['card-a', 'card-b', 'card-c']);
    const removed = removeCard('card-b').apply(freezeDocument(moved));
    expect(removed.cards.map((item) => item.id)).toEqual(['card-a', 'card-c']);
    expect(removed.cards[0].description).toBe(original.cards[0].description);
  });

  it('captures caller inputs and checks target and movement preconditions at apply time', () => {
    const original = createDocument([card('card-a'), card('card-b')]);
    const addition = card('card-c');
    const add = addCard(addition);
    addition.title = 'あとから変更';
    const added = add.apply(original);
    expect(added.cards[2].title).toBe('試してみたいこと');
    expect(() => add.apply(added)).toThrow('既に使われています');
    const patch = { title: '確定した変更' };
    const edit = updateCard('card-a', patch);
    patch.title = 'あとから変更';
    expect(edit.apply(original).cards[0].title).toBe('確定した変更');
    expect(() => edit.apply(removeCard('card-a').apply(original))).toThrow('見つかりません');
    expect(() => moveCard('card-a', -1).apply(original)).toThrow('これ以上');
    expect(() => moveCard('card-a', 2 as 1).apply(original)).toThrow('移動方向');
    expect(() => updateCard('card-a', { id: 'replace-id' } as never)).toThrow('IDは変更できません');
  });

  it('keeps native history and its redo branch intact when an edit is rejected', () => {
    const initial = createDocument([card()]);
    const session = new EditorSession(initial);
    session.execute(updateCard('card-a', { title: '有効な変更' }));
    session.undo();
    const revision = session.revision;
    expect(() => session.execute(updateCard('card-a', { title: '' }))).toThrow('1〜80文字');
    expect(session.content).toEqual(initial);
    expect(session.revision).toEqual(revision);
    expect(session.canRedo).toBe(true);
    session.redo();
    expect(session.content.cards[0].title).toBe('有効な変更');
  });
});
