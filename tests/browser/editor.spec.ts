import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('protects unapplied modal input when the page is reloaded', async ({ page }) => {
  await page.getByRole('button', { name: '「小さな図書館」を編集' }).click();
  await page.getByRole('dialog').getByLabel('タイトル', { exact: true }).fill('まだ適用していない入力');
  const warning = page.waitForEvent('dialog');
  // A cancelled reload never reaches a new load event. Trigger the real browser
  // reload without waiting for navigation that this test deliberately cancels.
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const dialog = await warning;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(page.getByRole('dialog').getByLabel('タイトル', { exact: true })).toHaveValue('まだ適用していない入力');
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await expect(page.getByRole('listitem').first().getByRole('heading')).toHaveText('小さな図書館');
});

test('edits, reorders, undoes, saves, and reopens the real bundled Editor', async ({ page }) => {
  await page.getByRole('button', { name: '＋ カードを追加', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('タイトル', { exact: true }).fill('新しい展示');
  await dialog.getByLabel('説明', { exact: true }).fill('地域の作品を紹介する展示です。');
  await dialog.getByLabel('色', { exact: true }).selectOption('purple');
  await dialog.getByRole('button', { name: 'カードを追加', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await page.getByRole('button', { name: '「新しい展示」を前へ移動' }).click();
  await expect(page.getByRole('listitem').nth(2)).toContainText('新しい展示');
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.getByRole('listitem').nth(3)).toContainText('新しい展示');
  await page.getByRole('button', { name: '↷ Redo', exact: true }).click();
  await expect(page.getByRole('listitem').nth(2)).toContainText('新しい展示');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#save-state')).toHaveText('保存済み');
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('listitem').nth(2)).toContainText('新しい展示');
  await expect(page.locator('#save-state')).toHaveText('保存済み');
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
});

test('previews, rejects and applies a proposal through shared Undo; old proposals stay stale', async ({
  page,
}) => {
  const original = page.getByRole('listitem').first();
  await page.getByRole('button', { name: '変更をプレビュー', exact: true }).click();
  await expect(original.getByRole('heading')).toHaveText('小さな図書館');
  await expect(page.locator('#proposal-after')).toHaveText('街の小さな図書館');
  await page.getByRole('button', { name: '破棄', exact: true }).click();
  await expect(original.getByRole('heading')).toHaveText('小さな図書館');
  await page.getByRole('button', { name: '変更をプレビュー', exact: true }).click();
  await page.getByRole('button', { name: '採用', exact: true }).click();
  await expect(original.getByRole('heading')).toHaveText('街の小さな図書館');
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(original.getByRole('heading')).toHaveText('小さな図書館');
  await page.getByRole('button', { name: '変更をプレビュー', exact: true }).click();
  await page.getByRole('button', { name: '「屋上の庭」を前へ移動' }).click();
  await expect(page.getByRole('button', { name: '採用', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: '採用', exact: true })).toBeDisabled();
  await expect(page.locator('#proposal-stale')).toBeVisible();
});

test('preserves changes on save failure and rejects corrupt import; native export is reusable', async ({
  page,
}) => {
  await page.getByRole('button', { name: '「小さな図書館」を編集' }).click();
  await page.getByRole('dialog').getByLabel('タイトル', { exact: true }).fill('保存確認');
  await page.getByRole('button', { name: '変更を適用', exact: true }).click();
  await page.getByLabel('保存エラーを再現', { exact: true }).check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#message')).toContainText('保存エラー');
  await expect(page.locator('#save-state')).toHaveText('未保存の変更');
  await expect(page.getByRole('listitem').first()).toContainText('保存確認');
  await page.getByLabel('保存エラーを再現', { exact: true }).uncheck();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#save-state')).toHaveText('保存済み');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONを書き出す', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('cards.artifact.json');
  const file = await download.path();
  await page.getByRole('button', { name: '「保存確認」を削除' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.locator('#file').setInputFiles(file!);
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('listitem').first()).toContainText('保存確認');
  await page
    .locator('#file')
    .setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":999,"cards":[]}'),
    });
  await expect(page.locator('#message')).toHaveClass(/error/);
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('read-only disables editing and invalidates retained proposals after permissions return', async ({
  page,
}) => {
  await page.getByRole('button', { name: '変更をプレビュー', exact: true }).click();
  await page.getByLabel('読み取り専用', { exact: true }).check();
  await expect(page.getByRole('button', { name: '＋ カードを追加', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '採用', exact: true })).toBeDisabled();
  await page.getByLabel('読み取り専用', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: '＋ カードを追加', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '採用', exact: true })).toBeDisabled();
  await expect(page.getByRole('listitem').first().getByRole('heading')).toHaveText('小さな図書館');
});
