import type { OperationDeclaration, OperationsAdapter } from '@editor-platform/extension-contract';
import { updateCard } from './commands';
import {
  CARD_LIMITS,
  validateCardId,
  validateCardTitle,
  validateDocument,
  type CardDocument,
} from './model';

/** Data-only declaration; the trusted Host checks this bounded schema before package code runs. */
export const renameCardOperation: OperationDeclaration = {
  id: 'rename-card',
  version: '1.0.0',
  title: 'カードのタイトルを変更',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1,
        maxLength: CARD_LIMITS.id,
        description: '変更するカードの安定ID',
      },
      before: {
        type: 'string',
        minLength: 1,
        maxLength: CARD_LIMITS.title,
        description: '確認した変更前のタイトル',
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: CARD_LIMITS.title,
        description: '変更後のタイトル',
      },
    },
    required: ['id', 'before', 'title'],
    additionalProperties: false,
  },
};

export const operationDeclarations: readonly OperationDeclaration[] = [renameCardOperation];

interface RenameInput {
  id: string;
  before: string;
  title: string;
}

function readInput(operation: string, value: unknown): RenameInput {
  if (operation !== renameCardOperation.id) throw new Error(`未対応の操作です: ${operation}`);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('操作の入力はid・before・titleを持つJSONオブジェクトにしてください。');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 3 || keys.some((key) => !['id', 'before', 'title'].includes(String(key))))
    throw new Error('操作の入力にはid・before・titleだけを指定してください。');
  const input = value as Record<string, unknown>;
  validateCardId(input.id);
  validateCardTitle(input.before, '変更前のタイトル');
  validateCardTitle(input.title, '変更後のタイトル');
  return { id: input.id, before: input.before, title: input.title };
}

function checkTarget(input: RenameInput, content: CardDocument): void {
  validateDocument(content);
  const card = content.cards.find((current) => current.id === input.id);
  if (!card) throw new Error(`カード「${input.id}」が見つかりません。`);
  if (card.title !== input.before)
    throw new Error('タイトルが変更されています。現在の内容を読み直して提案を作成してください。');
}

export const operations: OperationsAdapter<CardDocument> = {
  checkInput(operation, value, content) {
    try {
      checkTarget(readInput(operation, value), content);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : '操作の入力を確認してください。'];
    }
  },
  command(operation, value, content) {
    const input = readInput(operation, value);
    checkTarget(input, content);
    // UI and external proposals use the same edit. The proposal also names what it read.
    const edit = updateCard(input.id, { title: input.title });
    return {
      ...edit,
      apply(current) {
        checkTarget(input, current);
        return edit.apply(current);
      },
    };
  },
};
