# Restore Preflight Facts Template

BA-008のDB/Storage復旧を開始する前に、`security:restore-preflight`へ渡すprivate facts JSONの契約を示す。

このfacts JSONは **Secret-free** とする。DB URL、Supabase URL、Project Ref、JWT、API key、backup run ID、bucket名、担当者名、メールアドレス、復旧データ本文を含めない。

## JSON template

```json
{
  "version": 1,
  "environment": "Disposable",
  "productionTarget": false,
  "separateRestoreEnvironment": true,
  "targetIdentityVerified": true,
  "productionSecretsReused": false,
  "databaseBackupRunLinked": true,
  "storageBackupRunLinked": true,
  "restorePointAlignment": "PASS",
  "targetDefaultAclNormalized": true,
  "migrationBaselineRecorded": true,
  "applicationSchemaBaselineRecorded": true,
  "restoreCommandSingleTransaction": true,
  "restoreCommandOnErrorStop": true,
  "artifactCopyHashParity": "NOT_APPLICABLE",
  "customRoleCount": 0,
  "roleReplayMode": "intentional-skip-empty-custom-set",
  "reservedRoleReplayPlanned": false,
  "storageRestoreViaApiOrS3Planned": true,
  "storageProtectDeleteDisablePlanned": false,
  "falsePassGuardReady": true,
  "secretFreeFacts": true
}
```

`environment`は`Disposable`または`Staging`のみ許可する。Productionを指定するとpreflightはFAILする。

`artifactCopyHashParity`は、SQLをcontainer等へコピーした場合は`PASS`、コピーしていない場合だけ`NOT_APPLICABLE`とする。

`customRoleCount`が0の場合、`roleReplayMode`は`intentional-skip-empty-custom-set`とする。1件以上の場合は`custom-only`とし、Supabase管理reserved roleをreplayしない。

## 実行例

PowerShellでは1ブロックで実行し、途中失敗後に後続PASS処理を継続させない。

```powershell
& {
  $ErrorActionPreference = 'Stop'

  npx.cmd pnpm@10.15.0 security:restore-preflight -- `
    --facts  'C:\private-evidence\restore-preflight.json' `
    --roles  'C:\private-evidence\roles.sql' `
    --schema 'C:\private-evidence\schema.sql' `
    --data   'C:\private-evidence\data.sql' `
    --repo   'D:\path\to\ses-navigator'

  if ($LASTEXITCODE -ne 0) {
    throw "Restore preflight failed"
  }
}
```

成功時のstatusは`RESTORE_PREFLIGHT_PASSED`。FAIL時はrestoreを開始しない。

## 自動検査される項目

- facts JSON / roles.sql / schema.sql / data.sqlのstrict UTF-8とBOM禁止
- Production target禁止、別restore環境、target identity確認
- Production Secret再利用禁止
- BA-006 / BA-007 linkageとrestore point alignment
- default ACL正規化済み
- migration / Application schema baseline記録済み
- single transaction / `ON_ERROR_STOP`使用予定
- Storage restoreをAPI/S3互換経路で行うこと
- `storage.protect_delete`を無効化しないこと
- roles.sqlからcustom/reserved role数を分類し、factsのcustom role数と一致確認
- schema/data SQLにStorage管理schema/metadata参照が混入していないこと
- `pnpm-lock.yaml`、TypeScript binary、package manager pinの依存関係readiness
- false PASS防止準備

出力はboolean/count/findingsだけとし、role名、SQL本文、ファイルpath、Secret値を表示しない。
