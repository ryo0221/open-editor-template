# 検証記録

## 0.2.0 — PaoBub向けデータと導入素材

確認日: 2026-11-16。ローカル実行環境: Node.js 24.22.1 / npm 11.9.0。

| 検査 | 結果 |
| --- | --- |
| `npm run check` | PASS。公開EPの固定ソース36ファイルとTypeScript型検査 |
| `npm test` | PASS。7ファイル、32テスト |
| `npm run build` | PASS。拡張、PaoBub導入素材、開発Hostを生成 |
| `npm run verify:package` | PASS。独立した利用側で実packageを検証・読み込み、操作・履歴・保存を確認 |
| デスクトップ／モバイルの実ブラウザ | この版のCI結果は実行完了後に記録する |
| 実PaoBubとの統合 | 固定した対象版で検証中。結果は実行完了後に記録する |

追加した検査は、native schema 2の厳密な検証、各commandとoperationによる形式情報の維持、native JSONとEPバックアップの取り込み・書き出し、PaoBub向けpackage・pin・Definition・Projectの整合性、同じSurface上でのHost操作後のDOM更新です。Surfaceの試験は実bundle・実SDK・`EditorSession`を使い、Undo／Redo／operationの表示反映、modal入力の保持、変更済み対象への上書き拒否、timerのcleanupを確認します。

この版のpackageは`example.card-editor@0.2.0`、native形式は`example.cards`のschema 2です。EPバックアップ外側のschema 1とは別の値です。旧カード形式の自動移行は実装していません。

PaoBub統合の対象は`ryo0221/paobub@83606171e28058ea87c2ea86b6df3dc4100f433a`です。対象版を記載したことや、生成JSONの検査だけでは、実PaoBubでの受け入れ完了を意味しません。PaoBubへの配置・起動・登録は[導入ガイド](paobub.md)を参照してください。

以下は0.1の初期作成時の記録です。現在の版の結果は上の節へ記録します。

## 0.1 — 初期版

確認日: 2026-11-16。実行環境: Node.js 24.22.1 / npm 11.9.0。

### 確認済み

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

### ローカル環境のブラウザ制約

Playwrightのブラウザ起動は、この作業環境のOSソケット制限で拒否されました。追加実行権限の申請も環境の承認設定により拒否されました。クラウドブラウザからのローカル開発サーバーへの接続も成立していません。

このローカル検証だけでは、ネイティブdialog、フォーカス、実ブラウザの保存・ダウンロード・離脱警告、デスクトップ/モバイルのレイアウトを検証したことにはなりません。DOMテストはこれらの代替証明ではありません。

### CIでの実ブラウザ検証

GitHub Actionsは、Playwrightが対応するUbuntu 24.04でChromiumを導入し、`tests/browser/editor.spec.ts`の5シナリオをデスクトップ幅1280px・モバイル幅390pxの2条件で実行します。編集・並べ替え・Undo/Redo、保存と再読み込み、操作提案と権限変更、JSONの書き出しと読み込み、未確定入力の離脱警告を確認する10テストです。画面幅を超える横スクロールも自動検査します。画面全体の目視確認やSafari/Firefoxでの検証は含みません。

各commitの結果は[GitHub Actions](https://github.com/ryo0221/open-editor-template/actions)で確認してください。初回のrunは`ubuntu-latest`がUbuntu 26.04を選び、Playwrightのブラウザ依存導入で停止したため、対応するOSを明示しています。

`tests/browser/editor.spec.ts`とGitHub Actionsの設定を同梱しています。ブラウザを実行できる環境で次を実行してください。

```bash
npx playwright install chromium
npm run test:e2e
```

既存のChromiumを使う場合は、`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`でその実行ファイルを指定できます。CIではPlaywrightが配布するChromiumを使います。

### 対象版

公開EP commit: `0ee0c711027b73e0112a544783793a3563808dd7`。
root契約: `1.0.0-draft.1`、operations add-on: `operations@0-draft`。

この記録は初期版の確認であり、後の変更に対する継続的な合格宣言ではありません。
