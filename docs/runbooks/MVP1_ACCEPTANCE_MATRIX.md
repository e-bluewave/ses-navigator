# MVP1 営業フロー受入表（PR #168）

更新: 2026-10-18。対象は Draft PR #168 のコードおよび模擬テスト。**自動テストのPASSは実環境の受入PASSを意味しない。** この表の「実環境証跡」は照合できるまで UNKNOWN とする。Web/API連携候補と残る管理画面ゲートは [STAGING_WEB_API_INTEGRATION.md](STAGING_WEB_API_INTEGRATION.md) を参照。

| 工程・完成条件 | React経路・操作 | API（`/api/v1`以下） | 模擬テスト／コード証跡 | 実環境証跡・残るゲート |
| --- | --- | --- | --- | --- |
| 認証・MFA・期限切れ | `/` のログイン、MFA、`/auth/callback` | Supabase Auth `/auth/v1/token`、`/auth/v1/factors`、`GET /auth/context` | `auth-client.test.ts` の認証・更新失敗、`App.test.tsx` のログイン・401ログアウト・MFA済み403拒否・キーボード操作、`client.test.ts` の不正error envelope | UNKNOWN: 保護されたStaging Webと権限付きテストユーザー |
| 会社・担当者を登録／参照 | `/companies`、`/companies/:id`、`/contacts` | `/companies`、`/contacts` | `App.test.tsx` の会社作成・編集、担当者監査・削除、`client.test.ts` | UNKNOWN: Staging権限・データを用いた画面受入 |
| 技術者・経歴書版を参照 | `/engineers`、`/engineers/:id` | `/engineers`、`/engineers/:id/resumes` | `App.test.tsx` の技術者作成・詳細・非公開情報、APIの型・テスト | UNKNOWN: 経歴書版の実データ受入 |
| 案件登録・検索 | `/projects`、`/projects/:id` | `/projects` | `App.test.tsx` の一覧・検索・編集・監査、`client.test.ts` | UNKNOWN: Staging Web実利用 |
| AIマッチングと根拠確認 | `/projects/:id` のマッチ | `POST /projects/:id/ai/match-engineers`、`GET /projects/:id/ai/matches/latest` | `App.test.tsx` のスコアと根拠、`client.test.ts` | UNKNOWN: 利用量・モデル・費用・営業判断の受入 |
| 提案・本文の版管理と承認 | `/proposals`、`/proposals/:id` | `/proposals`、`/proposals/:id/ai/message-drafts/latest`、`POST /proposals/:id/ai/message-drafts/:messageId/review` | `App.test.tsx` の生成・編集・承認、未保存件名／本文の承認停止、提案メール操作の401でログアウト。`mobile.spec.ts` のkeyboard承認・失効後GET復帰 | UNKNOWN: 権限分離、送信先・件名・本文・承認版の実データ照合 |
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

## 並列開発 Wave 1 の追加証跡

基準head `49088aea192d9a5af3440d41876943382873734f`から、独立worktreeの子A／子Bと親で分担した。子はcommit／pushせず、親が完了結果と全差分をレビューして統合する。実行結果は最終headのCIで確認する。

| 担当 | 具体的な改善・検証経路 | 実環境への意味 |
| --- | --- | --- |
| 子A: UI | `mobile.spec.ts`で320／390pxのログイン→会社一覧→技術者詳細→案件／AI根拠・再計算→提案一覧・承認をin-memory fixtureで確認。表のCSS不整合と提案一覧のスクロール・focusを修正。auth 403、下書きGETの403／500で生成停止→GET再確認の回帰を追加 | 模擬の承認・再計算のみ。実登録・実DB書き込み受入ではない |
| 子B: 安全境界 | `staging-web-build-guard.test.mjs`でPreview／repository／branch／project ID／独立ref／公開変数を検査。static routes・headers、source map／encoded privileged keyの非露出、send／retry POSTの再試行なしを追加検証 | build設定の整合のみ。公開key所有権・OIDC署名・review済head・runtime identityを実証しない |
| 親: 統合 | 子の差分確認、CIへのguard test追加、全体テスト・ビルド・境界検査。iPhone管理者向け手順に承認者・停止条件・必要証跡を追加 | Web公開・実接続・実メールのゲートを解除しない |

子A／子Bの個別PASSだけで統合PASSと判断しない。モバイルfixtureはChromeの模擬viewportであり、iPhone Safari実機の受入はUNKNOWNのままである。

## 完了済みコードと残作業の担当境界

基準head `1f36f47d610c9cf10bff372b3598d8d5f9e5ebf2`のCI #697／Windows模擬検証 #81を再確認した。既存のコードのみ欄に並んでいた中継モデル・確認dialog・履歴ガード・モバイルfixtureは、これから作るTODOではなく実装済みの模擬検証対象である。未確認の実環境ゲートを埋めるために、同じ機能やテストを反復追加しない。

| 状態・区分 | 証跡または残作業 | 次へ進む条件・担当 |
| --- | --- | --- |
| 完了: code-only基盤 | 中継モデルのHost／framing／deadline／token分離、確認dialog・履歴照合・結果不明時のGET、Staging Web buildガード、Secret境界、320／390pxの模擬営業導線。Wave1 CIでAPI270・Web127・モバイル16ケースがPASS | 新たに再現した不具合だけをCodexが修正・回帰。実環境完了とは数えない |
| Wave2: 限定した回帰修正 | 提案メール7操作の401でログアウト、未保存件名／本文の承認停止、fixture例外を製品出力へ適用しないpath正規化・root限定。親が子2体の完了と差分を確認し統合 | `App.test.tsx`／`mobile.spec.ts`／`check-client-secret-boundary.test.mjs`と最終headのCIで確認。公開handler・環境設定は変更しない |
| 条件付き: handlerコード | server-only handlerと照合済みAPI Deploymentへの固定は未実装。必要APIのallowlistは契約ごとに追加するが、根拠なしで広げない | Web project identity・Preview限定trust・レビュー済Deploymentの制限を独立証跡で確認後、Codexが別途実装・レビュー |
| 未確認: 管理画面の読み取り | GitHub Environmentのreviewer／PR ref、独立Supabase ref、VercelのWeb project／Protection／信頼条件の設定可否 | 管理者が最小チェックリストの結果を提示。保存や登録で不足条件を補わない |
| 未実施: 設定・非送信identity | 必要なStaging専用設定・固定DeploymentとAPI runtimeのStaging ref一致／Production ref不一致 | 責任者が対象と操作を個別承認し、管理者とRequired reviewerが実施。現作業では起動しない |
| 未実施: Web実接続・受入 | 保護付きWebログイン／GET、iPhone Safari、営業操作の権限・状態・履歴 | 環境分離と安全なhandlerの証跡後に承認。DB書き込みを伴う受入は読み取り承認に含めない |
| 未実施: 実メール・リリース | 送信前の宛先・本文・承認版・attempt照合と1通の受信／履歴確認。その後の本番・マージ判断 | 責任者がメール、本番変更、Mainマージ、Draft解除を別々に承認 |

管理画面の確認項目はiPhone向けに [Web/API連携手順](STAGING_WEB_API_INTEGRATION.md#iphoneからまとめて確認する管理画面ゲート) に集約した。GitHub ActionsのCustom providerとWeb→APIのproject間信頼は別の設定であり、本作業では登録していない。現在の管理画面設定は独立に未照合。新規WebのImportが意図しないProduction-target deployを起動しないことと、未レビューPreviewが信頼対象へ入らないことを確認できるまで進めない。runtime identityがPASSするまでは実データへのアクセスを開始しない。
