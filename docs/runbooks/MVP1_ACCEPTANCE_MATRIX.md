# MVP1 営業フロー受入表（PR #168）

更新: 2026-10-16。対象は Draft PR #168 のコードおよび模擬テスト。**自動テストのPASSは実環境の受入PASSを意味しない。** この表の「実環境証跡」は照合できるまで UNKNOWN とする。Web/API連携候補と残る管理画面ゲートは [STAGING_WEB_API_INTEGRATION.md](STAGING_WEB_API_INTEGRATION.md) を参照。

| 工程・完成条件 | React経路・操作 | API（`/api/v1`以下） | 模擬テスト／コード証跡 | 実環境証跡・残るゲート |
| --- | --- | --- | --- | --- |
| 認証・MFA・期限切れ | `/` のログイン、MFA、`/auth/callback` | Supabase Auth `/auth/v1/token`、`/auth/v1/factors`、`GET /auth/context` | `auth-client.test.ts` の認証・更新失敗、`App.test.tsx` のログイン・401ログアウト・MFA済み403拒否・キーボード操作、`client.test.ts` の不正error envelope | UNKNOWN: 保護されたStaging Webと権限付きテストユーザー |
| 会社・担当者を登録／参照 | `/companies`、`/companies/:id`、`/contacts` | `/companies`、`/contacts` | `App.test.tsx` の会社作成・編集、担当者監査・削除、`client.test.ts` | UNKNOWN: Staging権限・データを用いた画面受入 |
| 技術者・経歴書版を参照 | `/engineers`、`/engineers/:id` | `/engineers`、`/engineers/:id/resumes` | `App.test.tsx` の技術者作成・詳細・非公開情報、APIの型・テスト | UNKNOWN: 経歴書版の実データ受入 |
| 案件登録・検索 | `/projects`、`/projects/:id` | `/projects` | `App.test.tsx` の一覧・検索・編集・監査、`client.test.ts` | UNKNOWN: Staging Web実利用 |
| AIマッチングと根拠確認 | `/projects/:id` のマッチ | `POST /projects/:id/ai/match-engineers`、`GET /projects/:id/ai/matches/latest` | `App.test.tsx` のスコアと根拠、`client.test.ts` | UNKNOWN: 利用量・モデル・費用・営業判断の受入 |
| 提案・本文の版管理と承認 | `/proposals`、`/proposals/:id` | `/proposals`、`/proposals/:id/ai/message-drafts/latest`、`POST /proposals/:id/ai/message-drafts/:messageId/review` | `App.test.tsx` の生成・編集・承認（送信なし） | UNKNOWN: 権限分離、送信先・件名・本文・承認版の実データ照合 |
| 明示操作で送信・失敗時だけ再送 | `/proposals/:id` の送信／再送確認dialog | `POST /proposals/:id/messages/:messageId/send`、`POST /proposals/:id/messages/:messageId/retry` | `App.test.tsx` のcancel・履歴エラー拒否・承認版／宛先／attempt照合・二重操作防止、`tests/browser/mobile.spec.ts` の模擬1回確認・失敗宛先のみ再送、API・SMTP unit test | UNKNOWN: Staging実メール。個別承認まで実行禁止 |
| 試行・provider結果の表示 | `/proposals/:id` の配信状況 | `GET /proposals/:id/messages/:messageId/delivery` | `App.test.tsx` のattempt／response code表示、client・API unit test | UNKNOWN: 実メール受信・履歴・attempt数・Secret非露出 |
| Web公開と深いURL | 独立したStaging Web Preview | 静的Vite出力、`/api/v1` は同一originを前提 | `apps/web/vercel.json`、`staging-web-routes.test.mjs`（非GET除外も検査）、`staging-web-api-proxy-model.test.mjs`、`pnpm build` | UNKNOWN: Webプロジェクト・Protection・安全なAPI経路が未設定。中継はfixtureモデルのみでhandler未接続 |

## その他の実装済み画面・APIの棚卸し

以下も画面と対応するAPI client／模擬テストがある。MVP1の営業導線の外側にある機能を含むため、実運用で必要な範囲と受入優先度を別途確定する。各行の実環境証跡はすべて UNKNOWN である。

| 機能 | React経路 | API領域 | 模擬テスト |
| --- | --- | --- | --- |
| ホーム・営業KPI | `/dashboard`、`/sales-kpi` | `/sales-kpi` 等 | `App.test.tsx` のホーム・KPI、`client.test.ts` |
| 自分のタスク・重複候補・営業活動 | `/my-tasks`、`/duplicate-candidates`、会社／案件詳細 | `/my-tasks`、重複候補・営業活動API | `App.test.tsx`、`CompanySalesActivitiesPanel.test.tsx`、個別client tests |
| AI抽出・利用状況 | 案件／技術者詳細、`/ai-operations` | 案件・経歴書抽出API、`/ai-operations` | `App.test.tsx` の抽出レビュー・AI状況、`client.test.ts` |
| 面談・結果・AI要約 | `/interviews`、`/interviews/:id`、`/interviews/:id/result` | `/interviews`、面談要約API | `App.test.tsx` の面談作成・結果・要約 |
| 契約・参画 | `/contracts`、`/engagements` と各詳細 | `/contracts`、`/engagements` | `App.test.tsx` の作成・状態遷移 |
| 実績・請求・支払 | `/work-logs`、`/invoices`、`/supplier-payments` と各詳細 | 対応する `/work-logs`、`/invoices`、支払API | `App.test.tsx` の入力・承認・入金・支払 |
| 会計・経費・収益 | `/accounting-periods`、`/accounting-exports`、`/expenses`、`/profitability` | 対応する会計・経費・収益API | `App.test.tsx` の締め・出力・経費・収益 |

## Staging Webの分離設計

- 現在確認した `ses-navigator-staging` はFastify APIプロジェクトであり、Reactの公開URLではない。Webは新しい **Staging専用** Vercelプロジェクトとして同じGit repositoryの `apps/web` をRoot Directoryに設定する。Vite／`dist` を使い、Root Directory外のworkspace `scripts` とlockfileをビルド時に利用できる設定を確認する。`apps/web/vercel.json` はSPAの深いURLだけを `index.html` に戻し、`/api`・`/internal`・`/assets` をAPIの代わりにHTMLへ返さない。Productionプロジェクトの設定を転用しない。
- Webの `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` はブラウザー向け公開値である。Staging Supabaseに属することを独立したproject refと照合するまでビルド・公開を進めない。SMTP_PASSWORD、service-role key、OIDC token、bypass tokenを `VITE_` に設定しない。プロジェクトrefは公開URLに含まれ得るため、秘密値とはみなさないが通常ログ・報告には載せない。
- Web API clientの既定は相対 `/api/v1` である。**新規WebプロジェクトにはAPI proxyをまだ設定していない。** server側OIDC中継の候補を、token取得とfetchの注入必須・固定Staging宛先・method/path allowlist・Cookie破棄・Origin検査・redirect拒否・bounded JSON・no-storeでfixture検証した。モデルは`scripts/lib`にあり自動公開handlerから未接続である。別Webのproject ID、許可されたPreviewのdeployment制限、API runtime identity、照合済みDeploymentの固定方法が未確認のため実接続はUNKNOWN。保護されたAPIへの単純なrewrite／ブラウザー直結や無制限のTrusted Sourceでは代用しない。

## 証跡の読み方

`PROJECT_STATUS.md` の「80%」は2026-09-25時点の記述で、現在の完成率ではない。BA-001の環境分離記録は過去の証跡であり、PR #168の現行Preview runtimeの`SUPABASE_URL`を実証しない。現行のruntime identity検証がPASSするまで実データpreflightを実行しない。

## 残作業の担当境界

| 区分 | 残作業 |
| --- | --- |
| コードのみ | 中継モデルのHost／framing／deadline／token分離、確認dialog、履歴不一致拒否、結果不明時のGET再確認、320px／390pxのChrome模擬画面テストを実装。管理画面ゲート解消後にserver-only handlerを別途レビューし、必要APIのallowlistを個別追加する。実iPhone Safariでの受入は未確認 |
| クラウド管理画面 | GitHub EnvironmentのPR ref許可とRequired reviewerを確認。Vercel Custom Trusted Sourceの全claim／Preview限定可否を確認。独立したStaging Webプロジェクトと保護・公開値を設定し、API経路とStaging Supabaseの接続先を照合 |
| 明示承認 | reviewer付きのread-only identity実行と、その後の認証付き実データpreflight。宛先・本文・attempt=0を確認した後の1通限定の実メール送信。Production変更、Mainマージ、Draft解除はそれぞれ別ゲート |

管理画面の確認項目はiPhone向けに [Web/API連携手順](STAGING_WEB_API_INTEGRATION.md#iphoneからまとめて確認する管理画面ゲート) に集約した。GitHub ActionsのCustom providerとWeb→APIのproject間信頼は別の設定である。いずれも登録は未実施。新規WebのImportが意図しないProduction-target deployを起動しないことと、未レビューPreviewが信頼対象へ入らないことを確認できるまで進めない。runtime identityがPASSするまでは実データへのアクセスを開始しない。
