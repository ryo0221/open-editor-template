# Open Editor Template

自分のEditorを作るための、小さなEditor Platform拡張テンプレートです。タイトル・説明・色を持つカードEditorを、**表示、編集、Undo/Redo、保存、操作提案、配布用ビルド**まで動かせます。

画面はplain TypeScriptとDOM、開発環境はViteです。Editor Platformの公開ソースから固定した実際の契約・Runtime・履歴・保存処理を使っています。Editor Platform本体のチェックアウトや、PaoBubの起動は必要ありません。

## まず動かす

Node.js **24を推奨**します。最低バージョンは22.13.0です。このリポジトリを取得し、そのディレクトリで実行してください。

```bash
npm ci
npm run dev
```

ターミナルに表示されたURLをブラウザで開きます。初回は3枚のカードで始まり、同じブラウザに保存済みデータがあれば次回はその内容を開きます。

1. カードの「編集」でタイトル・説明・色を変更し、「変更を適用」を押します。「キャンセル」では変更しません。
2. カードを追加・並べ替え・削除し、HostのUndo/Redoで戻せることを確認します。
3. 保存してから保存済みデータを再読み込みし、内容とカードIDが保たれることを確認します。
4. タイトル変更の操作提案を確認し、「採用」または「破棄」を押します。採用前には元の内容を変更しません。
5. Native JSONの書き出し・読み込みを試します。読み込み内容は検証後、現在のドキュメントへの1回の編集として取り込みます。

保存先は、この開発Hostを開いたブラウザの**IndexedDB**です。クラウド同期や別端末への同期はありません。操作提案は`rename-card`の動作例で、外部AIを呼び出していません。

「動作を確認する」パネルでは、読み取り専用への切り替えと保存エラーの再現も試せます。保存に失敗した変更は未保存のまま残り、設定を解除して同じ保存経路から再試行できます。

## 最初に触る3ファイル

| ファイル | 変えるもの |
| --- | --- |
| [src/Editor.ts](src/Editor.ts) | 画面、入力欄、操作ボタン、表示方法 |
| [src/model.ts](src/model.ts) | 保存するデータ、入力の制約、検証 |
| [src/commands.ts](src/commands.ts) | データを変更する操作。人の操作と外部提案が共通で使う経路 |

自分のEditorとして識別する情報は[src/extension.ts](src/extension.ts)で設定します。外部へ公開する操作は[src/operations.ts](src/operations.ts)、初期サンプルは[fixtures/example.json](fixtures/example.json)、見た目は[src/styles.css](src/styles.css)です。

既存形式の専用ビューとして作る方法と、独自の形式を作る方法は[カスタマイズガイド](docs/customize.md)を参照してください。

## このサンプルで扱うデータ

カード本体は次のようなデータです。`schemaVersion`はカード本体へ重ねて追加せず、拡張manifestで宣言します。

```json
{
  "cards": [
    {
      "id": "card-library",
      "title": "小さな図書館",
      "description": "近所の人がおすすめの本を持ち寄る場所。",
      "color": "blue"
    }
  ]
}
```

最大100枚、タイトルは1〜80文字、説明は500文字以内です。タイトルが空白だけの入力、重複ID、未定義の色、余分なフィールドなどは拒否します。文字数は操作schemaと同じUnicodeコードポイント数で数えます。

**このカード本体と、画面で読み書きするNative JSONは別です。** Native JSONはカード本体に成果物IDや保持版などを含むEPの`Artifact`形式です。[fixtures/example.json](fixtures/example.json)をそのままNative JSONとして読み込む使い方は想定していません。詳しくは[保存形式と互換性](docs/compatibility.md)を参照してください。

## 検証とビルド

| コマンド | 確認する内容・出力 |
| --- | --- |
| `npm run check` | 同梱EPソースの検証とTypeScriptの型検査 |
| `npm test` | モデル、コマンド、実Runtimeの操作提案、Host、独立した利用側からのpackage検証 |
| `npm run build` | 型検査後、拡張を`dist/extension/`、開発Hostを`dist/host/`へビルド |
| `npm run build:extension` | 拡張だけを`dist/extension/`へビルド |
| `npm run verify:package` | ビルド済み拡張を一時ディレクトリの独立した利用側で読み込み、pin、操作、履歴、保存を検証 |
| `npm run test:e2e` | Playwrightでブラウザ操作を検証 |
| `node scripts/vendor-sdk.mjs --check` | 同梱したEPソース、生成したpackage情報、ファイル一覧と固定版との一致を検証 |

配布前の確認例です。ブラウザ検証を初めて行う環境では、先にPlaywrightのChromiumを用意します。

```bash
npx playwright install chromium
node scripts/vendor-sdk.mjs --check
npm run check
npm test
npm run build
npm run verify:package
npm run test:e2e
```

上記は検証手順です。実行結果は各コマンドの出力で確認してください。日常の修正では変更の影響を受ける検査を選び、配布物やHostを変更した場合は対応する統合検証も行います。

初期版で確認した範囲と実ブラウザで残る確認は[検証記録](docs/verification.md)を参照してください。

## 配布するもの

`dist/extension/`が拡張のビルド結果です。実行用の`entry.js`、転送用JSON、descriptor、pin、ライセンス・通知を含みます。転送用の`package.json`はこのテンプレートの形式であり、npmへ公開するためのpackage manifestではありません。

`dist/host/`は拡張を試すための開発Hostです。PaoBubやCommunityの代わりになる製品Hostではありません。

利用側のHostは、**自分の確認・ビルドなどで信頼したpin**と、受け取った拡張の実際のバイト列を照合して読み込みます。受け取ったpayloadの`packageHash`や、同梱の`trusted-pin.json`をそのまま信頼済みとして登録する処理にはしないでください。同梱pinを利用できるのは、自分で確認したローカルビルドを検証する、このサンプルのような場合です。

配布時は対応するソースの正確な版も保管し、[LICENSE](LICENSE)と[NOTICE](NOTICE)を維持してください。手順と境界は[互換性・配布ガイド](docs/compatibility.md)にまとめています。

## EPとの接続範囲

このテンプレートは次の公開ソースを固定しています。

- 公開リポジトリ：`ryo0221/open-editor-platform`
- commit：`0ee0c711027b73e0112a544783793a3563808dd7`
- root契約：`1.0.0-draft.1`
- 操作提案のadd-on：`operations@0-draft`

5つの公開packageの必要なソースを[vendor/ep](vendor/ep/README.md)へ同梱し、ローカルの`file:`依存として使います。未公開のnpm packageや私有リポジトリへのアクセスに頼らず再現できる構成です。これは公式に公開済みのnpm SDKという意味ではありません。

PaoBub、Community、実AIプロバイダーへの接続は、このテンプレートには実装していません。共同編集、draft.2、controlled surfaceへの対応も、このroot契約の動作例から自動的には導かれません。正確な対象は[互換性ガイド](docs/compatibility.md)を参照してください。

## AIと一緒に変更する

[AGENTS.md](AGENTS.md)に、変更箇所と検証の進め方をまとめています。例えば次のように依頼できます。

> このテンプレートを、候補を比較する「実験アイデアEditor」にしてください。まず既存のCardDocumentを使って、カード表示を表形式へ変えてください。データ形式は維持し、編集は既存commandsを通してください。変更箇所と確認結果を説明してください。

## ライセンス

このテンプレートは**AGPL-3.0-only**です。[LICENSE](LICENSE)と[NOTICE](NOTICE)、同梱ソースの[vendor/ep/README.md](vendor/ep/README.md)を参照してください。同梱のAdditional Permissionは未発効のdraftであり、このテンプレートからその例外許諾を付与するものではありません。
