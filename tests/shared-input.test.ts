// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mountSharedEditor } from '../src/Editor';
import { createDocument } from '../src/model';

it('locks the submitted fields until the receipt, restoring typed values on conflict', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  let reject!: (reason: Error) => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((_, no) => {
        reject = no;
      }),
  );
  const detach = mountSharedEditor(root, {
    read: () => createDocument(),
    revision: () => 'g/0',
    submit,
    subscribe: () => () => {},
  });
  try {
    root.querySelector('button')!.click();
    const form = root.querySelector('form')!;
    const title = form.querySelector('input')!;
    title.value = '入力した名前';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    const controls = [...form.querySelectorAll('input,textarea,select,button')];
    expect(submit).toHaveBeenCalledOnce();
    expect(controls.every((el) => el.matches(':disabled'))).toBe(true);
    expect(
      root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })),
    ).toBe(false);
    reject(Error('stale-precondition'));
    await vi.waitFor(() => expect(controls.every((el) => !el.matches(':disabled'))).toBe(true));
    expect(title.value).toBe('入力した名前');
    expect(form.querySelector('[role=alert]')?.textContent).toBe('stale-precondition');
  } finally {
    detach();
    root.remove();
  }
});
