import type { OperationDeclaration, OperationSchema } from '@editor-platform/extension-contract';
import { CARD_COLORS, CARD_LIMITS } from './model';
import { renameCardOperation } from './operations';

const string = (maxLength: number): OperationSchema => ({ type: 'string', maxLength });
const object = (
  properties: Record<string, OperationSchema>,
  required = Object.keys(properties),
): OperationSchema => ({ type: 'object', properties, required, additionalProperties: false });
const id = string(CARD_LIMITS.id);
const fields = {
  title: string(CARD_LIMITS.title),
  description: string(CARD_LIMITS.description),
  color: { type: 'string', maxLength: 8, enum: CARD_COLORS } as const,
};
const define = (id: string, title: string, inputSchema: OperationSchema): OperationDeclaration => ({
  id,
  version: '1.0.0',
  title,
  inputSchema,
});
export const sharedCardDeclarations = [
  renameCardOperation,
  define('add-card', 'カードを追加', object({ card: object({ id, ...fields }) })),
  define('edit-card', 'カードの欄を編集', object({ id, patch: object(fields, []) })),
  define('delete-card', 'カードを削除', object({ id })),
  define(
    'order-cards',
    'カードを並べ替え',
    object({ ids: { type: 'array', items: id, maxItems: CARD_LIMITS.cards } }),
  ),
];
