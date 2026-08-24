# RB-006 Secret漏えい・ローテーション

## 1. 目的

SES Navigatorで利用するSecret、APIキー、署名鍵、接続資格情報について、平文を記録せずに保管・定期棚卸し・計画ローテーション・緊急失効・事後確認を行う。

## 2. 適用範囲

- Supabase Secret key、Legacy service_role key、DB接続パスワード
- Vercelの環境変数
- OpenAI API key
- SMTP資格情報
- OAuth client secret／refresh token
- Webhook signing secret
- 外部連携のAPI key／token
- GitHub Actionsに登録するRepository／Environment secret

Publishable keyなど公開可能な識別子も、環境取り違えと意図しない差し替えを防ぐため棚卸し対象に含める。

## 3. 禁止事項

- Secretの値をGit、Issue、PR、チャット、設計書、実行ログへ貼り付けない。
- Secretをブラウザ向け環境変数、Webソース、ビルド成果物へ含めない。
- ローテーション前に旧Secretを失効しない。ただし漏えいが継続している場合は封じ込めを優先する。
- Supabase JWT signing key、Secret key、DB passwordを同一のものとして扱わない。
- 秘密値の全文・末尾・復元可能な暗号文を証跡へ記録しない。
- Production SecretをLocalまたはStagingへ流用しない。

## 4. 権限と責任

| 役割 | 責務 |
| --- | --- |
| サービス責任者 | Production変更・緊急失効・利用者通知の最終判断 |
| 実行者 | 新Secret発行、配備、Smoke test、旧Secret失効 |
| 確認者 | 対象・環境・証跡・旧Secret無効化の確認 |
| インシデント責任者 | 漏えい範囲、ログ保全、利用者・関係者連絡の判断 |

MVPの単独運用では兼任を許容するが、実行前後のチェックリストと時刻を残し、自己承認であることを明記する。

## 5. 保管場所

| 環境・用途 | 正式な保管先 | 備考 |
| --- | --- | --- |
| Local | OSの資格情報保管または暗号化されたパスワード管理 | リポジトリ外。PowerShellでは対話入力を優先 |
| CI | GitHub Environment／Repository secrets | Fork由来PRへProduction secretを渡さない |
| Vercel Preview | Preview環境変数 | Productionと分離 |
| Vercel Production | Production環境変数 | 変更後の再デプロイを確認 |
| Supabase Edge Functions | Supabase secrets | Dashboard表示・ログへの出力禁止 |
| 外部サービス | 各ProviderのSecret管理 | 用途・環境ごとに分離可能なら個別発行 |

## 6. Secret台帳

台帳には値を保存せず、次のメタデータだけを記録する。

| 項目 | 内容 |
| --- | --- |
| Secret ID | 値と無関係な一意名称 |
| Provider | Supabase、Vercel、OpenAI等 |
| 用途 | 利用する機能・サービス |
| 環境 | Local、CI、Staging、Production |
| 保管先 | Providerと登録場所。値や直接参照URLは記録しない |
| 所有者 | ローテーション判断者 |
| 利用コンポーネント | API、Worker、CI等 |
| 発行日・最終更新日 | 日付のみ |
| 状態 | active、rotating、revoked |
| 次回確認日 | 棚卸し予定日 |
| 失効条件 | 漏えい疑い、退職、用途終了、Provider要件等 |

台帳にAPI key、JWT、password、token、秘密値の断片を含めてはならない。

## 7. 計画ローテーション

1. 対象Secret ID、環境、利用箇所、所有者を台帳で確認する。
2. Providerの監査ログと直近利用を確認し、未把握の利用箇所がないことを確認する。
3. Issueまたは運用記録へ変更目的、対象環境、実行予定、確認項目、切戻し条件を記録する。
4. 新Secretを既存と並行利用できる形で発行する。
5. Secret管理基盤へ新Secretを登録し、対象コンポーネントだけを再デプロイする。
6. 認証、主要参照、対象外拒否、該当外部連携のSmoke testを行う。
7. 監視で認証失敗、5xx、Webhook署名失敗、Job滞留が増えていないことを確認する。
8. 旧Secretを失効する。
9. 旧Secretでのアクセスが失敗し、新Secretによる主要機能が成功することを確認する。
10. 台帳と運用記録へ実行時刻、実行者、確認結果、旧Secret失効を記録する。

## 8. 緊急ローテーション

漏えい、誤公開、不審利用、端末紛失、退職・権限逸脱を検知した場合は次の順で対応する。

1. 影響する機能・デプロイ・連携を停止し、漏えい経路を閉じる。
2. Providerログ、Git履歴、CI Artifact、Vercel Deployment、Supabase Auth／APIログを保全する。
3. 侵害されたSecretを失効または新Secretへ切り替える。
4. 必要に応じて利用者セッション、OAuth token、Webhook secretを追加失効する。
5. 新Secretで最小限のSmoke testを行う。
6. 不正アクセス、Tenant越境、データ変更、秘密情報取得の有無を確認する。
7. P1/P2インシデントとして事後レビューを行い、再発防止をCI・Runbookへ反映する。

漏えいが疑われる値は、エラーメッセージが削除を促していても、値が実際に第三者へ露出したかと利用経路を確認して判断する。チャットやログへ貼り付けた場合は露出として扱う。

## 9. Provider別手順

### 9.1 Supabase Secret key

1. Settings → API Keysで用途別の新しいSecret keyを作成する。
2. Vercel、CI、Worker等のサーバー側保管先を更新する。
3. ブラウザへ配信される変数やBundleに含まれないことを確認する。
4. Data API／Auth Admin等の対象Smoke testを行う。
5. 旧Secret keyを削除する。
6. pnpm security:client-secretsと関連する実環境回帰を実行する。

新しいsb_secret形式は秘密値であり、ブラウザUser-Agentからの利用が拒否される。サーバーまたは所有端末上の管理CLIからだけ利用する。

### 9.2 Legacy service_role key

可能なコンポーネントから用途別のSupabase Secret keyへ移行する。Legacy JWT secretや署名鍵の変更は利用者セッションや複数サービスへ影響し得るため、通常のAPI key交換と同時に実施しない。

### 9.3 Supabase DB password

接続元、Pooler方式、Migration、バックアップ、監視の利用箇所を列挙してから変更する。新旧並行利用ができない場合はメンテナンス時間と切戻し条件を確定し、接続数・Migration・バックアップを確認する。

### 9.4 Vercel

環境変数をPreview／Productionで分離し、対象環境だけを更新して再デプロイする。過去Deploymentに古い値が残る可能性を考慮し、再公開・ロールバックの可否を確認する。

### 9.5 OpenAI API key

用途・環境別に新しいKeyを発行し、サーバー側Secretを更新する。代表AI処理、費用記録、エラー時の秘密値非表示を確認後、旧Keyを失効する。利用量に不審な増加がある場合は費用上限と組織監査ログも確認する。

### 9.6 Webhook／OAuth／SMTP

送信側と受信側の両方を確認し、並行鍵または移行期間を利用する。Webhookは署名成功・旧署名拒否・Replay拒否、OAuthは再認可とrefresh、SMTPは送信・バウンス・認証失敗を確認する。

## 10. 検証コマンド

秘密値は環境変数または対話入力からだけ渡す。

~~~text
pnpm security:client-secrets
pnpm security:supabase-config
pnpm security:data-api:all
pnpm smoke:auth-project
~~~

変更対象に関係するコマンドだけを選択し、Productionでは読み取り中心またはデータ非変更の検査を優先する。

## 11. 証跡テンプレート

~~~text
Secret ID:
Environment:
Reason:
Started at:
Completed at:
Executor:
Approver:
New credential deployed: yes/no
Smoke test:
Old credential revoked: yes/no
Old credential rejected: yes/no/not-testable
Monitoring result:
Affected sessions:
Incident ID:
Rollback:
Notes:
~~~

秘密値、メールアドレス、JWT、レスポンス本文は記録しない。

## 12. 定期確認

| 頻度 | 確認内容 |
| --- | --- |
| 月次 | active Secret、所有者、用途、不要Key、不審利用 |
| 四半期 | 利用箇所、環境分離、権限、次回確認日、Provider要件 |
| 随時 | 退職、権限変更、Provider障害、漏えい疑い、構成変更 |
| リリース前 | ブラウザ混入、環境取り違え、旧Secret失効漏れ |

## 13. 完了条件

- 対象Secretの利用箇所と所有者が特定されている。
- 新Secretで対象機能のSmoke testが成功している。
- 旧Secretが失効し、利用されていない。
- ログ、Git、Artifact、ブラウザBundleへの秘密値混入がない。
- 台帳と運用証跡が秘密値を含まず更新されている。
- 異常がある場合はインシデント記録と再発防止が登録されている。
