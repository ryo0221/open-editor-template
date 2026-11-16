import type { ScopedHost } from '@editor-platform/extension-contract';
import { addCard, moveCard, removeCard, updateCard } from './commands';
import { CARD_COLORS, type Card, type CardDocument } from './model';
import styles from './styles.css?inline';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const colorLabels: Record<Card['color'], string> = {
  blue: 'ブルー', green: 'グリーン', amber: 'アンバー',
  rose: 'ローズ', purple: 'パープル', slate: 'スレート',
};
const searchable = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP');

/** A comparison view over the existing card format; filtering never changes native data. */
export function mountEditor(container: HTMLElement, host: ScopedHost<CardDocument>): () => void {
  const root = element('section', undefined, 'ep-card-editor');
  root.setAttribute('aria-label', 'Editorアイデア比較Editor');
  const style = element('style', styles);
  const heading = element('h2', 'Editorアイデア比較', 'ep-idea-heading');
  const introduction = element('p', '候補を並べて、名前や説明から確かめたいアイデアを見つけます。', 'ep-idea-introduction');
  const status = element('p', '', 'ep-card-status');
  status.setAttribute('role', 'status');
  const toolbar = element('div', undefined, 'ep-card-toolbar');
  const count = element('span', '', 'ep-card-count');
  count.setAttribute('aria-live', 'polite');
  const add = element('button', '＋ 候補を追加', 'ep-card-primary');
  add.type = 'button';
  const filterLabel = element('label', '候補を絞り込む', 'ep-idea-filter');
  const search = element('input');
  search.type = 'search';
  search.setAttribute('aria-label', '候補を名前や説明で絞り込む');
  search.placeholder = '候補名・説明で検索';
  search.autocomplete = 'off';
  filterLabel.append(search);
  const scroll = element('div', undefined, 'ep-idea-table-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', '比較表の表示範囲');
  const table = element('table', undefined, 'ep-idea-table');
  table.setAttribute('aria-label', 'Editorアイデア比較表');
  const tableHead = element('thead');
  const columns = element('tr');
  for (const name of ['候補名', '説明', '色', '操作']) {
    const column = element('th', name);
    column.scope = 'col';
    columns.append(column);
  }
  tableHead.append(columns);
  const rows = element('tbody');
  table.append(tableHead, rows);
  scroll.append(table);
  const empty = element('p', '', 'ep-card-empty');
  toolbar.append(count, add);
  root.append(style, heading, introduction, toolbar, filterLabel, scroll, empty, status);
  container.append(root);
  const dialogCleanups = new Set<() => void>();
  let renderedContent = '';

  function report(error: unknown) {
    status.textContent = error instanceof Error ? error.message : '操作を完了できませんでした。';
  }
  function execute(action: () => void) {
    try {
      action();
      status.textContent = '';
      render();
    } catch (error) {
      report(error);
    }
  }
  function edit(card?: Card) {
    const dialog = element('dialog', undefined, 'ep-card-dialog');
    const form = element('form');
    const heading = element('h3', card ? '候補を編集' : '新しい候補');
    const titleLabel = element('label', '候補名');
    const title = element('input');
    title.name = 'title';
    title.required = true;
    title.value = card?.title ?? '';
    title.autocomplete = 'off';
    titleLabel.append(title);
    const descriptionLabel = element('label', '説明');
    const description = element('textarea');
    description.name = 'description';
    description.rows = 4;
    description.value = card?.description ?? '';
    descriptionLabel.append(description);
    const colorLabel = element('label', '色');
    const color = element('select');
    color.name = 'color';
    color.setAttribute('aria-label', '色');
    for (const value of CARD_COLORS) {
      const option = element('option', colorLabels[value]);
      option.value = value;
      color.append(option);
    }
    color.value = card?.color ?? 'blue';
    colorLabel.append(color);
    const errorMessage = element('p', '', 'ep-card-error');
    errorMessage.setAttribute('role', 'alert');
    const actions = element('div', undefined, 'ep-card-dialog-actions');
    const cancel = element('button', 'キャンセル');
    cancel.type = 'button';
    const submit = element('button', card ? '変更を適用' : '候補を追加', 'ep-card-primary');
    submit.type = 'submit';
    cancel.onclick = () => dialog.close();
    actions.append(cancel, submit);
    form.append(heading, titleLabel, descriptionLabel, colorLabel, errorMessage, actions);
    dialog.append(form);
    root.append(dialog);
    const hasPendingInput = () =>
      title.value !== (card?.title ?? '') ||
      description.value !== (card?.description ?? '') ||
      color.value !== (card?.color ?? 'blue');
    const guardPendingInput = (event: BeforeUnloadEvent) => {
      if (dialog.open && hasPendingInput()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const cleanupDialog = () => {
      window.removeEventListener('beforeunload', guardPendingInput);
      dialogCleanups.delete(cleanupDialog);
    };
    window.addEventListener('beforeunload', guardPendingInput);
    dialogCleanups.add(cleanupDialog);
    dialog.addEventListener(
      'close',
      () => {
        cleanupDialog();
        dialog.remove();
      },
      { once: true },
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      try {
        if (card) {
          const current = host.read().cards.find((item) => item.id === card.id);
          if (
            !current || current.title !== card.title ||
            current.description !== card.description || current.color !== card.color
          )
            throw new Error('この候補は編集中に変更されました。入力を控えてキャンセルし、現在の内容を開き直してください。');
        }
        const value = {
          title: title.value,
          description: description.value,
          color: color.value as Card['color'],
        };
        host.execute(
          card ? updateCard(card.id, value) : addCard({ id: crypto.randomUUID(), ...value }),
        );
        dialog.close();
        status.textContent = '';
        render();
      } catch (error) {
        errorMessage.textContent =
          error instanceof Error ? error.message : '入力を確認してください。';
      }
    };
    // A modal keeps the example's explicit apply/cancel inputs separate from Host actions.
    // Editors needing inline pending inputs must adopt the appropriate input contract.
    dialog.showModal();
    title.focus();
  }
  add.onclick = () => edit();
  search.oninput = () => {
    try { render(); } catch (error) { report(error); }
  };

  function render(content = host.read()) {
    renderedContent = JSON.stringify(content);
    const query = searchable(search.value.trim());
    const matching = content.cards.map((card, index) => ({ card, index })).filter(({ card }) =>
      !query || searchable(card.title).includes(query) || searchable(card.description).includes(query),
    );
    count.textContent = query ? `${matching.length} / ${content.cards.length} 件の候補` : `${content.cards.length} 件の候補`;
    add.disabled = content.cards.length >= 100;
    // Keep the search input and pending modal attached, including focus, caret and IME state.
    rows.replaceChildren();
    empty.hidden = matching.length > 0;
    empty.textContent = content.cards.length
      ? '条件に合う候補がありません。検索語を変えるか、入力を消してください。'
      : '最初の候補を追加して、Editorのアイデアを比べましょう。';
    matching.forEach(({ card, index }) => {
      const item = element('tr', undefined, 'ep-idea-row');
      item.dataset.color = card.color;
      item.dataset.cardId = card.id;
      const nameCell = element('th', undefined, 'ep-idea-name');
      nameCell.scope = 'row';
      const title = element('h3', card.title);
      nameCell.append(title);
      const descriptionCell = element('td');
      const description = element(
        'p',
        card.description || '説明を追加できます。',
        'ep-card-description',
      );
      descriptionCell.append(description);
      const colorCell = element('td');
      const color = element('span', undefined, 'ep-idea-color');
      const swatch = element('span', undefined, 'ep-idea-swatch');
      swatch.setAttribute('aria-hidden', 'true');
      color.append(swatch, document.createTextNode(colorLabels[card.color]));
      colorCell.append(color);
      const actionsCell = element('td');
      const actions = element('div', undefined, 'ep-card-actions');
      const editButton = element('button', '編集');
      editButton.type = 'button';
      editButton.setAttribute('aria-label', `「${card.title}」を編集`);
      editButton.onclick = () => edit(card);
      const up = element('button', '↑');
      up.type = 'button';
      up.disabled = index === 0;
      up.setAttribute('aria-label', `「${card.title}」を前へ移動`);
      up.onclick = () => execute(() => host.execute(moveCard(card.id, -1)));
      const down = element('button', '↓');
      down.type = 'button';
      down.disabled = index === content.cards.length - 1;
      down.setAttribute('aria-label', `「${card.title}」を後ろへ移動`);
      down.onclick = () => execute(() => host.execute(moveCard(card.id, 1)));
      const remove = element('button', '削除', 'ep-card-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `「${card.title}」を削除`);
      remove.onclick = () => execute(() => host.execute(removeCard(card.id)));
      actions.append(editButton, up, down, remove);
      actionsCell.append(actions);
      item.append(nameCell, descriptionCell, colorCell, actionsCell);
      rows.append(item);
    });
  }
  render();
  // draft.1 exposes read(), not subscribe(). PaoBub keeps this Surface mounted
  // across Host Undo/Redo and proposals. Refresh only table rows; the search
  // field and a pending modal stay attached with their current input state.
  const refresh = window.setInterval(() => {
    try {
      const content = host.read();
      if (JSON.stringify(content) !== renderedContent) render(content);
    } catch (error) {
      report(error);
    }
  }, 200);
  return () => {
    window.clearInterval(refresh);
    for (const cleanup of dialogCleanups) cleanup();
    root.remove();
  };
}
