import { expect, it } from 'vitest';
import { apply, plan, resource } from '../src/shared-cards';
import { createDocument, type Card } from '../src/model';
const card = (id: string): Card => ({ id, title: id, description: '', color: 'blue' });
const base = createDocument(['a', 'b', 'c'].map(card));
const applyInput = (id: string, input: unknown, content = base) =>
  apply(content, plan(id, '1.0.0', input, content)[0]);
it('undoes deletion at its anchor while keeping independent appends', () => {
  const deleted = applyInput('delete-card', { id: 'b' });
  const appended = applyInput('add-card', { card: card('d') }, deleted.content);
  const restored = apply(appended.content, deleted.inverse[0]);
  expect(restored.content.cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(restored.required).toContain('card:a/exists');
  expect(deleted.required).not.toContain('@order');
  const first = applyInput('delete-card', { id: 'a' });
  expect(apply(first.content, first.inverse[0]).content).toEqual(base);
});
it('keeps order and field conditions independent, including reserved JS property names as IDs', () => {
  const edit = applyInput('edit-card', { id: 'a', patch: { description: 'changed' } });
  expect(edit.required).toEqual(['card:a/exists', 'card:a/description']);
  const rearranged = applyInput('order-cards', { ids: ['c', 'a', 'b'] }, edit.content);
  expect(rearranged.required).toEqual(['@order']);
  expect(rearranged.content.cards[1].description).toBe('changed');
  expect(applyInput('add-card', { card: card('constructor') }).touched).toContain(
    'card:constructor',
  );
  expect(resource(rearranged.content, 'card:a/description')).toBe('changed');
});
it('enforces ID uniqueness and the 100-card limit at apply time', () => {
  const doc = createDocument(Array.from({ length: 99 }, (_, i) => card(String(i))));
  const left = plan('add-card', '1.0.0', { card: card('left') }, doc)[0];
  const right = plan('add-card', '1.0.0', { card: card('right') }, doc)[0];
  const first = apply(doc, left).content;
  expect(() => apply(first, right)).toThrow();
  expect(() => apply(first, left)).toThrow();
  expect(doc.cards).toHaveLength(99);
});
