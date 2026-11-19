# 自分のEditorへ変える

このテンプレートの最初の題材は、タイトル・説明・色を持つカードです。まず`npm ci`、`npm run dev`で動かし、画面を変えた結果を確認できる状態から始めます。

## 1. どちらの拡張かを決める

| 作りたいもの | 引き継ぐもの | 主に変えるもの |
| --- | --- | --- |
| 既存形式の専用ビュー | 既存モデル、形式の意味、検証、読込・保存、編集操作 | 表示、入力のまとめ方、使いやすい操作 |
| 独自形式を持つEditor | EPの拡張契約とHost接続 | nativeモデル、検証、編集操作、形式の識別情報 |

このリポジトリにある動作例は、独自の`example.cards`、schema 2を持つカードEditorです。既存形式の専用ビューを試す場合は、まずこの`CardDocument`を維持したまま表やボード表示へ変えると、データを増やさずに体験を比較できます。

### 既存形式の専用ビューを作る

例えば「カードを一覧表で比較するEditor」なら、`src/model.ts`と既存commandsを維持し、`src/Editor.ts`の表示を変えます。

1. `src/extension.ts`のEditorの`id`と`version`を自分の拡張に合わせる。
2. 同じカード形式を完全に扱える間は、本体とmanifestの`artifactKind: "example.cards"`、`schemaVersion: 2`を維持する。
3. 編集ボタンや入力欄から、既存commandsを`host.execute(...)`へ渡す。
4. 一方のビューで編集したデータをもう一方でも読み、値とカードIDが保たれることを確かめる。

ほかのEP Editorの形式を使う場合、そのモデルやcommandsの公開entrypointと契約を先に確認してください。このテンプレートは既存Editor群をすべて同梱していません。`artifactKind`だけを既存形式と同じ名前へ変えても、互換なEditorにはなりません。必要な公開依存の追加と、その形式が持つ値・意味の維持を検証します。

### 独自形式を作る

例えば「観察項目と結果を持つ実験カード」が必要なら、次の順で小さく変えます。

1. `src/model.ts`で保存する項目と制約を決める。`CARD_ARTIFACT_KIND`・`CARD_SCHEMA_VERSION`に相当する定数を設け、本体JSONにもその値を必須で持たせる。余分な項目・欠落・不正な値を検証する。
2. `src/commands.ts`で追加・更新・削除などを実装する。対象IDや条件をapply時に確認し、変更対象以外の値を維持する。
3. `src/Editor.ts`で入力と表示を作る。入力の適用・取消を明示し、同じcommandsへ接続する。
4. `src/extension.ts`で独自のEditor `id`と配布`version`を宣言し、形式情報にはモデルの定数を参照する。validatorを接続する。
5. `fixtures/example.json`、操作宣言、tests、書き出し・配布検証用の例を新しい題材へ合わせ、生成物のnative本体・manifest・bindingの一致を確認する。

最初の形式は、その用途で必要なデータに絞ってください。ユーザーID、組織権限、承認状態、AIプロバイダー設定などを、Editorの本体へ一括して追加する必要はありません。

## 2. 最初に触るファイルと、変更時の確認箇所

`Editor.ts`、`model.ts`、`commands.ts`は開発の入口です。題材、形式名、操作名を変えるときは、その名前を使うfixture・tests・出力例まで確認します。

| ファイル | 役割 |
| --- | --- |
| [src/Editor.ts](../src/Editor.ts) | `ScopedHost<CardDocument>`を受け取り、DOMを組み立てる。破棄関数を返す |
| [src/model.ts](../src/model.ts) | 本体の型、kind・schema定数、`createDocument`、`validateDocument`、`isCardDocument` |
| [src/commands.ts](../src/commands.ts) | `EditorCommand<CardDocument>`による編集。UI・操作提案の共通経路 |
| [src/operations.ts](../src/operations.ts) | `rename-card`のデータだけの宣言と、入力検査・commandへの変換 |
| [src/extension.ts](../src/extension.ts) | manifest、validator、mount、operationsの登録 |
| [dev/host.ts](../dev/host.ts) | 実EPのHost、履歴、権限、保存・再読込との接続 |
| [fixtures/example.json](../fixtures/example.json) | 正規native形式の初期データ。kind・schemaをモデルと一致させる |
| [dev/main.ts](../dev/main.ts) | 開発Hostの説明、初期表示、ファイル名、操作提案の例 |
| [scripts/export-paobub.mjs](../scripts/export-paobub.mjs) | PaoBub用package・工程定義・Project例の書き出し。題材の説明や確認条件を合わせる |
| [scripts/verify-package.mjs](../scripts/verify-package.mjs) | 独立した利用側のデータ・操作例と、保存・再読込の検証 |
| [tests](../tests) | モデル、operations、Surface、Host、package、PaoBub用生成物、ブラウザ操作の期待値 |

例えばEditorの`id`を変えると、PaoBub用のpackage名・bindingは新しいmanifestから生成されます。native形式を変える場合はモデル定数とfixtureを先に一致させ、関連testsと出力例も更新します。ファイル名が自動で変わる範囲と、題材の説明や操作例のように手で更新する範囲を分けて確認してください。

### native本体とバックアップの版

このテンプレートのnative本体は次の形です。

```json
{
  "artifactKind": "example.cards",
  "schemaVersion": 2,
  "cards": []
}
```

「PaoBub用JSONを書き出す」はこの本体を`cards.json`として保存します。「バックアップを書き出す」はEP Artifact全体を`cards.artifact.json`として保存し、外側のschema 1の中にschema 2のカード本体を保持します。

「JSONを取り込む」は両方を検証し、本体を現在のArtifactへ1回のundoableな編集として採用します。受け取ったバックアップの成果物IDや保持版は、現在の履歴へ丸ごと移しません。旧`{ cards }`とカード形式schema 1は拒否し、自動移行・自動削除は行いません。

### 最小の能力・権限から始める

初期manifestのcapabilitiesは`local-edit`、`surface`、`persistence`、permissionsは`artifact:read`、`artifact:write`です。カードの選択をHostへ送る機能は含めていません。選択や別の能力が必要なら、実際の接続先Hostが対応する契約を確認し、宣言・画面・Host接続・検証をそろえて追加します。

パネルの開閉などの表示状態は、保存する本体と分けて考えます。描画のたびにカードIDを振り直したり、表示順を別の配列へ二重に保存したりしないでください。

## 3. 人とAIの編集経路をそろえる

画面からのタイトル変更は`updateCard(id, { title })`を実行します。外部提案用の`rename-card`も、同じcommandへつなぎます。

```json
{
  "id": "card-library",
  "before": "小さな図書館",
  "title": "みんなの小さな図書館"
}
```

`before`は、提案が確認した変更前のタイトルです。操作schemaは`id`、`before`、`title`だけを認め、文字数を制限します。`checkInput`は対象IDや変更前タイトルを確認し、commandのapplyも依存した元の値を再確認します。

Runtimeのprepareで変更候補を作り、人が内容を確認してからcommitします。Runtimeは準備時と現在の本体が異なる候補を拒否します。開発Hostはさらにrevisionと権限変更の回数を保持し、変更後にUndoで同じ値へ戻った場合や、権限をいったん失って復元した場合も古い提案を拒否します。提案を却下する場合はcommitしません。

この例は外部AIへのネットワーク接続を持ちません。実際のAIをつなぐ場合、宣言された操作と必要な入力情報を渡す処理、応答の受領、利用者の権限、採否、保存はHost側で扱います。AIから本体JSONを直接上書きする別経路を作る必要はありません。

## 4. 画面更新と未確定入力

現在のroot契約`ScopedHost`には`subscribe`がありません。Surfaceは200msごとに`host.read()`を確認し、本体が変わった場合だけ一覧を描き直します。これにより、PaoBubなど同じmountが続くHostでも、外側で行ったUndo/Redoや提案の採用を表示へ反映します。unmount時にはこの確認を停止します。

開発Hostは別途、実Host側の通知に応じて表示用handleを開き直します。操作提案用handleは保持し、画面の描き直しだけを理由に準備済みの提案を閉じません。

カード編集はmodal内で入力し、「変更を適用」または「キャンセル」で確定します。Surfaceが外部変更を一覧へ反映する際にもdialogと入力内容を保持します。編集中の対象カードが変更・削除されていたら適用を拒否して入力を残し、キャンセルして開き直すと現在の内容を読めます。ほかのカードへの変更は、編集中のカードの適用を妨げません。

未確定のinline入力を広く同期する仕組みは、このサンプルの範囲には含みません。そうした体験へ広げる場合は、実際に採用する入力・lifecycle契約を確認して設計します。

## 5. 周辺の仕組みへつなぐ

| 接続先 | このEditorから提供するもの | 接続先が担うこと |
| --- | --- | --- |
| workflow-definitions | 編集する成果物の種類、利用できる操作、検証できる条件 | 工程、成果物、参照関係、達成条件の定義 |
| PaoBubなどの製品Host | manifest、validator、表示、commands／operations、kind・schemaを持つnative成果物 | 参加者、権限、入力版、実行、採否、保存、来歴 |
| Community | 説明、サンプル成果物、対応版、配布物と対応ソース | 発見、紹介、配布、改良・交流の場 |

`npm run build:extension`または`npm run build`で、PaoBub向けのpackage・binding・工程定義・Project例を`dist/paobub/`へ生成します。例えば初期設定では、packageは`package-store/example.card-editor@0.2.1.json`、成果物本体は`project/docs/example-cards.json`です。生成物だけでHostへの信頼登録や導入が済むわけではありません。手順は[PaoBub連携ガイド](paobub.md)、確認済みの範囲は[検証記録](verification.md)を参照してください。

Communityへの公開や実AIの接続は別途行います。Editorが形式と編集能力を提供し、Hostが共通の実行・保存経路を使う境界を保ちます。

## 6. 小さな完成条件

- READMEの手順で起動できる。
- 自分の題材のサンプルを、画面から編集できる。
- 保存・再読込で値と安定IDが保たれる。
- native本体とmanifestのkind・schemaが一致し、対応外の形式を拒否する。
- 不正な入力や条件が変わった操作を拒否し、元の内容・履歴を壊さない。
- UIと外部提案が同じ編集結果になり、Undo/Redoできる。
- ビルドした拡張を、ソースへ直接依存しない利用側から読み込んで確認できる。
- PaoBubで使う場合は、登録・成果物を開く・編集・保存・再読込を実PaoBubでも確認する。

題材を変えた場合は、`scripts/verify-package.mjs`にある独立した利用側のモデル例・操作例も更新します。カード専用の検証を残したまま、別形式のpackageを完成扱いにしないでください。

AIへ依頼する例です。

> `AGENTS.md`を読み、カード形式を保った表形式の専用ビューを作ってください。変更はまず画面に絞り、既存commands、保存形式、package契約を再利用してください。タイトル変更、取消、Undo/Redo、保存・再読込を確認し、実行した検証を報告してください。
