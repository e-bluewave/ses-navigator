# 14 row_version適用分類

## 1. 目的

楽観ロックを必要とする更新主体テーブルと、追記専用・版管理・内部処理テーブルを区別し、`row_version`の適用範囲を確定する。

## 2. 判定原則

- 画面または業務APIから同一行を編集するテーブルは`row_version`を必須とする。
- APIは`ETag`と`If-Match`を使用し、不一致時は`412 Precondition Failed`を返す。
- 状態遷移を専用RPCやワーカーが`where status = :expected`等で条件付き更新するテーブルは、処理条件自体を競合検知に使う。
- 履歴、監査、イベント、スナップショット、版データ、AI入出力は追記専用とし、原則更新しない。
- 純粋な関連・集合テーブルは追加・削除で扱い、行の部分更新を許可しない。

## 3. 分類A: row_version追加対象

既存DDLに`updated_at`があり、画面または業務APIから同一行を編集する次の30テーブルを追加対象とする。

|領域|テーブル|
|---|---|
|テナント・認証|`tenants`, `organizations`, `user_profiles`, `roles`, `tenant_memberships`, `organization_memberships`|
|会社|`company_roles`, `company_risk_records`, `company_duplicate_candidates`|
|技術者|`engineer_private_details`, `engineer_affiliations`, `engineer_preferences`, `skills`, `engineer_skills`|
|案件|`project_company_relations`, `project_skills`, `project_position_skills`, `project_work_conditions`, `project_contract_conditions`, `project_assignments`, `project_merge_jobs`|
|提案・承認・配信|`approval_requests`, `approval_steps`, `outbound_messages`, `message_templates`|
|面談|`interviews`, `interview_feedback`, `interview_outcomes`|
|内部API|`idempotency_records`, `webhook_deliveries`|

追加Migrationでは各テーブルへ次を追加し、既存行は既定値`1`で初期化する。

```sql
row_version bigint not null default 1
```

更新時の自動加算は共通`before update`トリガーで行う。クライアントが`row_version`を直接指定する更新は許可しない。

## 4. 分類B: 専用操作・条件付き更新

次のテーブルは更新されるが、汎用PATCH対象にしない。権限変更、取消、配信、ジョブ処理等の専用RPC・ワーカーで期待状態を条件に更新する。

- `user_roles`, `system_admins`, `record_shares`
- `resume_extraction_results`, `engineer_merge_jobs`, `project_extraction_results`
- `outbound_message_recipients`, `message_delivery_attempts`
- `interview_participants`, `notification_recipients`
- `job_attempts`, `outbox_events`, `file_versions`

競合時は更新件数0件を検知し、業務競合または既処理として扱う。汎用更新APIを後から追加する場合は、分類Aへ変更する。

## 5. 分類C: 追記専用・版・履歴・監査

次の種類は作成後に内容を更新しない。訂正は新しい行または新しい版を追加する。

- `*_histories`, `*_versions`, `*_snapshots`, `*_events`
- `proposal_outcomes`, `job_results`
- `ai_execution_inputs`, `ai_execution_outputs`, `ai_execution_feedback`
- `audit.audit_logs`, `audit.task_status_histories`

追記専用テーブルに対する通常ロールの`UPDATE`権限は付与しない。

## 6. 分類D: 集合・関連・参照定義

次の種類は行の部分更新を行わず、追加・削除または集合置換で扱う。

- `permissions`, `role_permissions`
- `engineer_preferred_locations`, `engineer_preferred_contract_types`
- `skill_aliases`, `career_history_skills`
- `file_links`, `comment_links`, `tag_links`, `task_assignments`, `task_links`
- その他、`updated_at`を持たない純粋な関連テーブル

並び順や属性を頻繁に個別編集する要件が追加された場合は、分類Aへ変更する。

## 7. 実装・検証条件

1. Migrationで分類Aの30テーブルへ`row_version`を追加する。
2. 共通トリガー関数を追加し、分類Aと既存`row_version`保有テーブルへ適用する。
3. 更新APIで`If-Match`必須、競合時`412`を契約テストする。
4. 分類Bは期待状態を含む条件付き更新と更新件数検証をテストする。
5. 分類Cは通常ロールの`UPDATE`拒否を自動テストする。

## 8. 更新履歴

|日付|内容|
|---|---|
|2026-08-08|Migration 001〜121の物理DDLを基に初回分類を確定|
