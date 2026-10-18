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
