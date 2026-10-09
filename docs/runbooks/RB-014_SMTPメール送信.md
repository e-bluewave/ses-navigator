# RB-014 SMTPメール送信・資格情報運用

## 対象と境界

Issue #167 / PR #168 のMVP1実メール送信は、e-bluewave.com のレンタルサーバーSMTPをAPI serverから利用する。Microsoft Graphは将来用としてRB-013に残す。`MESSAGE_DELIVERY_PROVIDER=smtp` を明示した場合だけSMTPを選択し、不足・不正な設定では送信不可とする。Productionでfake providerは利用できない。DB migrationは不要。

SMTPの `250` はサーバーによる受け付けを表し、宛先への最終到達を保証しない。bounce等の非同期通知は未実装。送信がタイムアウトした場合はサーバー側で受け付け済みの可能性があるので、履歴と受信側を確認するまで再送しない。

## 設定

| server側の変数 | 値の決め方 |
| --- | --- |
| `MESSAGE_DELIVERY_PROVIDER` | `smtp` |
| `SMTP_HOST` | レンタルサーバーが指定するSMTPホスト |
| `SMTP_PORT` | TLSモードに合うポート（1〜65535） |
| `SMTP_SECURE` | implicit TLSなら`true`、STARTTLSなら`false`。省略不可 |
| `SMTP_USERNAME` | SMTP認証ユーザー |
| `SMTP_PASSWORD` | SMTP認証パスワード。秘密値 |
| `SMTP_SENDER` | 認証アカウントで送信が許可されたアドレス |

レンタルサーバーの管理画面でホスト・ポート・認証方式・送信元制限を確認する。認証はAUTH LOGINを用いる。TLS証明書の検証は必須で、STARTTLSに失敗した接続で認証情報を送らない。資格情報をGitHub、Issue、PR、チャット、ログ、クライアント側環境変数へ記録しない。VercelのAPI server側へ環境ごとに登録し、Productionの値をStagingへコピーしない。

## Stagingでの有効化と検証

1. CIのformat / lint / typecheck / test / security / buildがPASSしたコミットを確認する。
2. 責任者の承認を受けてからStagingに上記設定を登録する。秘密値を画面共有やログへ表示しない。
3. Staging deploymentがReadyになり、API serverだけが設定を参照することを確認する。
4. 送信先と承認済みメッセージを責任者が指定し、**実メール送信の個別承認**を受ける。
5. ガード付き `pnpm smoke:proposal-delivery-real-mail` を使う。`SESN_EXPECTED_PROVIDER=smtp`、Staging指定、宛先1件、`SESN_EXPECTED_SUBJECT` と `SESN_EXPECTED_BODY` の完全一致、承認版IDの一致、既存attempt 0件、明示確認文字列を満たした場合だけ送信する。期待本文には改行も含めて正確に設定する。設定方法はスクリプト内の必須環境変数を参照する。Vercel Deployment Protectionが有効なURLには通常の`fetch`だけでは到達できないため、保護を通過する認証済み実行経路を別途確立するまでsmokeを実行しない。
6. 環境分離の標準経路は GitHub Actions の `Staging Read-Only Cloud Preflight` の第一段階である。PR #168 の Draft / 同一リポジトリ / 固定ブランチに `sesn-staging-readonly` ラベルを付け、GitHub Environment `sesn-staging-readonly` の reviewer が対象headを承認する。workflowはこの段階ではデータ・認証・SMTPに触れない。通常CIには実環境のSecretを渡さない。
   - Environment variables: `SESN_STAGING_SUPABASE_REF` と `SESN_PRODUCTION_SUPABASE_REF` は、Supabaseの各プロジェクト画面から独立に確認したProject IDを登録する。Vercelの値から転記しない。両者が同一または不正な形式なら停止する。
   - Environment variable: `SESN_STAGING_IDENTITY_DEPLOYMENT_URL` は、PRの対象headがStagingプロジェクトに自動生成した**不変のPreview deployment URL**。aliasは使わない。Environment secret: `VERCEL_TOKEN` はStagingの保護付きdeploymentを閲覧できる限定token。値をログ・PRに貼らない。
   - `SUPABASE_URL` は Staging Vercel project内で **ProductionとPreviewの両方**を対象にした同一Secret設定であり、値をGitHub runnerへ取り出さない。Preview runtimeの `VERCEL_PROJECT_ID`、`VERCEL_ENV`、`VERCEL_URL`、commit SHAを確認してから、runtime内でそのSecretのHTTPS hostからrefを抽出する。GitHub側で独立した2つのrefをSHA-256化してヘッダーに送り、runtimeはStaging一致・Production不一致だけを空の204/404で返す。GETだけで完結し、DB・Auth・SMTPへ通信しない。Vercelのsystem environment variablesが公開されていなければfail closedで停止する。
   - Preview identity PASS はそのPreview deploymentのruntimeと共有設定の照合証跡となる。既存のProduction-target Staging deploymentのスナップショット自体を直接検査した証跡ではない。実データpreflightへ進む前にこの差を確認し、必要ならStaging専用のProduction-target新deploymentでも別途照合する。
   - 従来の `staging-real-mail-cloud-preflight.mjs` は `vercel env run -e production` により非表示Secretをrunnerへ取り出せる前提で作られていたが、その前提は成立しない。workflowから呼び出さず、認証付きデータGETの安全な経路を改めて実装するまで実データ確認済みと扱わない。
7. Windows版 `scripts/staging-real-mail-readonly-preflight.ps1` は障害対応・Windows固有確認時のフォールバックである。固定Vercelリンクと一時ディレクトリを使い、Staging権限付きユーザーの入力を受ける。クラウド版と同じく実メールを送信しないが、独立したSupabase ref照合はクラウド版のみのガードなので、Windows版の結果だけで環境分離を証明しない。
8. Stagingの実メール送信smokeはVercel Deployment Protectionを通常のfetchで通過できない。保護を無効化せず、別途認証済みの中継経路を検証してから実施する。読み取り確認の成功だけで送信経路が確立したとは扱わない。
9. 配信履歴のattemptが`accepted`でresponse codeが`250`、受信側で実メールが届くことを確認する。重複送信と宛先不一致時の防止も確認する。
10. SMTPパスワードやSMTPサーバー応答本文が履歴・API応答・ログ・browser bundleへ露出しないことを確認する。

## 障害と停止

- `535`など認証失敗: 送信を止め、アカウント・認証方式・パスワードを管理画面で確認する。秘密値を証跡へ貼らない。
- `4xx`一時エラー: 履歴と送信状態を調べ、復旧後に人が再送を判断する。連打しない。
- `5xx`恒久エラー: 宛先・送信元制限・ポリシーを確認し、原因を直してから新たな操作を行う。
- TLS・接続・タイムアウト: 証明書、ホスト、ポート、到達性を確認する。受け付け状態が不明なときは受信側を確認してから再送する。
- 漏えい疑い: providerを無効化し、レンタルサーバーで資格情報をローテーションする。旧資格情報を失効させ、影響と履歴を調査する。

## Productionのゲート

Stagingで承認済みの実メールsmokeが成功し、責任者がProduction環境変更とSMTP Secret登録を承認した後に設定する。最初のProduction実送信とPR #168のMainマージにも別途承認が必要。送信元、宛先、送信量制限、ローテーション担当を運用記録に残すが、Secret値は残さない。
