# Staging Web → API 同一origin連携候補

更新: 2026-10-16 / PR #168。**設計とfixture検証のみ。runtime gateはUNKNOWN。**

## 採用候補と現在の停止点

別のStaging専用Web Vercelプロジェクトに、同一originの`/api/v1`を処理するNode.js Functionを置く。FunctionはユーザーのSupabase Bearerを維持し、リクエスト処理中に公式`@vercel/oidc`の`getVercelOidcToken()`を呼び、固定Staging API Previewへ別ヘッダーで短命のworkload identityを付ける。API側Vercelは署名・呼出元プロジェクト・Preview環境を検証し、その後FastifyがユーザーのJWT・tenant・権限を検査する。

この候補は、Vercelの[Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)と[OIDC reference](https://vercel.com/docs/oidc/reference)に基づく。同じteamの別プロジェクトからのアクセスには、対象API側の信頼設定が別途必要である。ブラウザーがVercelのOIDCを保持する構成や、保護付きAPIへの単純な外部rewriteは採用しない。

現在の`createStagingApiProxyModel`は`scripts/lib/staging-web-api-proxy-model.mjs`に置かれている。**`apps/web/api`のhandler、rewrite、middleware、browser entryから接続していない。** token取得とfetchの両方を呼出側が注入しなければ構築できず、fixture以外の実行は行っていない。SDK依存も未追加。管理画面の条件を確認する前に、このモデルを自動公開されるパスへ移さない。

## 検証した中継ポリシー

| 境界 | モデルの扱い |
| --- | --- |
| 対象 | 固定のStaging APIブランチaliasのみ。入力URL・queryから宛先hostを選ばない。Preview以外の設定を拒否 |
| ブラウザー | 同一origin URLのみ。Originが異なる要求と不一致Hostを拒否。非GETは一致するOriginとJSON object必須。cross-site Fetch Metadataも拒否 |
| 認証 | Supabase BearerをAPIへ渡す。Bearer自体の署名／権限検証はAPIの責務。Cookie、ブラウザーのbypass/OIDC、転送host等は渡さない |
| method/path | 営業導線の会社・担当者・技術者・案件・提案の限定allowlist。未知pathは404、未許可methodは405。`/internal`やAuth providerへの中継はない |
| 更新 | JSON body、`If-Match`、送信／再送の`Idempotency-Key`を保持。PUT・reviewの版指定欠落を拒否。中継でkeyを生成し直さず、自動再試行もしない。重複排除の永続的保証はAPI側の責務 |
| framing・文字列 | Transfer-Encoding・Content-Encoding・method override等を拒否。Content-Lengthの形式・上限・実byte数を検証し、転送しない。不正UTF-8を拒否 |
| lifecycle | tokenは要求ごとに取得し共有・cacheしない。入力stream・token取得・fetch・応答streamを共通deadlineとclient abortで中断。停止しないstream cancelを待ち続けない |
| CORS/cookies | same-origin設計のためCORS許可を返さない。上流へのcredentialsはomit。上流Set-Cookieを返さない。Vercel WebログインCookieとSupabase Bearerは別物 |
| redirect | fetchはmanual。上流3xx、Protection HTML、非JSON成功応答は502。LocationやProtectionページをbrowserへ転送しない |
| 応答・ログ | エラー本文／任意ヘッダーを転送しない。401/403/409等のHTTP statusは維持。レスポンスはno-store。body上限、timeout、既知のBearer/OIDC反射拒否。モデルはログを出さない |

モデルのallowlistは全Web APIの網羅版ではない。経歴書・面談・会計等へ広げる際は、既存API契約と権限テストに対応するmethod/pathを個別追加する。未知routeをcatch-allで通して解決しない。

fixtureテストのPASSは、実際のVercel署名検証、source project identity、API接続先、WebのProtection、APIのSupabase接続先を実証しない。固定aliasは更新され得るため、将来handlerを有効にする前に、照合済みAPI Deployment／commitへの固定方式も確定する。

## 実装した関連UIガード

- Auth contextの401でセッションを終了し、403・取得失敗ではMFA済みでも業務画面へ進めない。古いtokenに対する非同期結果を新しいセッションの権限判定へ流用しない。
- 送信・再送前にnative dialogで宛先・件名・本文を表示し、キャンセルを初期focusにする。再送は失敗宛先だけを表示する。確認中にdraft／historyが変われば送信しない。
- 初回送信は承認版・宛先・message/proposal IDが履歴と一致し、全宛先pendingかつattempt=0の場合だけ可能。履歴取得の403・404・500や版／宛先不一致では停止する。
- 送信処理中は同期的なin-flightガードで二重操作を拒否する。結果不明のエラー後は送信を凍結し、「配信履歴を再確認」のGETだけを可能にする。自動再送はない。UIガードはAPIのidempotency／status検査を代替しない。
- ログイン領域の見出し参照を修正し、Tab／Enterによるログインと営業画面ナビゲーションを検証する。モバイルでは入力とbuttonの高さ44px以上、overflowを抑える折返し、見えるkeyboard focusを設定した。

## PC不要の模擬ブラウザー検証

CIの`mobile-fixture`はGitHub-hosted UbuntuのChromeを使い、320px／390px幅のtouch viewportで確認dialog、focus／Escape／復帰、cancel時0回、明示確認時1回、失敗宛先だけの再送、履歴エラー、結果不明時のGET、401後ログインを検証する。`pnpm --filter @sesn/web test:browser`で同じfixtureを起動する（Chromeが必要）。

fixtureは`apps/web/tests/browser/fixture`の別Vite rootから起動し、本物のAppを注入型in-memory Auth/APIで動かす。通常Vite設定やAPI proxyは使わず、ブラウザーの外部要求と`/api`要求を遮断する。Secret・GitHub Environment・OIDC権限・Supabase・SMTPを使わない。trace／画像／videoも保存しない。client境界scannerはfixture markerが製品source／buildへ混入した場合も拒否する。

これはChromeでの模擬画面テストであり、実際のiPhone Safari、Stagingログイン、メール配送、公開Webの保護を実証しない。

| 判定対象 | 現在の証跡 |
| --- | --- |
| code-only | unit／型／lint／buildとCIのfixture検証。最終headのCI結果を参照 |
| Staging Web deployment | UNKNOWN（未公開・handler未接続） |
| runtime identity／Supabase分離 | UNKNOWN（実照合未実行） |
| 実メール | NOT RUN |

handlerを置くために不足している証跡は、独立したWeb project ID、Vercelによる署名・source project・Preview検証、未レビューPreviewを除くdeployment制限、照合済みAPI Deployment／commitへの固定、独立したStaging／Production refに対するAPI runtimeの照合である。enable flagだけではこれらを証明できないため、既定無効handlerも含めて今回は公開entryを追加しない。

## iPhoneからまとめて確認する管理画面ゲート

今は設定変更を実施しない。以下は担当者が実施する時の確認順である。

1. GitHubで対象headとCIを確認。`sesn-staging-readonly`のRequired reviewerを維持し、PR refのallowlistを確認する。今回の作業ではlabel追加やworkflow承認を行わない。
2. 新しいStaging専用Webプロジェクトのteam／project ID／`apps/web` Root Directory／Vite設定を確認。Import時に意図しないProduction-target deploymentが始まらないPreview限定の手順が確認できるまでDeployを押さない。workspace外部ソースとlockfileを利用できること、Preview Protectionが有効であることを確認する。
3. Web側の公開Supabase設定が独立したStaging refに対応し、Production refと異なることを確認。SMTP・service-role・bypassの値をWebに複製しない。OIDCはrequest内のSDKだけから取得し、VITE変数・ソース・build引数へ渡さない。Vercel自身がbuildに付与するOIDC変数も読み出し／ログ出力／artifact保存しない。
4. API側に新しいWebプロジェクトの**Preview → Previewだけ**を許可できるか確認。登録は別承認事項。信頼設定がそのWebプロジェクトの全Previewに及ぶ点を確認し、未レビューのbranch／fork／commitを実行できる状態で登録しない。確実なdeployment制限を管理画面で実証できなければ停止し、未確認の仕様で補わない。GitHub ActionsのCustom provider設定とは別の信頼関係である。
5. APIのruntime identity、Webの実project ID／Preview／commit、API Deploymentの固定方法を独立証跡で確定した後、別作業でserver-only handlerを実装・レビューする。ここまでPASSした場合だけ、承認済みの非送信・読み取り接続確認へ進む。

実データGET、DB書き込み、メール送信、Production設定・deploy、Mainマージ、Draft解除の許可はこの文書には含まれない。
