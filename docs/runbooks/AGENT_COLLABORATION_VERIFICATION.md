# サブエージェント実行検証

実施日: 2026-10-18（JST）。対象: `e-bluewave/ses-navigator`、Draft PR #168。

## 実測した結果

- このWork/Codexセッションで`collaboration.spawn_agent`を呼び、子`/root/readonly_ci_probe`を1つ起動できた。
- 子から完了通知と調査結果を受け取り、親が元ファイルと照合した。起動APIの存在だけで利用可能と判定していない。
- 基準head: `81a022e31885718d5156d0096f6073f767c62ea4`。子の最初の調査は`package.json`と`.github/workflows/ci.yml`の読み取りに限定し、編集・テスト起動・実環境アクセス・追加委任は依頼していない。
- 子はNode要件`>=22.0.0`、`pnpm@10.15.0`、CIのNode 24、job名`quality`／`mobile-fixture`を報告した。workflowの`contents: read`、mobile checkoutの`persist-credentials: false`、当該jobにEnvironment／Secrets参照／OIDC権限・実環境preflight呼出しがないことを確認した。
- 子はfixture実装を未読として、外部通信遮断そのものは未確認と明示した。親は別途`apps/web/package.json`、`apps/web/playwright.config.ts`、`apps/web/tests/browser/mobile.spec.ts`の隔離設定と、前回のCI証跡を確認した。

これは当該セッションで子1つとの依頼・返答が成立した証跡である。一般のChatGPTチャット、別チャット呼出し、将来の全Codexセッション、複数子の同時編集、実環境への接続能力を保証しない。子の「読み取り専用」は依頼上の制約であり権限sandboxの実証ではない。

## 今回の変更範囲と検証方法

リポジトリ内および取得したMainに既存AGENTS.mdは見つからなかったため、ルートに新規追加した。README・テスト設計書・既存runbookは変更せず参照し、現在のcode-only制約を優先する旨を明記した。アプリケーション、workflow、依存関係、環境設定の変更はない。

同じ子を再利用して新規2文書と関連する既存設計・runbookの読み取りレビューを受けた。重大・中程度の指摘はなく、親のpush担当に関する軽微な表現差を修正した。親は文書の相対リンク5件、担当・安全境界の整合、`git diff --check`を検証した。通常CIはPRへのpushで実行し、結果は最終headのrunを確認する。この文書の事前記述自体をCI成功の証跡にしない。

通常開発は親1＋子1〜2を目安に、調査／レビューまたは重複しないファイルへ分ける。原則として親が統合・push・CI確認・最終報告を行う。ツールが利用不可なら親の逐次作業とGitHub Actionsによる模擬テストへ切り替える。

Staging Web公開、runtime identityとSupabase環境分離の実照合、実メールは今回の検証対象外であり、未完了のゲートを解除していない。PC操作や追加の環境権限は不要だった。

## MVP1 parallel development wave 1（2026-10-18）

基準head `49088aea192d9a5af3440d41876943382873734f`で、指定PRコメント「Codex next task: MVP1 parallel development wave 1」を全文確認した。

- 新しい子2体（`wave1_ui`／`wave1_security`）の起動・完了を実測。各子に独立したworktreeを割り当て、UI／fixtureとscripts／build設定の編集所有を分けた。
- 親はworkflow・受入表・承認ゲート文書を所有。子はcommit／pushせず、全子の完了後に親が差分をレビューし統合した。
- 子Aはテーブル用CSSの不整合、下書き読み取り失敗後の生成ガードを修正し、営業導線・403を模擬モバイルfixtureへ追加。
- 子Bはbuild環境ガード・static設定・Secret境界・POST再試行なしの異常系テストを追加。親が見つけたplatform識別子欠落時のguard skipを追加依頼し、staging modeの強制ガードと実Vite entryの停止テストで修正した。
- 統合後のテストと最終headのCIは親が確認する。子の個別PASS、並列実行の成立、実環境受入は別の証跡として扱う。

このwaveでも実環境アクセス・DB書き込み・実メール・Vercel設定変更は行わず、未知のWeb project ID／runtime identityはUNKNOWNのまま維持する。
