# SES Navigator Data API実機検証レポート

## 対象

| 項目 | 内容 |
|---|---|
| Repository | `e-bluewave/ses-navigator` |
| Branch | `Main` |
| Supabase Project Ref | 非公開（実行環境で確認） |
| PostgreSQL | 17 |
| Migration | 001～158 |
| 記録日 | 2026-07-31（JST） |
| 後片付け完了日 | 2026-08-02（JST） |
| 118・119回帰確認日 | 2026-08-04（JST） |
| 45件統合実環境検証・後片付け完了日 | 2026-08-24（JST） |

## 総合結果

**合格：45 / 45**

| 検証 | 合格 | 総数 | 判定 |
|---|---:|---:|---|
| 6 ViewのData API検証 | 18 | 18 | PASS |
| service_role拒否・限定RPC検証 | 19 | 19 | PASS |
| Data API実環境境界検証 | 8 | 8 | PASS |
| 合計 | 45 | 45 | PASS |

## 6 ViewのData API検証

対象View：

- `engineer_private_summaries`
- `contract_summaries`
- `finance_invoice_summaries`
- `finance_expense_summaries`
- `ai_execution_summaries`
- `audit_event_summaries`

| Actor | 期待結果 | 結果 |
|---|---|---|
| anon | 6 ViewすべてHTTP 401 | 6 / 6 PASS |
| User A | HTTP 200、Tenant Aの1件のみ、返却列一致 | 6 / 6 PASS |
| User B | HTTP 200、全View 0件 | 6 / 6 PASS |

確認事項：

- HTTP認証
- `anon`／`authenticated`のGRANT境界
- `SECURITY INVOKER`
- 基底テーブルのRLS
- Tenant分離
- 5種類の権限によるアクセス制御
- Viewの公開列制限

## service_role拒否・限定RPC検証

| 検証 | 期待結果 | 結果 |
|---|---|---|
| service_roleから6 View | HTTP 403 | 6 / 6 PASS |
| anonから限定RPC | HTTP 401 | PASS |
| authenticatedから限定RPC | HTTP 403 | PASS |
| service_roleから許可対象5種類 | HTTP 200、返却形式・Tenant境界一致 | 5 / 5 PASS |
| 存在しない対象 | HTTP 404 | PASS |
| Tenant不一致5種類 | HTTP 404 | 5 / 5 PASS |

追加確認事項：

- 監査JSONの再帰的な秘匿化
- 対象なし・Tenant不一致時の情報漏えい防止
- service_roleへの限定RPC以外の公開抑止

## Data API実環境境界検証

| 検証 | 期待結果 | 結果 |
|---|---|---|
| anonから`app`・`public` | 拒否 | 2 / 2 PASS |
| authenticatedから`app`リレーション・`public`認証補助RPC | 到達可能 | 2 / 2 PASS |
| レビュー済み更新面 | 存在しないランダムUUIDへの0件更新 | PASS |
| 未許可更新面 | 拒否 | PASS |
| Service Role限定RPC | authenticatedを拒否 | PASS |
| 内部`audit`スキーマ | 非公開 | PASS |

実データに一致しないランダムUUIDを使用し、対象0件の更新だけを実行した。業務データの追加・変更・削除はない。

**Data API実環境境界検証：8 / 8 PASS**

## Migration 118・119適用後の回帰確認

### SQL回帰確認

| 確認項目 | 結果 |
|---|---|
| `app.current_user_id()`の`search_path = pg_catalog, public` | PASS |
| `app.system_admins`の`system_admin_update` Policyが存在しない | PASS |
| `authenticated`が`app.system_admins`のUPDATE権限を持たない | PASS |

### 限定6 Viewの簡易回帰確認

Supabase Data APIのExposed schemaは`public`を使用した。Migration 114で作成し、117で`security_invoker=true`を設定した6 Viewについて、ログイン済み検証ユーザーで再確認した。

| 期待結果 | 結果 |
|---|---|
| HTTP 200 | 6 / 6 PASS |
| 応答 `[]` | 6 / 6 PASS |
| 件数 0 | 6 / 6 PASS |

**Migration 118・119回帰結果：PASS**

## データ変更

- `03_validation.ps1`：読み取り専用
- `04_service_role_rpc_validation.ps1`：読み取り専用
- `pnpm security:data-api:all`：限定View 18件、Service Role・RPC 19件、実環境境界8件を統合実行
- 統合スイートの`databaseChanges`：`false`
- 検証中の業務データ追加・更新・削除：なし
- `02_setup.sql`が作成した固定IDの検証データ：後片付け対象

## 秘密情報の取扱い

本レポートには以下を保存していない。

- 実メールアドレス
- パスワード
- JWT
- Publishable key／Legacy anon key
- Secret key／Legacy service_role key
- Data APIのレスポンス本文

## 後片付け

`05_cleanup.sql`を実行し、後片付けが正常終了した。

完了条件：

- 固定UUIDの検証データが0件
- 検証用Tenantコードが0件
- 検証マーカーが0件
- 検証専用User BのAuthenticationが削除済み
- User AのAuthenticationが保持されている
- 実行結果が`CLEANUP_PASSED`

実行結果：

| 項目 | 結果 |
|---|---|
| Status | `CLEANUP_PASSED` |
| Validation marker | `SESN-DATA-API-VALIDATION-V1` |
| 検証専用User B | 削除済み |
| User A | 保持済み |
| 削除したアプリケーション行 | 51件 |
| 検証データ残存数 | 0件 |

現在の状態：**後片付け完了**

## 最終判定

Data API統合実環境検証45件、検証データの後片付け、Migration 118・119のSQL回帰確認および限定6 View再確認は、すべて正常に完了した。

- 統合スイート：`DATA_API_SECURITY_SUITE_PASSED`
- 合格：45 / 45
- 検証による業務データ変更：なし
- 後片付け：`CLEANUP_PASSED`
- 削除した検証用アプリケーション行：51件
- 検証データ残存：0件
- User A Authentication：保持
- User B Authentication：削除

**最終結果：PASS**
