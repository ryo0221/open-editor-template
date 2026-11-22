# このテンプレートで作業するAIへ

## 最初に読む

1. `README.md`で、起動方法と実装範囲を確認する。
2. `src/Editor.ts`、`src/model.ts`、`src/commands.ts`で、画面・データ・編集経路を確認する。
3. 操作や登録を変える場合は`src/operations.ts`、`src/extension.ts`を読む。Hostや配布を変える場合は`dev/`、`scripts/`、`docs/compatibility.md`も読む。PaoBubへ接続する場合は`docs/paobub.md`と`docs/verification.md`で手順・検証対象・結果を分けて確認する。

ユーザーが望む題材や操作に合わせ、小さな動く変更を進める。将来の拡張だけを理由に、汎用フレームワークや新しいSDK契約を増やさない。

現行の配布版は`example.card-editor@0.3.1`、native形式は`example.cards`のschema 2。最初の3ファイルは入口であり、題材や識別情報を変更する場合はextension・model・fixture・operations・tests・書き出しと配布検証の例まで整合を確認する。

## 実装の境界

- 画面はplain TypeScript DOM。表示する文字列は`textContent`などで扱う。
- `CardDocument`が編集対象の本体。PaoBubがファイル自身から形式を判定するため、rootに`artifactKind`・`schemaVersion`を持たせる。`src/model.ts`の定数、manifest、validator、commands、fixtureの値を一致させる。現在のカード形式はschema 2、EP Artifact外側の保存形式はschema 1であり、両者を混同しない。
- 編集は`@editor-platform/editor-core`の実際の`EditorCommand`を使う。入力を変更せず、新しい結果を返し、対象の存在・値・制約をapply時に検証する。
- 人の画面操作と外部の操作提案は同じcommandsを使う。操作提案から、別の直接書き換え・履歴・保存経路を作らない。
- 外部操作は`OperationDeclaration`と`OperationsAdapter`の実契約に従う。入力schemaを閉じ、文字列・配列には上限を付ける。schemaで表せない条件は`checkInput`、依存した元の値はcommandのapplyでも確認する。
- 現行root契約は`1.0.0-draft.1`、add-onは`operations@0-draft`。存在を確認していないAPIや、draft.2／controlledの機能を推測して利用しない。
- Editorが受け取るのは`ScopedHost`。権限判定、履歴、保存、packageの信頼確認、AI呼び出しはHostの責務に置く。
- このroot契約に`subscribe`はない。Surfaceは200msごとの`host.read()`で外部変更を確認し、変更時だけ一覧を描画する。modalと未確定入力は保持し、unmount時にintervalとdialog用listenerを解除する。独自の契約メソッドを追加しない。開発Hostは表示用handleを再作成する場合も、操作提案用handleを維持する。
- 入力は現在のサンプルではmodalの適用／取消で確定する。編集中の対象カードが変更・削除されていたら適用を拒否して入力を保持し、別カードの変更は妨げない。未確定のinline入力や非同期入力を追加する場合は、その状態とHost操作との関係を先に具体化する。

## 保存・配布

- 保存・再読込は実EPの`ArtifactEditor`とstorage境界を使う。
- PaoBub用JSONの`cards.json`は形式情報付きの`CardDocument`。バックアップJSONの`cards.artifact.json`はEPのArtifact全体。どちらも検証後、現在のArtifactへ本体を1回のundoableな編集として取り込む。受け取ったIDや保持版で現在の履歴を丸ごと上書きしない。旧metadataなしのカード形式・schema 1は拒否し、暗黙の移行や削除をしない。
- 最小サンプルのpermissionsは`artifact:read`・`artifact:write`、capabilitiesは`local-edit`・`surface`・`persistence`。Host側の接続を検証せずに`selection:write`等の能力や権限を追加しない。
- カードIDは作成時に決め、名前の変更、並べ替え、保存で作り直さない。
- 配布用コードは`dist/extension/`、PaoBub用package・binding・工程定義・Project例は`dist/paobub/`、開発Hostは`dist/host/`。`scripts/export-paobub.mjs`は同じローカルビルドをPaoBubの既存受信形式へ出力する。テンプレートの転送用wrapperを、公式SDK契約やnpm公開形式として説明しない。
- packageが自己申告したpinや、同梱の`host-pin.json`／`trusted-pin.json`を、利用側Hostの信頼情報として無条件に採用しない。生成だけでHostへの導入は完了しない。書き出しスクリプトは`trusted.json`や`PAOBUB_EDITOR_PACKAGES`を自動変更しない。

## 同梱SDK

`vendor/ep/`は公開commit `c5dcc2b70a6e8fc2de1c77e02d9f9855037803dd`から固定した5つのpackageのソース。通常のEditor変更で直接修正しない。importは各packageが公開するentrypointを使い、`src/`へのdeep importや私有リポジトリへの依存を追加しない。

SDK更新が必要なら、公開upstreamの対象版・契約・必要ファイルを確認し、pinとprovenanceを伴う更新として扱う。`node scripts/vendor-sdk.mjs --check`を通すためにhashだけを合わせる変更はしない。`--restore`は同じ固定版の復元であり、upstream追従機能ではない。

PaoBub用出力の基準・実接続の検証対象は`ryo0221/paobub@83606171e28058ea87c2ea86b6df3dc4100f433a`。この対象版の指定をE2E成功の証拠として扱わない。実施した検証と結果は`docs/verification.md`へ記録する。

## 検証の選び方

| 変更箇所 | 主な確認 |
| --- | --- |
| モデル・commands | `npm run check`、`npx vitest run tests/model.test.ts` |
| operations | 上記と`npx vitest run tests/operations.test.ts`。入力拒否、元の値、無関係な値の保持を確認 |
| Host・保存・権限 | `npx vitest run tests/host.test.ts`、必要なブラウザ操作 |
| 画面 | `npm run check`、`npx vitest run tests/surface.test.ts`、`npm run test:e2e`。外部Undo/Redoの反映と未確定入力・競合の扱いも確認 |
| ビルド・package | `npm run build`、`npm run verify:package`、`tests/package.test.ts` |
| PaoBub用出力・接続 | `npx vitest run tests/paobub-package.test.ts`で出力整合を確認し、実PaoBubでの登録・表示・編集・保存・再読込は別の接続検証として記録 |
| SDK・依存 | `node scripts/vendor-sdk.mjs --check`、必要に応じて`node scripts/vendor-isolation.mjs`と接続検証 |

変更に関係する失敗を解消し、残る具体的なリスクに応じて検証を追加する。同じ検査を理由なく繰り返さない。実行していない検査を成功と記載しない。

## 変更の説明

何ができるようになったか、どこを変えたか、何を確認したか、未接続・未検証の点を簡潔に説明する。PaoBub／Community／実AIとの接続やGitHubへの公開を、実際に完了していない段階で完了と書かない。

現在のライセンスはAGPL-3.0-only。`LICENSE`と`NOTICE`、同梱ソースの通知を維持する。Additional Permissionのdraftを発効済みの例外許諾として扱わない。
