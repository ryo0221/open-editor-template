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

export interface SharedCardsHost {
  read(): CardDocument;
  revision(): string;
  submit(revision: string, operation: string, input: unknown): Promise<void>;
  pointer?(target: string | null, x: number, y: number): void;
  onPointers?(
    listener: (
      values: readonly { session: string; target: string; x: number; y: number }[],
    ) => void,
  ): () => void;
  keepInput?(value: Record<string, string> | null): void;
  subscribe(listener: () => void): () => void;
}
export function mountSharedEditor(container: HTMLElement, host: SharedCardsHost) {
  return surface(container, { shared: host });
}
export function mountEditor(container: HTMLElement, host: ScopedHost<CardDocument>) {
  return surface(container, { local: host });
}
function surface(
  container: HTMLElement,
  mode: { local: ScopedHost<CardDocument> } | { shared: SharedCardsHost },
): () => void {
  const shared = 'shared' in mode ? mode.shared : undefined;
  const host = 'shared' in mode ? mode.shared : mode.local;
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
  let renderedContent = '';

  function report(error: unknown) {
    status.textContent = error instanceof Error ? error.message : '操作を完了できませんでした。';
  }
  async function execute(action: () => void | Promise<void>) {
    try {
      await action();
      status.textContent = '';
      render();
    } catch (error) {
      report(error);
    }
  }
  function edit(card?: Card) {
    const base = shared?.revision();
    const newId = card?.id ?? crypto.randomUUID();
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
    const remember = () => {
      const typed: Record<string, string> = {};
      if (title.value !== (card?.title ?? '')) typed.title = title.value;
      if (description.value !== (card?.description ?? '')) typed.description = description.value;
      if (color.value !== (card?.color ?? 'blue')) typed.color = color.value;
      shared?.keepInput?.(Object.keys(typed).length ? typed : null);
    };
    form.addEventListener('input', remember);
    form.addEventListener('change', remember);
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
        shared?.keepInput?.(null);
        cleanupDialog();
        dialog.remove();
      },
      { once: true },
    );
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        if (card && !shared) {
          const current = host.read().cards.find((item) => item.id === card.id);
          if (
            !current ||
            current.title !== card.title ||
            current.description !== card.description ||
            current.color !== card.color
          )
            throw new Error(
              'このカードは編集中に変更されました。入力を控えてキャンセルし、現在の内容を開き直してください。',
            );
        }
        const value = {
          title: title.value,
          description: description.value,
          color: color.value as Card['color'],
        };
        if ('local' in mode) {
          mode.local.execute(card ? updateCard(card.id, value) : addCard({ id: newId, ...value }));
        } else {
          submit.disabled = true;
          cancel.disabled = true;
          const patch = card
            ? Object.fromEntries(
                Object.entries(value).filter(([key, v]) => v !== card[key as keyof Card]),
              )
            : value;
          if (!card || Object.keys(patch).length)
            await mode.shared.submit(
              base!,
              card ? 'edit-card' : 'add-card',
              card ? { id: card.id, patch } : { card: { id: newId, ...value } },
            );
        }
        dialog.close();
        status.textContent = '';
        render();
      } catch (error) {
        errorMessage.textContent =
          error instanceof Error ? error.message : '入力を確認してください。';
        submit.disabled = false;
        cancel.disabled = false;
      }
    };
    // A modal keeps the example's explicit apply/cancel inputs separate from Host actions.
    // Editors needing inline pending inputs must adopt the appropriate input contract.
    dialog.showModal();
    title.focus();
  }
  add.onclick = () => edit();

  function render(content = host.read()) {
    renderedContent = JSON.stringify(content);
    count.textContent = `${content.cards.length} CARDS`;
    add.disabled = content.cards.length >= 100;
    list.replaceChildren();
    if (!content.cards.length)
      list.append(
        element('p', '最初のカードを追加して、自分のEditorを作り始めましょう。', 'ep-card-empty'),
      );
    const base = shared?.revision();
    content.cards.forEach((card, index) => {
      const move = (offset: -1 | 1) => {
        if ('local' in mode) return mode.local.execute(moveCard(card.id, offset));
        const ids = content.cards.map((c) => c.id);
        [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
        return mode.shared.submit(base!, 'order-cards', { ids });
      };
      const item = element('article', undefined, 'ep-card');
      item.setAttribute('role', 'listitem');
      item.dataset.color = card.color;
      item.dataset.cardId = card.id;
      const top = element('div', undefined, 'ep-card-top');
      const number = element('span', String(index + 1).padStart(2, '0'), 'ep-card-number');
      top.append(number);
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
      up.onclick = () => execute(() => move(-1));
      const down = element('button', '↓');
      down.type = 'button';
      down.disabled = index === content.cards.length - 1;
      down.setAttribute('aria-label', `「${card.title}」を後ろへ移動`);
      down.onclick = () => execute(() => move(1));
      const remove = element('button', '削除', 'ep-card-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `「${card.title}」を削除`);
      remove.onclick = () =>
        execute(() =>
          'local' in mode
            ? mode.local.execute(removeCard(card.id))
            : mode.shared.submit(base!, 'delete-card', { id: card.id }),
        );
      actions.append(editButton, up, down, remove);
      item.append(top, title, description, actions);
      list.append(item);
    });
  }
  let lastPointer = 0;
  if (shared?.pointer) {
    list.onpointermove = (event) => {
      if (performance.now() - lastPointer < 120) return;
      const item = (event.target as Element).closest<HTMLElement>('[data-card-id]');
      if (!item) return;
      const rect = item.getBoundingClientRect();
      lastPointer = performance.now();
      shared.pointer!(
        item.dataset.cardId!,
        Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      );
    };
    list.onpointerleave = () => shared.pointer!(null, 0, 0);
  }
  const removePointers = shared?.onPointers?.((values) => {
    for (const pointer of list.querySelectorAll('.ep-shared-pointer')) pointer.remove();
    for (const { target, x, y } of values) {
      const card = list.querySelector<HTMLElement>('[data-card-id="' + CSS.escape(target) + '"]');
      if (!card) continue;
      const pointer = element('span', '↖', 'ep-shared-pointer');
      pointer.setAttribute('aria-label', '共同編集中のポインター');
      pointer.style.left = x * 100 + '%';
      pointer.style.top = y * 100 + '%';
      card.append(pointer);
    }
  });
  render();
  // draft.1 exposes read(), not subscribe(). PaoBub keeps this Surface mounted
  // across Host Undo/Redo and proposals. Refresh only the list; a pending modal
  // and its inputs stay attached until the user applies or cancels them.
  const refresh = () => {
    try {
      const content = host.read();
      if (JSON.stringify(content) !== renderedContent) render(content);
    } catch (error) {
      report(error);
    }
  };
  const timer = shared ? undefined : window.setInterval(refresh, 200);
  const detach = shared?.subscribe(refresh);
  return () => {
    window.clearInterval(timer);
    detach?.();
    removePointers?.();
    for (const cleanup of dialogCleanups) cleanup();
    root.remove();
  };
}
