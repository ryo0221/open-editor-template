# このテンプレートで作業するAIへ

## 最初に読む

1. `README.md`で、起動方法と実装範囲を確認する。
2. `src/Editor.ts`、`src/model.ts`、`src/commands.ts`で、画面・データ・編集経路を確認する。
3. 操作や登録を変える場合は`src/operations.ts`、`src/extension.ts`を読む。Hostや配布を変える場合は`dev/`、`scripts/`、`docs/compatibility.md`も読む。

ユーザーが望む題材や操作に合わせ、小さな動く変更を進める。将来の拡張だけを理由に、汎用フレームワークや新しいSDK契約を増やさない。

## 実装の境界

- 画面はplain TypeScript DOM。表示する文字列は`textContent`などで扱う。
- `CardDocument`が編集対象の本体。`schemaVersion`は拡張manifestの宣言であり、本体へ同じ管理項目を重複させない。
- 編集は`@editor-platform/editor-core`の実際の`EditorCommand`を使う。入力を変更せず、新しい結果を返し、対象の存在・値・制約をapply時に検証する。
- 人の画面操作と外部の操作提案は同じcommandsを使う。操作提案から、別の直接書き換え・履歴・保存経路を作らない。
- 外部操作は`OperationDeclaration`と`OperationsAdapter`の実契約に従う。入力schemaを閉じ、文字列・配列には上限を付ける。schemaで表せない条件は`checkInput`、依存した元の値はcommandのapplyでも確認する。
- 現行root契約は`1.0.0-draft.1`、add-onは`operations@0-draft`。存在を確認していないAPIや、draft.2／controlledの機能を推測して利用しない。
- Editorが受け取るのは`ScopedHost`。権限判定、履歴、保存、packageの信頼確認、AI呼び出しはHostの責務に置く。
- このroot契約に`subscribe`はない。開発Hostの表示更新方法を確認し、独自の契約メソッドを追加しない。操作提案用handleを、画面の再表示に伴って閉じない。
- 入力は現在のサンプルではmodalの適用／取消で確定する。未確定のinline入力や非同期入力を追加する場合は、その状態とHost操作との関係を先に具体化する。

## 保存・配布

- 保存・再読込は実EPの`ArtifactEditor`とstorage境界を使う。
- Native JSONはEPのArtifact全体。読み込み時は検証してから、現在のArtifactへその本体を1回のundoableな編集として取り込む。受け取ったIDや保持版で現在の履歴を丸ごと上書きしない。
- カードIDは作成時に決め、名前の変更、並べ替え、保存で作り直さない。
- 配布用コードは`dist/extension/`、開発Hostは`dist/host/`。転送用JSONを、公式SDK契約やnpm公開形式として説明しない。
- packageが自己申告したpinを、利用側Hostの信頼情報として無条件に採用しない。

## 同梱SDK

`vendor/ep/`は公開commit `0ee0c711027b73e0112a544783793a3563808dd7`から固定した5つのpackageのソース。通常のEditor変更で直接修正しない。importは各packageが公開するentrypointを使い、`src/`へのdeep importや私有リポジトリへの依存を追加しない。

SDK更新が必要なら、公開upstreamの対象版・契約・必要ファイルを確認し、pinとprovenanceを伴う更新として扱う。`node scripts/vendor-sdk.mjs --check`を通すためにhashだけを合わせる変更はしない。`--restore`は同じ固定版の復元であり、upstream追従機能ではない。

## 検証の選び方

| 変更箇所 | 主な確認 |
| --- | --- |
| モデル・commands | `npm run check`、`npx vitest run tests/model.test.ts` |
| operations | 上記と`npx vitest run tests/operations.test.ts`。入力拒否、元の値、無関係な値の保持を確認 |
| Host・保存・権限 | `npx vitest run tests/host.test.ts`、必要なブラウザ操作 |
| 画面 | `npm run check`、`npm run test:e2e`。実際の表示と操作を確認 |
| ビルド・package | `npm run build`、`npm run verify:package`、`tests/package.test.ts` |
| SDK・依存 | `node scripts/vendor-sdk.mjs --check`、必要に応じて`node scripts/vendor-isolation.mjs`と接続検証 |

変更に関係する失敗を解消し、残る具体的なリスクに応じて検証を追加する。同じ検査を理由なく繰り返さない。実行していない検査を成功と記載しない。

## 変更の説明

何ができるようになったか、どこを変えたか、何を確認したか、未接続・未検証の点を簡潔に説明する。PaoBub／Community／実AIとの接続やGitHubへの公開を、実際に完了していない段階で完了と書かない。

現在のライセンスはAGPL-3.0-only。`LICENSE`と`NOTICE`、同梱ソースの通知を維持する。Additional Permissionのdraftを発効済みの例外許諾として扱わない。
