# Open Editor Template

自分のEditorを作るための、小さなEditor Platform拡張テンプレートです。タイトル・説明・色を持つカードEditorを、**表示、編集、Undo/Redo、保存、操作提案、配布用ビルド**まで動かせます。v0.2では、PaoBubで成果物として扱う形式情報付きJSONと、Editor登録・Project作成用の素材を出力します。

画面はplain TypeScriptとDOM、開発環境はViteです。Editor Platformの公開ソースから固定した実際の契約・Runtime・履歴・保存処理を使っています。Editor Platform本体のチェックアウトや、PaoBubの起動は必要ありません。

## まず動かす

GitHubの **Use this template → Create a new repository** から、自分のEditor用のリポジトリを作成します。作成したリポジトリをcloneし、そのディレクトリで以下を実行してください。

Node.js **24を推奨**します。最低バージョンは22.13.0です。

```bash
npm ci
npm run dev
```

ターミナルに表示されたURLをブラウザで開きます。初回は3枚のカードで始まり、同じブラウザに保存済みデータがあれば次回はその内容を開きます。

1. カードの「編集」でタイトル・説明・色を変更し、「変更を適用」を押します。「キャンセル」では変更しません。
2. カードを追加・並べ替え・削除し、HostのUndo/Redoで戻せることを確認します。
3. 保存してから保存済みデータを再読み込みし、内容とカードIDが保たれることを確認します。
4. タイトル変更の操作提案を確認し、「採用」または「破棄」を押します。採用前には元の内容を変更しません。
5. 「PaoBub用JSONを書き出す」で`cards.json`を、「バックアップを書き出す」で`cards.artifact.json`を取得します。「JSONを取り込む」は両形式を検証し、現在のドキュメントへの1回の編集として取り込みます。

保存先は、この開発Hostを開いたブラウザの**IndexedDB**です。クラウド同期や別端末への同期はありません。操作提案は`rename-card`の動作例で、外部AIを呼び出していません。

「動作を確認する」パネルでは、読み取り専用への切り替えと保存エラーの再現も試せます。保存に失敗した変更は未保存のまま残り、設定を解除して同じ保存経路から再試行できます。

## カードを共同編集する

共有配布版は `npm run build:shared` で作れます。OEP の参照 Host に接続すると、複数人でのカード編集、ポインター表示、本人の Undo/Redo、共有の下書きの保存を試せます。[参照 Host の起動手順](docs/compatibility.md#カードの共同編集)

## 最初に触る3ファイル

| ファイル | 変えるもの |
| --- | --- |
| [src/Editor.ts](src/Editor.ts) | 画面、入力欄、操作ボタン、表示方法 |
| [src/model.ts](src/model.ts) | 保存するデータ、入力の制約、検証 |
| [src/commands.ts](src/commands.ts) | データを変更する操作。人の操作と外部提案が共通で使う経路 |

この3ファイルは、作り始めるための入口です。EditorのID・配布版は[src/extension.ts](src/extension.ts)、native形式のkind・schemaは[src/model.ts](src/model.ts)の定数で設定し、manifestもその定数を参照します。外部へ公開する操作は[src/operations.ts](src/operations.ts)、初期サンプルは[fixtures/example.json](fixtures/example.json)、見た目は[src/styles.css](src/styles.css)です。

形式や題材の名前を変えるときは、**extension、model、fixture、operations、tests、書き出し・配布検証用の例**を一緒に確認します。詳しい対応表は[カスタマイズガイド](docs/customize.md)にあります。

既存形式の専用ビューとして作る方法と、独自の形式を作る方法は[カスタマイズガイド](docs/customize.md)を参照してください。

## このサンプルで扱うデータ

PaoBubで開くカード本体は次の形式です。ファイル自身から形式を判定できるよう、`artifactKind`と`schemaVersion`を必須にしています。値はmanifestの宣言と一致させます。

```json
{
  "artifactKind": "example.cards",
  "schemaVersion": 2,
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

### 2種類のJSON

| 画面の操作・ファイル | 内容と用途 |
| --- | --- |
| 「PaoBub用JSONを書き出す」→`cards.json` | `artifactKind: "example.cards"`、`schemaVersion: 2`、`cards`を持つnative本体。PaoBubの成果物ファイルとして使う |
| 「バックアップを書き出す」→`cards.artifact.json` | 本体を包むEP Artifact全体。外側の保存形式はschema 1で、`draft.content`内のカード本体はschema 2 |

「JSONを取り込む」はどちらも受け付け、検証後にカード本体を現在のArtifactへ1回のundoableな編集として取り込みます。バックアップ側の成果物ID・保持版で、現在のArtifactを丸ごと上書きする操作ではありません。[fixtures/example.json](fixtures/example.json)も、直接取り込めるschema 2のnative本体です。

v0.1の形式情報がない`{ cards }`や、カード形式のschema 1は拒否します。旧データを暗黙に移行したり、削除したりしません。**カード本体のschema 2と、EPバックアップ外側のschema 1は別の版**です。詳しくは[保存形式と互換性](docs/compatibility.md)を参照してください。

## 検証とビルド

| コマンド | 確認する内容・出力 |
| --- | --- |
| `npm run check` | 同梱EPソースの検証とTypeScriptの型検査 |
| `npm test` | モデル、コマンド、実Runtimeの操作提案、Host、独立した利用側からのpackage検証 |
| `npm run build` | 検査後、拡張を`dist/extension/`、PaoBub用素材を`dist/paobub/`、開発Hostを`dist/host/`へ生成 |
| `npm run build:extension` | 拡張とPaoBub用素材を生成。開発Hostのビルドは省略 |
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

確認済みの版・範囲と、実PaoBubでの接続確認は[検証記録](docs/verification.md)を参照してください。テンプレート内の単体検査・package検証と、実PaoBubの画面・保存経路を通す検証は区別して記録します。

## 配布するもの

| 出力 | 用途 |
| --- | --- |
| `dist/extension/` | 拡張のESM bundle、テンプレート用の転送JSON、descriptor、pin、ライセンス・通知 |
| `dist/paobub/` | PaoBubのpackage store用JSON、pinの確認用記録、Editor binding、工程定義とProject例 |
| `dist/host/` | ローカルで拡張を試す開発Host |

`dist/extension/package.json`はこのテンプレートの転送用wrapperです。PaoBubへ渡すpackageは`dist/paobub/package-store/example.card-editor@0.3.1.json`で、同じmanifest・entry・ファイル群をPaoBubが受け取る形で出力します。どちらもnpmへ公開するためのpackage manifestではありません。

`dist/host/`は拡張を試すための開発Hostです。PaoBubやCommunityの代わりになる製品Hostではありません。

利用側のHostは、**自分の確認・ビルドなどで信頼したpin**と、受け取った拡張の実際のバイト列を照合して読み込みます。受け取ったpayloadの`packageHash`や、同梱の`trusted-pin.json`／`host-pin.json`をそのまま信頼済みとして登録する処理にはしないでください。同梱pinを利用できるのは、自分で確認したローカルビルドを検証する、このサンプルのような場合です。

### PaoBubで使う

`npm run build:extension`または`npm run build`で、`dist/paobub/`へ次を生成します。

- `package-store/example.card-editor@0.3.1.json`：拡張package。
- `host-pin.json`：このビルドのID・版・hashを確認するための記録。
- `editor-binding.json`：成果物と、`ext:example.card-editor`＋固定package版の対応。
- `definition.json`：カードを編集・保存して確かめる最小の工程定義。
- `project/workflow.json`、`project/docs/example-cards.json`、`project/trace/citations.json`：Project例とschema 2のnative成果物。

生成だけではHostの信頼登録やProjectへの導入は完了しません。`trusted.json`や`PAOBUB_EDITOR_PACKAGES`を自動変更する処理はありません。登録・起動・保存確認の手順は[PaoBub連携ガイド](docs/paobub.md)を参照してください。

配布時は対応するソースの正確な版も保管し、[LICENSE](LICENSE)と[NOTICE](NOTICE)を維持してください。手順と境界は[互換性・配布ガイド](docs/compatibility.md)にまとめています。

## EPとの接続範囲

このテンプレートは次の公開ソースを固定しています。

- 公開リポジトリ：`ryo0221/open-editor-platform`
- commit：`297d261486bff1e7cb3831df3207303cacdd46c0`
- root契約：`1.0.0-draft.1`
- 操作提案のadd-on：`operations@0-draft`
- 最初の中身を作るadd-on：`create@0-draft`（カードの無い文書を返す。Hostがまだ無い成果物を作るときに使う）
- Editorの配布版：`example.card-editor@0.3.1`
- カードのnative形式：`example.cards`、schema 2

初期manifestは、`local-edit`・`surface`・`persistence`と、`artifact:read`・`artifact:write`だけを宣言します。選択操作の権限は要求しません。追加の能力が必要になった場合は、対応するHostとの接続を確認してから宣言と実装を加えます。

5つの公開packageの必要なソースを[vendor/ep](vendor/ep/README.md)へ同梱し、ローカルの`file:`依存として使います。未公開のnpm packageや私有リポジトリへのアクセスに頼らず再現できる構成です。これは公式に公開済みのnpm SDKという意味ではありません。

PaoBubへの接続には生成したpackage・Project素材を使います。Communityへの公開や実AIプロバイダーへの接続は含みません。共同編集、draft.2、controlled surfaceへの対応も、このroot契約の動作例から自動的には導かれません。正確な対象は[互換性ガイド](docs/compatibility.md)を参照してください。

## AIと一緒に変更する

[AGENTS.md](AGENTS.md)に、変更箇所と検証の進め方をまとめています。例えば次のように依頼できます。

> このテンプレートを、候補を比較する「実験アイデアEditor」にしてください。まず既存のCardDocumentを使って、カード表示を表形式へ変えてください。データ形式は維持し、編集は既存commandsを通してください。変更箇所と確認結果を説明してください。

## ライセンス

このテンプレートは**AGPL-3.0-only**です。[LICENSE](LICENSE)と[NOTICE](NOTICE)、同梱ソースの[vendor/ep/README.md](vendor/ep/README.md)を参照してください。同梱のAdditional Permissionは未発効のdraftであり、このテンプレートからその例外許諾を付与するものではありません。
