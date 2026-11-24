import { test, expect, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';

test('2人のカード編集、本人の Undo、再読み込み後の Redo と保存', async ({ browser }) => {
  const oep = process.env.OEP_ROOT;
  if (!oep) throw Error('Set OEP_ROOT to the OEP checkout containing collaboration:external');
  const dir = mkdtempSync(join(tmpdir(), 'card-shared-'));
  const server = spawn(
    process.execPath,
    [
      'apps/collaboration-reference/external/server.mjs',
      resolve('dist/shared/package.json'),
      resolve('dist/shared/pins.json'),
      resolve('fixtures/example.json'),
      join(dir, 'draft.db'),
      '0',
    ],
    { cwd: oep, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const exited = once(server, 'exit');
  try {
    const lines = createInterface({ input: server.stdout });
    const origin = await Promise.race([
      once(lines, 'line').then(([line]) => line as string),
      exited.then(() => {
        throw Error('Reference Host exited');
      }),
    ]);
    const a = await browser.newPage(),
      b = await browser.newPage();
    const errors: string[] = [];
    for (const page of [a, b]) page.on('pageerror', (err) => errors.push(err.message));
    await Promise.all([a, b].map((p) => p.goto(origin)));
    const cards = (p: Page) => p.locator('[data-card-id]');
    await expect(cards(a)).toHaveCount(3);
    await expect(cards(b)).toHaveCount(3);
    await cards(a).nth(0).getByText('編集', { exact: true }).click();
    await cards(b).nth(1).getByText('編集', { exact: true }).click();
    await a.locator('dialog input').fill('Aの変更');
    await b.locator('dialog input').fill('Bの変更');
    await Promise.all([a, b].map((p) => p.getByText('変更を適用', { exact: true }).click()));
    await expect(cards(a).nth(1)).toContainText('Bの変更');
    await expect(cards(b).nth(0)).toContainText('Aの変更');
    await a.getByText('元に戻す', { exact: true }).click();
    await expect(cards(b).nth(0)).not.toContainText('Aの変更');
    await expect(cards(a).nth(1)).toContainText('Bの変更');
    const devtools = await a.context().newCDPSession(a);
    await devtools.send('ServiceWorker.enable');
    await devtools.send('ServiceWorker.stopAllWorkers');
    await devtools.detach();
    await a.reload();
    await expect(a.locator('#redo')).toBeEnabled();
    await a.locator('#redo').click();
    await expect(cards(b).nth(0)).toContainText('Aの変更');
    await b.locator('#save').click();
    await expect(b.locator('#status')).toContainText('保存した版');
    await cards(a).nth(0).getByText('編集', { exact: true }).click();
    await cards(b).nth(0).getByText('編集', { exact: true }).click();
    await a.locator('dialog input').fill('確定した名前');
    await b.locator('dialog input').fill('残す入力');
    await a.getByText('変更を適用', { exact: true }).click();
    await expect(cards(b).first()).toContainText('確定した名前');
    await b.getByText('変更を適用', { exact: true }).click();
    await expect(b.locator('dialog [role=alert]')).toContainText('stale-precondition');
    await expect(b.locator('dialog input')).toHaveValue('残す入力');
    await b.getByText('キャンセル', { exact: true }).click();
    await a.getByText('＋ カードを追加', { exact: true }).click();
    await a.locator('dialog input').fill('共同編集のカード');
    await a.locator('dialog').getByText('カードを追加', { exact: true }).click();
    await expect(cards(b)).toHaveCount(4);
    await b.getByLabel('「共同編集のカード」を前へ移動').click();
    await expect(cards(a).nth(2)).toContainText('共同編集のカード');
    await b.getByLabel('「共同編集のカード」を削除').click();
    await expect(cards(a)).toHaveCount(3);
    await b.locator('#undo').click();
    await expect(cards(a).nth(2)).toContainText('共同編集のカード');
    await cards(a).nth(2).hover();
    await expect(b.locator('[aria-label="共同編集中のポインター"]').first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    server.kill();
    await exited;
    rmSync(dir, { recursive: true });
  }
});
