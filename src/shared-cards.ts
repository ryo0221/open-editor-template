// Closed codec entry. Only the model and native commands are imported into the authority VM.
import { applyAddCard, applyRemoveCard, applyUpdateCard, type CardPatch } from './commands';
import {
  isCardDocument,
  validateCardId,
  validateDocument,
  type Card,
  type CardDocument,
} from './model';
export { isCardDocument as validate } from './model';

type Action =
  | { type: 'add-card'; card: Card; after?: string | null }
  | { type: 'edit-card'; id: string; patch: CardPatch }
  | { type: 'delete-card'; id: string }
  | { type: 'order-cards'; ids: string[] };

function planCard(id: string, version: string, input: unknown, base: CardDocument): Action[] {
  validateDocument(base);
  if (version !== '1.0.0' || !input || typeof input !== 'object') throw Error('invalid-operation');
  const value = input as Record<string, unknown>;
  switch (id) {
    case 'rename-card': {
      const card = base.cards.find((c) => c.id === value.id);
      if (!card || card.title !== value.before) throw Error('stale-precondition');
      return [{ type: 'edit-card', id: card.id, patch: { title: value.title as string } }];
    }
    case 'edit-card':
      return [{ type: id, id: value.id as string, patch: value.patch as CardPatch }];
    case 'add-card':
      return [{ type: id, card: value.card as Card }];
    case 'delete-card':
      return [{ type: id, id: value.id as string }];
    case 'order-cards':
      return [{ type: id, ids: value.ids as string[] }];
    default:
      throw Error('unsupported-operation');
  }
}
export function resource(content: CardDocument, key: string): unknown {
  if (key === '@order') return content.cards.map((c) => c.id);
  const [encoded, field] = key.split('/');
  const id = encoded.slice('card:'.length);
  const card = content.cards.find((c) => c.id === id);
  if (field === 'exists') return Boolean(card);
  if (field === 'title' || field === 'description' || field === 'color')
    return card?.[field] ?? null;
  return card ?? null;
}
function applyCard(content: CardDocument, action: Action) {
  const order = content.cards.map((c) => c.id);
  switch (action.type) {
    case 'add-card': {
      const id = action.card.id;
      let next = applyAddCard(content, action.card);
      const required = ['card:' + id + '/exists'];
      if (action.after !== undefined) {
        const anchor = action.after;
        const index = anchor === null ? -1 : order.indexOf(anchor);
        if (anchor !== null && index < 0) throw Error('undo-conflict');
        if (anchor !== null) required.push('card:' + anchor + '/exists');
        next = {
          ...next,
          cards: [
            ...content.cards.slice(0, index + 1),
            action.card,
            ...content.cards.slice(index + 1),
          ],
        };
      }
      return {
        content: next,
        required,
        targets: ['@order'],
        touched: ['card:' + id + '/exists', 'card:' + id, '@order'],
        inverse: [{ type: 'delete-card', id }],
      };
    }
    case 'delete-card': {
      validateCardId(action.id);
      const index = order.indexOf(action.id);
      if (index < 0) throw Error('target-deleted');
      const id = action.id;
      return {
        content: applyRemoveCard(content, id),
        required: ['card:' + id, 'card:' + id + '/exists'],
        targets: [id, '@order'],
        touched: ['card:' + id + '/exists', 'card:' + id, '@order'],
        inverse: [
          { type: 'add-card', card: content.cards[index], after: order[index - 1] ?? null },
        ],
      };
    }
    case 'edit-card': {
      const { id, patch } = action;
      const previous = content.cards.find((c) => c.id === id);
      if (!previous) throw Error('target-deleted');
      const next = applyUpdateCard(content, id, patch);
      const fields = Object.keys(patch) as (keyof CardPatch)[];
      const touched = fields.map((key) => 'card:' + id + '/' + key);
      return {
        content: next,
        required: ['card:' + id + '/exists', ...touched],
        targets: [id],
        touched,
        inverse: [
          {
            type: 'edit-card',
            id,
            patch: Object.fromEntries(fields.map((key) => [key, previous[key]])),
          },
        ],
      };
    }
    case 'order-cards': {
      if (
        !Array.isArray(action.ids) ||
        action.ids.length !== order.length ||
        new Set(action.ids).size !== order.length
      )
        throw Error('invalid-operation');
      const cards = action.ids.map((id) => content.cards.find((c) => c.id === id));
      const next = { ...content, cards };
      if (!isCardDocument(next)) throw Error('invalid-operation');
      return {
        content: next,
        required: ['@order'],
        targets: ['@order', ...order],
        touched: ['@order'],
        inverse: [{ type: 'order-cards', ids: order }],
      };
    }
  }
}

interface SharedAction {
  type: string;
  target: string;
  payload: Record<string, unknown>;
}
function encode(action: Action): SharedAction {
  const target =
    action.type === 'order-cards'
      ? '@order'
      : action.type === 'add-card'
        ? action.card.id
        : action.id;
  return { type: action.type, target, payload: { ...action } };
}
export function plan(...args: Parameters<typeof planCard>) {
  return planCard(...args).map(encode);
}
export function apply(content: CardDocument, action: SharedAction) {
  const native = action.payload as Action;
  if (encode(native).target !== action.target || native.type !== action.type)
    throw Error('invalid-operation');
  const effect = applyCard(content, native);
  return { ...effect, inverse: effect.inverse.map((value) => encode(value as Action)) };
}
export function validateAnchor(content: CardDocument, target: string) {
  return content.cards.some((c) => c.id === target);
}
