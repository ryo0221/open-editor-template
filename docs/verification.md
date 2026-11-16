# 初期版の検証記録

確認日: 2026-11-16。実行環境: Node.js 24.22.1 / npm 11.9.0。

## 確認済み

| 検査 | 結果 |
| --- | --- |
| `npm run check` | 固定した公開EPソース36ファイルの整合性とTypeScript型検査に成功 |
| `npm test` | 5ファイル、23テスト成功 |
| `npm run build` | 拡張と開発Hostのproduction buildに成功 |
| `npm run verify:package` | 新しい一時ディレクトリで実配布物を読み込み、操作・履歴・保存と不正入力拒否を確認 |
| `node scripts/vendor-isolation.mjs` | 同梱SDKだけを空の利用側へコピーし、空cache・offlineのnpm ciに成功。公開8入口が解決し、非公開/未選択7入口を拒否 |
| 本体checkoutのない別フォルダでの起動準備 | ソース一式だけをコピーし、`npm ci`、production build、独立package検証に成功 |

23テストの内訳は、モデル・commands 6、操作提案5、Host 7、独立package利用1、DOM Surface 4です。

DOMテストは、実ビルドを検証・読み込み・登録した後、**配布bundleのmount**へDOMイベントを送ります。追加・編集、Unicode入力上限、不正入力時の内容保持、権限変更後の拒否、未確定入力の離脱防止とcleanupを確認しました。jsdomで不足するdialogのopen/closeだけを補っています。EPの履歴・保存・権限・操作は実装そのものを使います。

Hostでは、保存失敗、未保存時の再読み込み拒否、native JSON検証、変更後の古い提案の拒否、変更してUndoした後の古い提案の拒否、読み取り専用から復帰しても古い提案を復活させないことを確認しています。

## 実ブラウザで残る確認

Playwrightのブラウザ起動は、この作業環境のOSソケット制限で拒否されました。追加実行権限の申請も環境の承認設定により拒否されました。クラウドブラウザからのローカル開発サーバーへの接続も成立していません。

したがって、**ネイティブdialog、フォーカス、実ブラウザの保存・ダウンロード・離脱警告、デスクトップ/モバイルのレイアウトを検証済みとはしません。** DOMテストはこれらの代替証明ではありません。

`tests/browser/editor.spec.ts`とGitHub Actionsの設定を同梱しています。ブラウザを実行できる環境で次を実行してください。

```bash
npx playwright install chromium
npm run test:e2e
```

既存のChromiumを使う場合は、`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`でその実行ファイルを指定できます。CIではPlaywrightが配布するChromiumを使います。GitHub Actionsの実行結果は、リポジトリへの配置後に確認してください。

## 対象版

公開EP commit: `0ee0c711027b73e0112a544783793a3563808dd7`。
root契約: `1.0.0-draft.1`、operations add-on: `operations@0-draft`。

この記録は初期版の確認であり、後の変更に対する継続的な合格宣言ではありません。
