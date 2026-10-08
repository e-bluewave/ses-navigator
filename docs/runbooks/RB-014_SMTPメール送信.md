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
6. 送信前の標準経路は、GitHub Actions の `Staging Read-Only Cloud Preflight` である。PR #168 の Draft / 同一リポジトリ / 固定ブランチにだけ `sesn-staging-readonly` ラベルを付けた際に起動し、保護された GitHub Environment `sesn-staging-readonly` の required reviewer が対象headを確認して承認する。通常のPR CIには実環境のSecretを渡さない。新規workflowの手動 `workflow_dispatch` はMainにworkflowがない間は使えないため、ラベルイベントに限定する。再実行時は新しいheadを確認してラベルを外し再度付け、Environment approvalをやり直す。
   - Environment secrets: `VERCEL_TOKEN`（Staging Vercelプロジェクトの環境設定・保護付きdeployment読取権限だけを持つ短命または限定スコープのtoken）、`SESN_STAGING_TEST_EMAIL`、`SESN_STAGING_TEST_PASSWORD`。Staging test userはproposal一覧、最新draft、delivery履歴を読み取れる既存の権限付きアカウントを用いる。新規作成が必要なら通常の認証・権限管理手順で別途準備し、本preflightでは作成しない。パスワード、token値はIssue、PR、runnerログへ記録しない。
   - Environment variable `SESN_STAGING_SUPABASE_REF` は、**Staging Supabase側を独立に確認して**登録するproject ref。Vercelの `SUPABASE_URL` から転記してはならない。誤ったrefならfail closedとなる。登録前に担当者がStagingのproject identityを確認する。この独立した基準値とVercel側のURLが一致することは環境分離の証跡になるが、基準値の確認を省略した場合の取り違えまでは防げない。
   - Workflowは固定の `ses-navigator-staging` project ID / team ID に一時リンクを作り、`vercel env run -e production` で**Stagingプロジェクト内のProduction対象**設定だけを子プロセスへ渡す。固定deploymentに `vercel curl` でGETし、Vercel Deployment Protectionを通る。取得したURLのホストを独立したrefと照合し、HTTPS・SMTP host/port/STARTTLS/provider/送信元を認証前に照合する。不一致なら停止する。不要なSMTPパスワード等は子プロセスから削除し、レスポンスや例外本文をログへ出さない。
   - Supabase AuthのパスワードgrantだけはログインのためPOSTを使用する。その後のAPIは `/health`、proposal一覧、最新draft、delivery履歴のGETだけ。最大2000件を走査し、To 1件、件名・本文の完全一致、承認版、attempt 0、一意性を確認する。IDや本文、credentialは通常ログに表示せず、合否のみ出す。送信操作は存在しない。Environment設定が未登録の間は実データ検証済みと扱わない。
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
