# 契約・保存形式・配布の範囲

## 対象版と接続範囲

このテンプレートは、公開リポジトリ`ryo0221/open-editor-platform`の次のcommitを使います。

```text
c5dcc2b70a6e8fc2de1c77e02d9f9855037803dd
```

| 項目 | 対応するもの |
| --- | --- |
| 拡張のroot契約 | `1.0.0-draft.1` |
| 操作提案add-on | `operations@0-draft` |
| 作成add-on | `create@0-draft`。`definition.create()`がカードの無い文書を返す。この add-on を知らない旧 Host の runtime は package を登録しない。空の形を持たない Editor は宣言と関数の両方を外す |
| 画面 | `ExtensionDefinition.mount`と`ScopedHost`を使うplain TypeScript DOM |
| 編集 | `EditorCommand`、実EPのローカル履歴とUndo/Redo |
| 保存 | 実EPの`ArtifactEditor`とstorage境界 |
| package検証 | 公開されたpackage entrypointによるバイト列と信頼済みpinの照合 |
| capabilities | `local-edit`・`surface`・`persistence` |
| permissions | `artifact:read`・`artifact:write` |
| PaoBub用出力 | native JSON、package store用JSON、Editor binding、工程定義、Project例 |

PaoBub用の出力形式の基準と、実接続の検証対象は`ryo0221/paobub`の次のcommitです。

```text
83606171e28058ea87c2ea86b6df3dc4100f433a
```

これは検証対象を特定する情報です。実PaoBubで行った検証の範囲・結果は[検証記録](verification.md)、登録・利用の手順は[PaoBub連携ガイド](paobub.md)を参照してください。

このサンプルは読み書きに必要な最小の権限を宣言し、選択権限を要求しません。draft.2、controlled surface、schema実験、共同編集、Communityへの登録、実AI呼び出しへの対応は含みません。

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
| manifestの`id`と`version` | Editor実装・配布物の識別 | `example.card-editor`／`0.3.1` |
| native本体とmanifestの`artifactKind`・`schemaVersion` | Editorが扱う本体形式の識別と版。両者で一致させる | `example.cards`／`2` |
| manifestの`contractVersion` | Hostと拡張のAPI契約 | `1.0.0-draft.1` |
| add-onの`version` | 操作公開の追加契約 | `operations@0-draft` |
| 操作宣言の`id`と`version` | 個別操作の意味と入力 | `rename-card`／`1.0.0` |
| EP Artifact外側の`schemaVersion` | EPの成果物全体を包む保存形式 | 固定したEP実装が扱う`1` |
| `packageHash` | 配布するmanifestとファイル群に対するpin | ビルドごとに実内容から算出 |

`src/model.ts`の`CARD_ARTIFACT_KIND`と`CARD_SCHEMA_VERSION`がnative形式の定数です。`createDocument`はその値を本体に付与し、manifestも同じ定数を参照します。fixture、検証例、PaoBub用の生成物もこの形式と一致させます。

Editorの見た目を変えたことと、保存形式を変更したことは別の判断です。v0.2では形式情報を必須とするため、旧カード形式からschemaを2へ進めています。旧`{ cards }`や本体schema 1を自動migrationする処理はありません。manifestの数字だけを変えて古いデータを受け入れることもしません。

既存形式の専用ビューは、元の`artifactKind`・schemaとその意味を保持できる場合に同じ形式を名乗ります。異なる意味のデータへ同じ識別子を付けて、互換として扱わないでください。

## native JSONとEPバックアップ

カードのnative本体は次の形式です。

```json
{
  "artifactKind": "example.cards",
  "schemaVersion": 2,
  "cards": []
}
```

PaoBubはこのJSONを成果物として扱い、rootのkind・schemaをEditorの宣言と照合します。開発Hostの保存とバックアップでは、本体をさらにEPの`Artifact`で包み、成果物ID、draft、保持版、来歴などを保持します。

| 操作 | このテンプレートの動作 |
| --- | --- |
| 保存 | 現在のArtifactを、実EPの保存処理を通してブラウザのIndexedDBへ保存 |
| 保存済みの再読込 | 保存したArtifactを検証して開き直す。未保存の変更を暗黙に破棄しない |
| 「PaoBub用JSONを書き出す」 | 現在のカード本体を`cards.json`へ書き出す。rootのschemaは2 |
| 「バックアップを書き出す」 | 現在のEP Artifact全体を`cards.artifact.json`へ書き出す。外側のschemaは1、`draft.content`内のカード本体はschema 2 |
| 「JSONを取り込む」 | native本体は`validateDocument`、EPバックアップは`loadHostArtifact`で検証後、本体を現在のArtifactへ1回のundoableな編集として取り込む |

読み込んだファイルの成果物IDや保持版で、現在のArtifactを丸ごと上書きする操作ではありません。カードIDは本体の一部として維持します。

本体の不正な値、違う種類の成果物、対応しない本体・EP保存形式、保持版hashの不整合などは、現在の内容を変更する前に検証します。画面からのファイル読み込みは2MiB以内です。`fixtures/example.json`はschema 2のnative本体なので、そのまま取り込めます。

v0.1で作った形式情報のないカード本体や、本体schema 1は拒否します。バックアップ外側のschemaが1でも、内側が旧カード形式なら受け入れません。保存済みの旧データを暗黙に変換・削除する処理はありません。

IndexedDBはブラウザと開いたoriginに属するローカル保存です。クラウドの保管、別端末への同期、共同編集のtransportは含みません。

## root契約の画面更新

この版の`ScopedHost`には`subscribe`がありません。Surfaceは200msごとに`host.read()`で本体を確認し、変更された場合だけカード一覧を描き直します。これにより、同じmountが続くHostでも外側で行ったUndo/Redoや操作提案の採用を反映します。unmount時にはintervalを停止します。

開発Hostは実Host側の通知に応じて表示用handleを開き直します。操作提案用handleは分けて保持し、表示の再作成が提案の破棄につながらないようにします。

画面の入力はmodalで明示的に適用・取消します。Surfaceの外部変更反映では一覧だけを更新し、dialogと未確定入力を保持します。適用時に対象カードの内容が変わっている、または削除されている場合は拒否して入力を残します。別カードへの変更は妨げません。dialogを閉じるときとunmount時には、未確定入力の確認に使うlistenerを解除します。

未確定のinline入力の同期や、ほかの契約にある入力lifecycleまで対応済みとは説明しません。

操作提案はRuntimeの本体一致検査に加え、開発Hostで準備時のrevisionと権限変更の回数を確認します。このため、値を変更してUndoで戻した場合や、権限を失って復元した場合にも古い提案を採用しません。この追加確認は`dev/host.ts`の責務であり、root契約そのものの機能として説明しないでください。

## 拡張のビルドとpin

```bash
npm run build
npm run verify:package
```

`npm run build`はvendor・型検査後、拡張、PaoBub用素材、開発Hostを生成します。開発Hostのビルドを省く場合は`npm run build:extension`を使い、拡張とPaoBub用素材を生成します。

| 出力 | 用途 |
| --- | --- |
| `dist/extension/entry.js` | 外部importを持たない拡張のESM bundle |
| `dist/extension/package.json` | `open-editor-template-package-1`形式の転送用JSON。manifestとbase64のファイル群を含む |
| `dist/extension/descriptor.json` | EPの公開package helperが作るdescriptor |
| `dist/extension/trusted-pin.json` | このローカルビルドのID・版・hashを記録したファイル |
| `dist/extension/LICENSE`、`NOTICE.txt` | packageに同梱するライセンスと通知 |
| `dist/paobub/` | PaoBubの既存package受信形式と、Project導入用の素材 |
| `dist/host/` | 拡張の開発・確認に使うHost |

`open-editor-template-package-1`はこのテンプレートの転送用wrapperです。EPの新しい公式契約として定義しているものではありません。実際の検証・読込は、wrapperから取り出したmanifestとファイルをEPの公開package APIへ渡して行います。

**信頼するpinは利用側Hostが決めます。** 受け取ったpayloadの自己申告hashや、同梱の`trusted-pin.json`／`host-pin.json`から自動的に信頼を作らないでください。開発用の検証では、自分で確認してビルドしたソースから得たpinを別入力として渡し、packageのバイト列と照合します。

`verify:package`は利用側の処理をbundleし、packageとともに一時ディレクトリへ移して実行します。テンプレートの`src/`を直接importせず、pinの不一致や改変の拒否、提案、Undo/Redo、保存・再読込などを確認する構成です。これはpackageの内容が利用者にとって信頼できるかを自動判定するものではありません。

## PaoBub向けの生成物

`scripts/export-paobub.mjs`は、同じローカルビルドのmanifest・entry・ファイル群をPaoBubの既存形式へ出力します。v0.2の初期設定では次の構成になります。

| `dist/paobub/`からの相対パス | 内容 |
| --- | --- |
| `package-store/example.card-editor@0.3.1.json` | `{ manifest, entry, files }`形式のpackage。テンプレート用wrapperの`format`や自己申告`packageHash`は含めない |
| `host-pin.json` | このビルドの`{ id, version, hash }`を確認するための記録 |
| `editor-binding.json` | 成果物`example-cards`と`ext:example.card-editor`、固定packageの対応 |
| `definition.json` | `example-card-editor-demo@0.3.1`の工程定義 |
| `project/workflow.json` | 成果物を`as: "plain"`で参照し、Editor bindingを持つProject例 |
| `project/docs/example-cards.json` | schema 2のnative本体。初期fixtureの検証済みコピー |
| `project/trace/citations.json` | Project例の初期参照情報 |

書き出し時にはnative本体をvalidatorで検証し、kind・schemaとpackage manifestの一致を確認します。EditorのID・版を変えるとpackage名やbindingもそのmanifestから生成します。工程の題材名・説明・達成条件は、自分の用途に合わせて更新してください。

生成物はHostへの登録とProject導入の材料です。`trusted.json`は生成せず、`PAOBUB_EDITOR_PACKAGES`も自動変更しません。packageの確認とHost側の信頼登録、工程定義・Projectの導入は[PaoBub連携ガイド](paobub.md)に従います。

`tests/paobub-package.test.ts`は生成物の整合とpackage検証を確認します。実PaoBubの画面で開く・編集する・保存する・開き直す経路の検証は別であり、その結果は[検証記録](verification.md)に記載します。

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
