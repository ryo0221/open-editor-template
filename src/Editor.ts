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

/** A small DOM Surface. Native content and commands also work without a browser. */
export function mountEditor(container: HTMLElement, host: ScopedHost<CardDocument>): () => void {
  const root = element('section', undefined, 'ep-card-editor');
  root.setAttribute('aria-label', 'カードEditor');
  const style = element('style', styles);
  const status = element('p', '', 'ep-card-status');
  status.setAttribute('role', 'status');
  const toolbar = element('div', undefined, 'ep-card-toolbar');
  const count = element('span', '', 'ep-card-count');
  const add = element('button', '＋ カードを追加', 'ep-card-primary');
  add.type = 'button';
  const list = element('div', undefined, 'ep-card-list');
  list.setAttribute('role', 'list');
  toolbar.append(count, add);
  root.append(style, toolbar, list, status);
  container.append(root);
  const dialogCleanups = new Set<() => void>();

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
    const heading = element('h3', card ? 'カードを編集' : '新しいカード');
    const titleLabel = element('label', 'タイトル');
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
    const labels = {
      blue: 'ブルー',
      green: 'グリーン',
      amber: 'アンバー',
      rose: 'ローズ',
      purple: 'パープル',
      slate: 'スレート',
    };
    for (const value of CARD_COLORS) {
      const option = element('option', labels[value]);
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
    const submit = element('button', card ? '変更を適用' : 'カードを追加', 'ep-card-primary');
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

  function render() {
    const content = host.read();
    count.textContent = `${content.cards.length} CARDS`;
    add.disabled = content.cards.length >= 100;
    list.replaceChildren();
    if (!content.cards.length)
      list.append(
        element('p', '最初のカードを追加して、自分のEditorを作り始めましょう。', 'ep-card-empty'),
      );
    content.cards.forEach((card, index) => {
      const item = element('article', undefined, 'ep-card');
      item.setAttribute('role', 'listitem');
      item.dataset.color = card.color;
      item.dataset.cardId = card.id;
      const top = element('div', undefined, 'ep-card-top');
      const number = element('span', String(index + 1).padStart(2, '0'), 'ep-card-number');
      const select = element('button', '選択', 'ep-card-select');
      select.type = 'button';
      select.setAttribute('aria-label', `「${card.title}」を選択`);
      select.setAttribute('aria-pressed', 'false');
      select.onclick = () => {
        try {
          host.select([card.id]);
          for (const button of list.querySelectorAll('.ep-card-select'))
            button.setAttribute('aria-pressed', 'false');
          select.setAttribute('aria-pressed', 'true');
          status.textContent = `「${card.title}」を選択しました。`;
        } catch (error) {
          report(error);
        }
      };
      top.append(number, select);
      const title = element('h3', card.title);
      const description = element(
        'p',
        card.description || '説明を追加できます。',
        'ep-card-description',
      );
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
      item.append(top, title, description, actions);
      list.append(item);
    });
  }
  render();
  return () => {
    for (const cleanup of dialogCleanups) cleanup();
    root.remove();
  };
}
