import { command, type EditorCommand } from '@editor-platform/editor-core';
import {
  createDocument,
  validateCardId,
  validateDocument,
  type Card,
  type CardDocument,
} from './model';

export type CardPatch = Partial<Pick<Card, 'title' | 'description' | 'color'>>;

function indexOfCard(content: CardDocument, id: string): number {
  validateDocument(content);
  validateCardId(id);
  const index = content.cards.findIndex((card) => card.id === id);
  if (index === -1) throw new Error(`カード「${id}」が見つかりません。`);
  return index;
}

function copyPatch(patch: CardPatch): CardPatch {
  if (!patch || typeof patch !== 'object' || Object.getPrototypeOf(patch) !== Object.prototype)
    throw new Error('変更内容はJSONオブジェクトにしてください。');
  const keys = Reflect.ownKeys(patch);
  if (
    !keys.length ||
    keys.some((key) => typeof key !== 'string' || !['title', 'description', 'color'].includes(key))
  )
    throw new Error('変更するtitle・description・colorを指定してください。IDは変更できません。');
  return { ...patch };
}

export function addCard(card: Card): EditorCommand<CardDocument> {
  const addition = createDocument([card]).cards[0];
  return {
    ...command<CardDocument>('cards.add', 'カードを追加', (content) => {
      validateDocument(content);
      if (content.cards.some((current) => current.id === addition.id))
        throw new Error(`カードID「${addition.id}」は既に使われています。`);
      const next = { ...content, cards: [...content.cards, { ...addition }] };
      validateDocument(next);
      return next;
    }),
    readonlyInput: true,
  };
}

export function updateCard(id: string, patch: CardPatch): EditorCommand<CardDocument> {
  const change = copyPatch(patch);
  return {
    ...command<CardDocument>('cards.update', 'カードを編集', (content) => {
      const index = indexOfCard(content, id);
      const next = {
        ...content,
        cards: content.cards.map((card, current) =>
          current === index ? { ...card, ...change } : card,
        ),
      };
      validateDocument(next);
      return next;
    }),
    readonlyInput: true,
  };
}

export function removeCard(id: string): EditorCommand<CardDocument> {
  return {
    ...command<CardDocument>('cards.remove', 'カードを削除', (content) => {
      const index = indexOfCard(content, id);
      return { ...content, cards: content.cards.filter((_, current) => current !== index) };
    }),
    readonlyInput: true,
  };
}

export function moveCard(id: string, direction: -1 | 1): EditorCommand<CardDocument> {
  return {
    ...command<CardDocument>('cards.move', 'カードを移動', (content) => {
      const index = indexOfCard(content, id);
      if (direction !== -1 && direction !== 1)
        throw new Error('移動方向は-1または1で指定してください。');
      const destination = index + direction;
      if (destination < 0 || destination >= content.cards.length)
        throw new Error('これ以上その方向へ移動できません。');
      const cards = content.cards.map((card, current) => {
        if (current === index) return content.cards[destination];
        if (current === destination) return content.cards[index];
        return card;
      });
      return { ...content, cards };
    }),
    readonlyInput: true,
  };
}
