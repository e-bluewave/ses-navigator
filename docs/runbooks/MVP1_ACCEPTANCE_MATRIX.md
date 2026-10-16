# MVP1 営業フロー受入表（PR #168）

更新: 2026-10-16。対象は Draft PR #168 のコードおよび模擬テスト。**自動テストのPASSは実環境の受入PASSを意味しない。** この表の「実環境証跡」は照合できるまで UNKNOWN とする。

| 工程・完成条件 | React経路・操作 | API（`/api/v1`以下） | 模擬テスト／コード証跡 | 実環境証跡・残るゲート |
| --- | --- | --- | --- | --- |
| 認証・MFA・期限切れ | `/` のログイン、MFA、`/auth/callback` | Supabase Auth `/auth/v1/token`、`/auth/v1/factors`、`GET /auth/context` | `auth-client.test.ts` の認証・更新失敗、`App.test.tsx` のログイン・ログアウト・MFA | UNKNOWN: 保護されたStaging Webと権限付きテストユーザー |
| 会社・担当者を登録／参照 | `/companies`、`/companies/:id`、`/contacts` | `/companies`、`/contacts` | `App.test.tsx` の会社作成・編集、担当者監査・削除、`client.test.ts` | UNKNOWN: Staging権限・データを用いた画面受入 |
| 技術者・経歴書版を参照 | `/engineers`、`/engineers/:id` | `/engineers`、`/engineers/:id/resumes` | `App.test.tsx` の技術者作成・詳細・非公開情報、APIの型・テスト | UNKNOWN: 経歴書版の実データ受入 |
| 案件登録・検索 | `/projects`、`/projects/:id` | `/projects` | `App.test.tsx` の一覧・検索・編集・監査、`client.test.ts` | UNKNOWN: Staging Web実利用 |
| AIマッチングと根拠確認 | `/projects/:id` のマッチ | `POST /projects/:id/ai/match-engineers`、`GET /projects/:id/ai/matches/latest` | `App.test.tsx` のスコアと根拠、`client.test.ts` | UNKNOWN: 利用量・モデル・費用・営業判断の受入 |
| 提案・本文の版管理と承認 | `/proposals`、`/proposals/:id` | `/proposals`、`/proposals/:id/ai/message-drafts/latest`、`POST /proposals/:id/ai/message-drafts/:messageId/review` | `App.test.tsx` の生成・編集・承認（送信なし） | UNKNOWN: 権限分離、送信先・件名・本文・承認版の実データ照合 |
| 明示操作で送信・失敗時だけ再送 | `/proposals/:id` の送信／再送ボタン | `POST /proposals/:id/messages/:messageId/send`、`POST /proposals/:id/messages/:messageId/retry` | `App.test.tsx` の無宛先防止、模擬失敗→再送、`proposal-message-delivery-client.test.ts` の別idempotency key、API・SMTP unit test | UNKNOWN: Staging実メール。個別承認まで実行禁止 |
| 試行・provider結果の表示 | `/proposals/:id` の配信状況 | `GET /proposals/:id/messages/:messageId/delivery` | `App.test.tsx` のattempt／response code表示、client・API unit test | UNKNOWN: 実メール受信・履歴・attempt数・Secret非露出 |
| Web公開と深いURL | 独立したStaging Web Preview | 静的Vite出力、`/api/v1` は同一originを前提 | `apps/web/vercel.json`、`staging-web-routes.test.mjs`、`pnpm build` | UNKNOWN: Webプロジェクト・Protection・安全なAPI経路が未設定 |

## Staging Webの分離設計

- 現在確認した `ses-navigator-staging` はFastify APIプロジェクトであり、Reactの公開URLではない。Webは新しい **Staging専用** Vercelプロジェクトとして同じGit repositoryの `apps/web` をRoot Directoryに設定する。Vite／`dist` を使い、Root Directory外のworkspace `scripts` とlockfileをビルド時に利用できる設定を確認する。`apps/web/vercel.json` はSPAの深いURLだけを `index.html` に戻し、`/api`・`/internal`・`/assets` をAPIの代わりにHTMLへ返さない。Productionプロジェクトの設定を転用しない。
- Webの `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` はブラウザー向け公開値である。Staging Supabaseに属することを独立したproject refと照合するまでビルド・公開を進めない。SMTP_PASSWORD、service-role key、OIDC token、bypass tokenを `VITE_` に設定しない。プロジェクトrefは公開URLに含まれ得るため、秘密値とはみなさないが通常ログ・報告には載せない。
- Web API clientの既定は相対 `/api/v1` である。**新規WebプロジェクトにはAPI proxyをまだ設定していない。** 保護された別Vercel APIへの単純なrewrite／ブラウザー直結が安全に動くことは未実証。現在のWeb静的ビルドが通ってもログイン後の営業フローは未完成である。同一originの認証付きAPI経路とDeployment Protection、CORS、環境分離を設計・検証してからUIの実環境受入を始める。保護解除や無制限のTrusted Sourceでは代用しない。

## 証跡の読み方

`PROJECT_STATUS.md` の「80%」は2026-09-25時点の記述で、現在の完成率ではない。BA-001の環境分離記録は過去の証跡であり、PR #168の現行Preview runtimeの`SUPABASE_URL`を実証しない。現行のruntime identity検証がPASSするまで実データpreflightを実行しない。

## 残作業の担当境界

| 区分 | 残作業 |
| --- | --- |
| コードのみ | 安全な同一origin API経路を設計・模擬検証。権限エラー・セッション失効・再送競合、狭い画面幅とキーボード操作の統合テストを追加。画面での明示送信確認の仕様を固める |
| クラウド管理画面 | GitHub EnvironmentのPR ref許可とRequired reviewerを確認。Vercel Custom Trusted Sourceの全claim／Preview限定可否を確認。独立したStaging Webプロジェクトと保護・公開値を設定し、API経路とStaging Supabaseの接続先を照合 |
| 明示承認 | reviewer付きのread-only identity実行と、その後の認証付き実データpreflight。宛先・本文・attempt=0を確認した後の1通限定の実メール送信。Production変更、Mainマージ、Draft解除はそれぞれ別ゲート |

管理画面の作業はiPhoneのブラウザーから一括して進められる。順番は①GitHub Environmentの保護・PR ref確認、②VercelでStaging専用WebのRoot Directory・Preview Protection・公開値設定、③全claimを個別指定できることを確認できた場合だけStaging API側のPreview限定Trusted Source設定、④承認済みのread-only identity検証。③を実施できない場合は保存せず停止する。④がPASSするまでは実データへのアクセスを開始しない。
