# SES Navigator Data API実機検証レポート

## 対象

| 項目 | 内容 |
|---|---|
| Repository | `e-bluewave/ses-navigator` |
| Branch | `ddl-initial` |
| Supabase Project Ref | `zsgauwmkvvezdxvmcmdf` |
| PostgreSQL | 16 |
| Migration | 001～117 |
| 記録日 | 2026-07-31（JST） |
| 後片付け完了日 | 2026-08-02（JST） |

## 総合結果

**合格：37 / 37**

| 検証 | 合格 | 総数 | 判定 |
|---|---:|---:|---|
| 6 ViewのData API検証 | 18 | 18 | PASS |
| service_role拒否・限定RPC検証 | 19 | 19 | PASS |
| 合計 | 37 | 37 | PASS |

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

## データ変更

- `03_validation.ps1`：読み取り専用
- `04_service_role_rpc_validation.ps1`：読み取り専用
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

Data API実機検証37件および検証データの後片付けは、すべて正常に完了した。

**最終結果：PASS**
