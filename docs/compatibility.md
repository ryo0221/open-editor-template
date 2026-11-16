# 契約・保存形式・配布の範囲

## 対象とする公開版

このテンプレートは、公開リポジトリ`ryo0221/open-editor-platform`の次のcommitを使います。

```text
0ee0c711027b73e0112a544783793a3563808dd7
```

| 項目 | 対応するもの |
| --- | --- |
| 拡張のroot契約 | `1.0.0-draft.1` |
| 操作提案add-on | `operations@0-draft` |
| 画面 | `ExtensionDefinition.mount`と`ScopedHost`を使うplain TypeScript DOM |
| 編集 | `EditorCommand`、実EPのローカル履歴とUndo/Redo |
| 保存 | 実EPの`ArtifactEditor`とstorage境界 |
| package検証 | 公開されたpackage entrypointによるバイト列と信頼済みpinの照合 |

対象はこの固定版で確認した経路です。draft.2、controlled surface、schema実験、共同編集、PaoBub接続、Communityへの登録、実AI呼び出しへの対応は含みません。

## 5つのpackageを同梱する理由

このテンプレートは、以下を`file:vendor/ep/packages/...`として参照します。

- `@editor-platform/artifact-core`
- `@editor-platform/editor-core`
- `@editor-platform/editor-host`
- `@editor-platform/extension-contract`
- `@editor-platform/extension-runtime`

未公開npm packageや、Editor Platform本体のworkspace構成を前提にせず、独立したリポジトリから実際の実装を利用するための構成です。公式に公開済みのnpm SDKとして配布しているものではありません。

実装ソースは対象公開版から変更せずに保持します。package metadataは、必要な公開entrypointの選択、同梱package間の`file:`依存、通知の追加に合わせて生成しています。元のpackage manifestとファイル単位の由来・hashは[vendor/ep/provenance.json](../vendor/ep/provenance.json)、詳しい説明は[vendor/ep/README.md](../vendor/ep/README.md)にあります。

これらはTypeScriptのソースpackageです。Vite／esbuildを通して使う構成であり、通常のNode.jsからそのまま読み込めるコンパイル済みpackageだとは扱わないでください。

## 異なる「版」を分ける

| 値 | 意味 | このサンプル |
| --- | --- | --- |
| manifestの`id`と`version` | Editor実装・配布物の識別 | `example.card-editor`／`0.1.0` |
| manifestの`artifactKind`と`schemaVersion` | Editorが扱う本体形式の識別と版 | `example.cards`／`1` |
| manifestの`contractVersion` | Hostと拡張のAPI契約 | `1.0.0-draft.1` |
| add-onの`version` | 操作公開の追加契約 | `operations@0-draft` |
| 操作宣言の`id`と`version` | 個別操作の意味と入力 | `rename-card`／`1.0.0` |
| EP Artifact外側の`schemaVersion` | EPの成果物全体を包む保存形式 | 固定したEP実装が扱う`1` |
| `packageHash` | 配布するmanifestとファイル群に対するpin | ビルドごとに実内容から算出 |

Editorの見た目を変えたことと、保存形式を変更したことは別の判断です。独自モデルを更新する場合、manifestの数字だけを変えて古いデータを自動変換できるとは考えないでください。この開発Hostは本体形式のschema 1を前提にしており、自動migrationは実装していません。

既存形式の専用ビューは、元の`artifactKind`・schemaとその意味を保持できる場合に同じ形式を名乗ります。異なる意味のデータへ同じ識別子を付けて、互換として扱わないでください。

## 保存とNative JSON

カード本体は`{ cards: [...] }`です。開発HostはこれをEPの`Artifact`として扱い、成果物ID、種類、draft、保持版、来歴などを含む形で保存・書き出しします。

| 操作 | このテンプレートの動作 |
| --- | --- |
| 保存 | 現在のArtifactを、実EPの保存処理を通してブラウザのIndexedDBへ保存 |
| 保存済みの再読込 | 保存したArtifactを検証して開き直す。未保存の変更を暗黙に破棄しない |
| Native JSONの書き出し | 現在のEP Artifact全体を書き出す |
| Native JSONの読み込み | Artifact全体を`loadHostArtifact`で検証後、`draft.content`を現在のArtifactへ1回のundoableな編集として取り込む |

読み込んだファイルの成果物IDや保持版で、現在のArtifactを丸ごと上書きする操作ではありません。カードIDは本体の一部として維持します。

本体の不正な値、違う種類の成果物、対応しないEP保存形式、保持版hashの不整合などは、現在の内容を変更する前に検証します。画面からのファイル読み込みは2MiB以内です。`fixtures/example.json`は初期本体のサンプルであり、Artifact全体ではありません。

IndexedDBはブラウザと開いたoriginに属するローカル保存です。クラウドの保管、別端末への同期、共同編集のtransportは含みません。

## root契約の画面更新

この版の`ScopedHost`は`read`、`execute`、`undo`、`redo`、`save`、`select`などを提供しますが、`subscribe`は持ちません。開発Hostは実Host側の通知に応じて表示用handleを開き直します。操作提案用handleは分けて保持し、表示の再作成が提案の破棄につながらないようにします。

画面の入力はmodalで明示的に適用・取消します。未確定のinline入力の同期や、ほかの契約にある入力lifecycleまで対応済みとは説明しません。

操作提案はRuntimeの本体一致検査に加え、開発Hostで準備時のrevisionと権限変更の回数を確認します。このため、値を変更してUndoで戻した場合や、権限を失って復元した場合にも古い提案を採用しません。この追加確認は`dev/host.ts`の責務であり、root契約そのものの機能として説明しないでください。

## 拡張のビルドとpin

```bash
npm run build
npm run verify:package
```

`npm run build`は型検査後、拡張と開発Hostをビルドします。拡張だけが必要なら`npm run build:extension`を使います。

| 出力 | 用途 |
| --- | --- |
| `dist/extension/entry.js` | 外部importを持たない拡張のESM bundle |
| `dist/extension/package.json` | `open-editor-template-package-1`形式の転送用JSON。manifestとbase64のファイル群を含む |
| `dist/extension/descriptor.json` | EPの公開package helperが作るdescriptor |
| `dist/extension/trusted-pin.json` | このローカルビルドのID・版・hashを記録したファイル |
| `dist/extension/LICENSE`、`NOTICE.txt` | packageに同梱するライセンスと通知 |
| `dist/host/` | 拡張の開発・確認に使うHost |

`open-editor-template-package-1`はこのテンプレートの転送用wrapperです。EPの新しい公式契約として定義しているものではありません。実際の検証・読込は、wrapperから取り出したmanifestとファイルをEPの公開package APIへ渡して行います。

**信頼するpinは利用側Hostが決めます。** 受け取ったpayloadの自己申告hashや、同梱のpinファイルから自動的に信頼を作らないでください。開発用の検証では、自分で確認してビルドしたソースから得たpinを別入力として渡し、packageのバイト列と照合します。

`verify:package`は利用側の処理をbundleし、packageとともに一時ディレクトリへ移して実行します。テンプレートの`src/`を直接importせず、pinの不一致や改変の拒否、提案、Undo/Redo、保存・再読込などを確認する構成です。これはpackageの内容が利用者にとって信頼できるかを自動判定するものではありません。

## 同梱ソースの確認と更新

通常の確認はネットワークを使わずに行えます。

```bash
node scripts/vendor-sdk.mjs --check
```

同じ固定版を復元する場合は、公開版から取得する`--restore`、またはそのcommitを持つローカルcheckoutを指定する次の方法を使えます。

```bash
node scripts/vendor-sdk.mjs --restore --source /path/to/open-editor-platform
```

`--generate`は保持したソースを検証したうえでpackage metadataなどを再生成します。`--restore`と`--generate`は、どちらも新しいupstreamへ追従するコマンドではありません。

新しい公開版へ更新する場合は、そのcommitとAPIを確認し、必要なソース範囲、provenance、生成metadata、スクリプト内のpin、文書の対応版を一緒に更新します。実装を独自に修正してhashを合わせる方法にはせず、変更を公開upstreamの版へ対応させてください。そのうえでvendor確認、型検査、操作・Host・配布package・画面の接続を検証します。依存の配置を変更した場合には`node scripts/vendor-isolation.mjs`で独立した`npm ci`も確認できます。

## ライセンスと公開時の記録

現在の宣言はAGPL-3.0-onlyです。[LICENSE](../LICENSE)と[NOTICE](../NOTICE)、同梱ソースの通知を維持し、配布物に対応するソースの正確な版を記録してください。

同梱したIndependent Editor Additional Permissionは未発効のdraftです。このテンプレートはその例外許諾やOEMライセンスを付与しません。`package.json`の`private: true`はnpmへの公開を防ぐ設定であり、ライセンスやGitHubリポジトリの公開範囲を変更するものではありません。
