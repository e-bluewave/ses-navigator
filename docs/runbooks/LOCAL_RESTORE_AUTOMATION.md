# Local Restore Automation

Disposable Local SupabaseでBA-008相当の復旧訓練を短縮するための自動実行手順。

## 対象

この自動ランナーは、BA-006の`roles.sql`をpreflightで解析した結果、Application custom roleが0件のときに使用する。Supabase管理reserved roleは復旧先native状態を維持し、replayしない。

custom roleが1件以上ある場合はfail-closedで停止し、自動DB restoreを実行しない。

## 1コマンドで行うこと

`security:restore-local-db`は次を順番に実行する。

1. Disposable Local Supabase target probe
2. restore専用container名token確認
3. Supabase PostgreSQL image確認
4. `pg_default_acl`安全確認
5. roles/schema/data strict UTF-8・BOM検査
6. Storage管理SQL混入検査
7. custom/reserved role分類
8. dependency readiness確認
9. schema/dataを同一`psql --single-transaction`で復旧
10. `ON_ERROR_STOP=1`で途中エラーを即時失敗扱い
11. BA-006 schemaから期待`app`/`audit` table数を取得
12. 復旧DBの`app`/`audit` table数を実測して一致確認

DB URL、password、Project Refは引数として受け取らない。Docker内のlocal PostgreSQLへ`docker exec`で接続する。

## PowerShell実行形

```powershell
& {
  $ErrorActionPreference = 'Stop'

  npx.cmd pnpm@10.15.0 security:restore-local-db -- `
    --facts  'C:\private-evidence\restore-preflight.json' `
    --roles  'C:\private-evidence\roles.sql' `
    --schema 'C:\private-evidence\schema.sql' `
    --data   'C:\private-evidence\data.sql' `
    --repo   'D:\path\to\ses-navigator' `
    --environment 'Disposable' `
    --container '<disposable-local-supabase-db-container>' `
    --required-name-token 'restore-drill'

  if ($LASTEXITCODE -ne 0) {
    throw 'Local DB restore failed'
  }
}
```

成功時は`LOCAL_DB_RESTORE_PASSED`となる。

## fail-closed条件

次のいずれかで復旧を開始しない、またはPASSを出さない。

- target probe/preflightがFAIL
- custom roleが1件以上
- backup schemaからApplication tableを取得できない
- `psql` exit codeが0以外
- 復旧後Application table数がbackup schema基準と不一致

## このランナーの後に必要な工程

DB復旧後も次は別途必要。

- Storage API/S3互換APIによるStorage復旧とinventory/integrity確認
- Auth Smoke
- Application Smoke
- Data API/RLS回帰
- representative Storage read
- migration/tombstone parity
- RPO/RTO計測
- secret-free final Evidence validator

これらがすべてPASSするまでBA-008相当の復旧訓練は完了扱いにしない。
