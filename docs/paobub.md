# PaoBubでカードEditorを使う

このテンプレートは、PaoBubに既にある外部Editorの検証・登録・Project binding・編集・保存・操作提案の経路へ接続します。PaoBub本体へカード専用のHostや形式別の分岐を追加する手順ではありません。

**PaoBubは未公開です。** このガイドは、PaoBubのリポジトリへのアクセス権と、通常のローカル起動環境を持つ開発者向けです。テンプレート単体の開発Hostは、PaoBubへのアクセスなしで動かせます。

## 対象の版と確認範囲

| 対象 | このガイドの基準 |
| --- | --- |
| PaoBub | `ryo0221/paobub` main `83606171e28058ea87c2ea86b6df3dc4100f433a` |
| テンプレートのEditor | `example.card-editor@0.3.0` |
| カードのnative形式 | `artifactKind: "example.cards"`、`schemaVersion: 2` |
| 拡張のAPI契約 | `1.0.0-draft.1`、操作提案は`operations@0-draft` |
| 利用するHost | 運用者がpackageを確認して信頼する、手元のPaoBub |

手順の基準は、PaoBubの[外部Editor設計・配置手順](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/docs/design/external-editor-binding.md)、[H2見本B](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/tests/e2e/h2-samples.ts)、現行の起動・登録コードです。ソース上の接続と、実際のPaoBubで実行した試験は区別します。実行結果・対象SHA・未実施項目は[検証記録](verification.md)を参照してください。この手順書自体はE2Eの成功記録ではありません。

0.3.0 の実PaoBub 4ケースは未実施です。0.2.0 の過去の成功を新版の受入結果とは扱わず、新pinを確認してからHost側で別途検証・信頼登録してください。

## 1. 自分で確認したソースをビルドする

テンプレートのディレクトリで実行します。Node.js 24を推奨します。

```bash
npm ci
npm run check
npm run build:extension
npm run verify:package
```

`npm run build`でも同じ配布物を生成し、開発Hostを追加でビルドします。

| `dist/paobub/`内のファイル | 用途 |
| --- | --- |
| `package-store/example.card-editor@0.3.0.json` | PaoBub用のpackage本体。`manifest`、`entry`、base64の`files`を持つ |
| `host-pin.json` | このローカルビルドの`{ id, version, hash }`。運用者が信頼する版を確認する材料 |
| `editor-binding.json` | 成果物IDから`ext:example.card-editor`とpackage pinへの対応 |
| `definition.json` | `example-card-editor-demo@0.3.0`の最小ワークフロー定義 |
| `project/workflow.json` | 成果物・工程・Thread・Editor bindingのProject設定 |
| `project/docs/example-cards.json` | 初期カードのnative JSON。`fixtures/example.json`を検証して出力 |
| `project/trace/citations.json` | Projectが使う空の引用・免除一覧 |

EditorのID・版・形式はビルドしたmanifest、初期データはfixtureから生成します。PaoBub用packageと`dist/extension/package.json`は、同じmanifest・entry・ファイル群に対する同じpinを使います。`LICENSE`と`NOTICE.txt`もpackageの検証対象です。

以下は初期テンプレートの名前で説明します。IDやversionを変えた場合は、生成されたファイル名と設定値を使ってください。古い版の出力が残っている場合も、今回導入する**一つの版**を選びます。フォルダー内の全packageをまとめて信頼する手順にはしません。

## 2. Hostの置き場へpackageを置き、運用者がpinを登録する

packageの置き場は、Editorの開発リポジトリやProjectのリポジトリの外に用意します。以下の`CARD_TEMPLATE`は、手順1を実行したテンプレートの絶対パスに置き換えます。稼働中のHostへ追加する場合は、既存の`PAOBUB_EDITOR_PACKAGES`を使ってください。

```bash
export CARD_TEMPLATE=/absolute/path/to/open-editor-template
export PAOBUB_EDITOR_PACKAGES="$HOME/.local/share/paobub/editor-packages"
mkdir -p "$PAOBUB_EDITOR_PACKAGES"

cat "$CARD_TEMPLATE/dist/paobub/host-pin.json"
cp -i "$CARD_TEMPLATE/dist/paobub/package-store/example.card-editor@0.3.0.json" \
  "$PAOBUB_EDITOR_PACKAGES/example.card-editor@0.3.0.json"
```

同じID・versionのファイルが既にある場合は、中身とpinを確認します。内容が異なる版を配るときはEditorのversionを上げて再ビルドし、既存Projectが使う版を残してください。

**Hostを動かす人が、ソースとビルド結果を確認して、このpinのコードを実行してよいと判断します。** packageに付いてきたhashは、その判断の代わりにはなりません。

判断した後、`PAOBUB_EDITOR_PACKAGES/trusted.json`の配列へ、そのpinを一件追加します。ファイルがなければ配列を新規作成します。既存ファイルがある場合は**他の要素を保持して編集**してください。`host-pin.json`でファイル全体を置き換えることも、配列でなく単一オブジェクトを保存することも避けます。

```json
[
  {
    "id": "example.card-editor",
    "version": "0.3.0",
    "hash": "sha256:<自分で確認した今回のビルドの64桁のhash>"
  }
]
```

上のhash欄は説明用です。実際には確認した`host-pin.json`の値をそのまま使います。生成スクリプトは`trusted.json`を作成・置換せず、Hostへの登録も行いません。Projectの`editor-binding.json`だけを変更しても、信頼の追加にはなりません。

この手順は、生成済みのpackage JSONをPaoBubの置き場へ配置します。PaoBubの`editor:pack`は、`manifest.json`とentry・配布ファイルを置いた元フォルダーを入力にする別のビルド入口です。補助JSONを含む`dist/extension/`全体をその入力にすると、同じ配布物にはなりません。

## 3. 定義とProjectの成果物を配置する

PaoBubの定義の置き場は`PAOBUB_MVP_DEFINITIONS`です。既定は`~/repos/open-workflow-definitions/definitions`で、直下のJSONを読みます。稼働中のHostでは、他のProjectが使っている定義の置き場をそのまま使い、今回の定義を追加します。

```bash
export PAOBUB_MVP_DEFINITIONS="$HOME/repos/open-workflow-definitions/definitions"
mkdir -p "$PAOBUB_MVP_DEFINITIONS"
cp -i "$CARD_TEMPLATE/dist/paobub/definition.json" \
  "$PAOBUB_MVP_DEFINITIONS/example-card-editor-demo.json"
```

次に、**新しい空の場所**へProject例をコピーし、Gitの最初のcommitを作ります。既存Projectの`workflow.json`をこの例で丸ごと置き換えないでください。`CARD_PROJECT`にはPaoBubを動かすPCから読める絶対パスを指定します。Gitの署名者名・メールは自分の通常の設定を使います。

```bash
export CARD_PROJECT="$HOME/repos/card-editor-demo"
mkdir -p "$HOME/repos"
mkdir "$CARD_PROJECT"
cp -R "$CARD_TEMPLATE/dist/paobub/project/." "$CARD_PROJECT/"
cp "$CARD_TEMPLATE/dist/paobub/definition.json" "$CARD_PROJECT/definition.json"
git -C "$CARD_PROJECT" init -b main
git -C "$CARD_PROJECT" add workflow.json definition.json docs/example-cards.json trace/citations.json
git -C "$CARD_PROJECT" commit -m "Start the card Editor example"
```

`mkdir`などが既存ファイルを理由に失敗した場合は、続行せず別の新規パスを選びます。PaoBubはcommitされた`workflow.json`と成果物を読みます。Project内の`definition.json`もcommitしておくと、そのProjectで使う定義の写しを保持できます。[現行のProject読込みコード](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/apps/api/src/repo/feature.ts#L106-L142)

生成した設定は次の対応を持ちます。

```json
{
  "deliverables": {
    "example-cards": [{ "path": "docs/example-cards.json", "as": "plain" }]
  },
  "editorBindings": {
    "example-cards": {
      "editor": "ext:example.card-editor",
      "package": {
        "id": "example.card-editor",
        "version": "0.3.0",
        "hash": "sha256:<確認したビルドのhash>"
      }
    }
  }
}
```

これは`workflow.json`の説明用抜粋です。生成された完全なファイルには、定義ID・版、工程`edit`、Thread「編集」、引用一覧の場所も入っています。`as: "plain"`はPaoBubのファイル読取り方です。Editorは`editorBindings`で選び、カードの形式はJSON本体とmanifestの一致で確認します。workflow定義の中へ実行コードやEditorの設定を埋め込みません。

## 4. 手元のPaoBubを起動する

PaoBub側で通常の依存・submoduleの準備を済ませたうえで、**PaoBubのcheckout**へ移動します。同じシェルで、上の二つの環境変数をPaoBubへ渡してください。

```bash
cd /absolute/path/to/paobub
export PAOBUB_MVP_HOST=127.0.0.1
export PAOBUB_MVP_AI=fake
npm run dev
```

現行の通常ポートはWebが`http://127.0.0.1:4840`、APIが`http://127.0.0.1:4841`です。停止はPaoBub側の`npm run dev:stop`です。`PAOBUB_MVP_AI=fake`は実AIを呼ばない動作確認用で、自然言語から任意のEditor操作が生成されることを保証する設定ではありません。[PaoBub README](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/README.md)、[起動スクリプト](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/scripts/dev.sh)

外部packageの配布は、PaoBubの入口がローカルHostと判断した場合だけ有効です。対象版では`127.0.0.1`で待ち受け、`PAOBUB_ENV`とクラウドの保存構成を使わない手元の構成が条件です。共用クラウドへ環境変数を一つ足すだけで外部コードを有効にする手順ではありません。[起動時の有効条件](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/apps/api/src/main.ts#L45-L72)

環境変数を変える前からPaoBubが動いていた場合は、通常の停止・起動を行って新しい設定を渡します。`scripts/dev.sh`は既存の起動プロセスへ環境変数を追加しません。また、`PAOBUB_MVP_AI`を指定した場合、同スクリプトは通常の環境ファイルを自動読込みしません。Artifactsを使うUI導線では、その接続情報をPaoBubの既存の運用方法で渡してください。

## 5. PaoBubへProjectを登録する

### 手元で接続を検証する既存API

PaoBubで利用するWorkspaceを用意し、通常の認証済みクライアントから次を確認します。認証・組織・Workspaceの権限は、PaoBubの既存設定を使います。

1. `GET /api/definitions/example-card-editor-demo`で定義を取得し、`problems`が空であることを確認する。
2. 以下のbodyで`POST /api/repo-projects`を呼ぶ。`workspaceId`は実際のWorkspace ID、`path`は手順3の絶対パスへ置き換える。

```json
{
  "workspaceId": "<利用するWorkspace ID>",
  "repo": {
    "mode": "existing",
    "path": "/absolute/path/to/card-editor-demo"
  }
}
```

この入口は現行の[Project作成API](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/apps/api/src/repo/feature.ts#L1060-L1172)にある経路です。commit済みの`workflow.json`がある場合、名前・定義・bindingをそのファイルから読みます。API応答のProject IDを使って、PaoBubで作成したProjectを開きます。同じ場所が既にProjectに登録されている場合は、その既存Projectを使います。

### Artifactsを接続済みなら、通常のUIから送る

対象版のUIでは「Project を作る」→主のリポジトリ「手元から送る」から、手順3のGitリポジトリを選べます。Artifactsでの名前を指定して「送る」を押すと、リポジトリをArtifactsへ送り、その写しを開きます。この操作にはPaoBubの通常のArtifacts接続設定が必要です。`workflow.json`があるリポジトリは、その名前と定義を読みます。[現行のProject作成画面](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/apps/web/src/pages/Home.tsx#L163-L327)

UIの「既存を選ぶ」はArtifacts上のリポジトリを選ぶ操作です。手元の絶対パスを入力する欄としては説明していません。ローカル検証のAPI経路と、Artifactsへ送るUI経路は、どちらも既存のProject登録を使います。

## 6. 開く・編集・保存を確認する

ProjectのThread「編集」で、成果物「カード」の`docs/example-cards.json`を開きます。PaoBubの「外部 Editor の登録」の表示で`example.card-editor@0.3.0`が使われていることを確認してください。

1. カードの「編集」でタイトルを変更し、「変更を適用」を押す。
2. PaoBubの「取り消す」「やり直す」で内容と一覧が戻ることを確認する。カードIDや他のカードの値は維持される。
3. PaoBubの「保存する」を押し、成功後にファイルを開き直す。同じpackage pinと保存したnative内容で開けることを確認する。
4. 読み取り専用の権限では、Hostが変更・保存を拒否することを確認する。権限やpinの失効を、保存成功として扱わない。
5. modalに未適用の入力がある間は、取消するか適用してから別の作業へ移る。対象カードが外部で変わった場合は入力を保持したまま適用を拒否するので、入力を控え、取消して現在の内容を開き直す。

一覧は、同じSurfaceを表示したままHostがUndo／Redo／提案を適用した場合も同期します。200msごとに現在の内容を比較し、変更時だけ一覧を描き直します。modalの入力は描き直さず、Surfaceを閉じたときに同期処理を止めます。

PaoBubでは既存のGit保存経路を使います。テンプレートの開発Hostが使うIndexedDBと、PaoBubのProjectの保存先は別です。保存ボタンを押したことだけで成功とはせず、Hostの応答と再読込みを確認してください。

## 開発Hostから自分のカードを持ち込む

| 開発Hostの操作 | 出力と用途 |
| --- | --- |
| 「PaoBub用JSONを書き出す」 | 現在のカードを`cards.json`へ出力。`artifactKind`・schema 2・`cards`を持つ本体 |
| 「バックアップを書き出す」 | `cards.artifact.json`。成果物ID・保持版などを含むEP Artifact全体 |
| 「JSONを取り込む」 | どちらも検証し、本体を現在のArtifactへ1回のundoableな編集として取り込む |

最初から自分の内容でPaoBubを始める場合は、「PaoBub用JSONを書き出す」で得たファイルを、手順3の初回commit前に`docs/example-cards.json`へ配置します。既存Projectの内容を置き換える場合は、そのProjectの通常の変更・保存手順を使ってください。

EPのバックアップは、そのままPaoBubのカード成果物に置く形式ではありません。バックアップ外側の`schemaVersion: 1`と、カード本体の`schemaVersion: 2`は別の値です。v0.1の形式情報を持たない`{ "cards": [...] }`、カードschema 1、未知のschemaは拒否します。自動移行や旧データの削除は行いません。

## AIの操作提案

packageは`rename-card@1.0.0`を公開しています。入力例は次のとおりです。

```json
{
  "id": "card-library",
  "before": "小さな図書館",
  "title": "街の図書館"
}
```

`before`は現在確認したタイトルです。カードが存在しない、元のタイトルが変わった、入力がschemaに合わない場合は拒否します。UIと公開operationは同じ編集commandを使います。

PaoBubの対応済みAI／Runner・権限・方針を設定した環境では、外部Editorの「Room で AI に頼む」から既存のrun／proposalへ接続します。提案を「採用する」でEditorに適用した時点では未保存です。「取り消す」「やり直す」を使え、ファイルへ確定するには既存の「保存する」を通します。[PaoBubの提案・採否UI](https://github.com/ryo0221/paobub/blob/83606171e28058ea87c2ea86b6df3dc4100f433a/apps/web/src/editor/ExternalEditorSurface.tsx#L215-L277)

このテンプレートはAIプロバイダーの認証情報やRunnerを設定しません。公開operationの動作確認、PaoBubの決定的なfixtureによる接続試験、実AIが期待する提案を返した確認は、それぞれ別に記録します。

## 開けないとき

| 状態 | 確認するもの |
| --- | --- |
| packageが無い・未導入 | `PAOBUB_EDITOR_PACKAGES`と、選択した`<id>@<version>.json`の配置 |
| 信頼されていない | 運用者が確認した`trusted.json`のpinと、Project bindingのID・version・hashが完全一致するか |
| 破損・pin不一致 | 配布後のbytesやmanifestを変更していないか。元の検証済みbuildと照合する |
| 形式不一致 | ファイルがnative本体か。`example.cards`／schema 2がmanifestと一致するか。バックアップを置いていないか |
| 定義が無い・設定が合わない | commit済み`definition.json`、定義の置き場、`workflow.json`のID・版・成果物ID |
| 読むだけになる | Projectの編集権限、packageの能力・権限、信頼の取消、bindingの変更、他の成果物とのファイル共有 |

別のEditorへ自動的に切り替えて編集を続ける手順にはしません。表示された拒否理由を確認し、未保存の作業内容を確保してから、pinや設定を直して明示的に開き直してください。
