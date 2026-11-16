/** Native identity is shared by saved JSON, the extension manifest and consuming Hosts. */
export const CARD_ARTIFACT_KIND = 'example.cards' as const;
export const CARD_SCHEMA_VERSION = 2 as const;

export const CARD_COLORS = ['blue', 'green', 'amber', 'rose', 'purple', 'slate'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_LIMITS = { cards: 100, id: 64, title: 80, description: 500 } as const;

export interface Card {
  id: string;
  title: string;
  description: string;
  color: CardColor;
}

export interface CardDocument {
  artifactKind: typeof CARD_ARTIFACT_KIND;
  schemaVersion: typeof CARD_SCHEMA_VERSION;
  cards: Card[];
}

function hasOnlyFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === fields.length &&
    keys.every((key) => typeof key === 'string' && fields.includes(key))
  );
}

/** Match the operations schema's Unicode code point lengths, including emoji. */
function textLength(value: string): number {
  return [...value].length;
}

export function validateCardId(value: unknown, label = 'カードID'): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > CARD_LIMITS.id ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
  )
    throw new Error(
      `${label}は英数字で始まる1〜${CARD_LIMITS.id}文字の英数字・ハイフン・下線にしてください。`,
    );
}

export function validateCardTitle(value: unknown, label = 'タイトル'): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || textLength(value) > CARD_LIMITS.title)
    throw new Error(`${label}は1〜${CARD_LIMITS.title}文字で入力してください（空白だけは不可）。`);
}

function validateCard(value: unknown, label: string): asserts value is Card {
  if (!hasOnlyFields(value, ['id', 'title', 'description', 'color']))
    throw new Error(`${label}にはid・title・description・colorだけが必要です。`);
  validateCardId(value.id, `${label}のID`);
  validateCardTitle(value.title, `${label}のタイトル`);
  if (
    typeof value.description !== 'string' ||
    textLength(value.description) > CARD_LIMITS.description
  )
    throw new Error(`${label}の説明は${CARD_LIMITS.description}文字以内の文字列にしてください。`);
  if (typeof value.color !== 'string' || !CARD_COLORS.includes(value.color as CardColor))
    throw new Error(`${label}の色は${CARD_COLORS.join('・')}から選んでください。`);
}

/** Throw a readable error before any content or history is changed. Does not coerce data. */
export function validateDocument(value: unknown): asserts value is CardDocument {
  if (!hasOnlyFields(value, ['artifactKind', 'schemaVersion', 'cards']))
    throw new Error(
      'ドキュメントにはartifactKind・schemaVersion・cardsだけが必要です。形式情報のない{ cards }は読み込めません。',
    );
  if (value.artifactKind !== CARD_ARTIFACT_KIND)
    throw new Error(`artifactKindは「${CARD_ARTIFACT_KIND}」である必要があります。`);
  if (value.schemaVersion !== CARD_SCHEMA_VERSION)
    throw new Error(`対応するカード形式のschemaVersionは${CARD_SCHEMA_VERSION}です。`);
  if (!Array.isArray(value.cards)) throw new Error('cardsはカードの配列にしてください。');
  if (value.cards.length > CARD_LIMITS.cards)
    throw new Error(`カードは${CARD_LIMITS.cards}枚までです。`);
  const ids = new Set<string>();
  for (let index = 0; index < value.cards.length; index++) {
    const card: unknown = value.cards[index];
    validateCard(card, `カード${index + 1}`);
    if (ids.has(card.id)) throw new Error(`カードID「${card.id}」が重複しています。`);
    ids.add(card.id);
  }
}

export function isCardDocument(value: unknown): value is CardDocument {
  try {
    validateDocument(value);
    return true;
  } catch {
    return false;
  }
}

/** Each caller owns a fresh document; IDs are supplied once and survive edits and saves. */
export function createDocument(cards: readonly Card[] = []): CardDocument {
  const value = {
    artifactKind: CARD_ARTIFACT_KIND,
    schemaVersion: CARD_SCHEMA_VERSION,
    cards,
  };
  validateDocument(value);
  return { ...value, cards: value.cards.map((card) => ({ ...card })) };
}
