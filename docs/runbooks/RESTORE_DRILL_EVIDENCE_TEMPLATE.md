# BA-008 Restore Drill Evidence Template

このテンプレートは、BA-008「DB・Storage復旧訓練」の実環境証跡を、Secret・個人情報・実Project識別子をGitHubへ保存せずに記録するためのものです。

## 記録ルール

- Productionへ直接復旧しない。
- 復旧先はStagingまたは破棄可能な専用検証環境に限定する。
- Production Secretを復旧先へ再利用しない。
- DB URL、password、JWT、API key、Project Ref、メールアドレス、個人情報、Storage object本文は記録しない。
- DB backup runとStorage backup runは、実値そのものではなく運用台帳上で相互参照できることだけを記録する。
- follow-upが必要な場合は、公開可能な非機密IDが存在することだけを記録する。

## Evidence JSON例

実際の証跡JSONはGitHub外の安全な運用領域へ保存し、以下の形式でチェッカーへ渡します。

```json
{
  "evidenceId": "BA008-RESTORE-YYYYMMDD-01",
  "environment": "Staging",
  "startedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "productionTarget": false,
  "separateRestoreEnvironment": true,
  "productionSecretsReused": false,
  "databaseBackupRunLinked": true,
  "storageBackupRunLinked": true,
  "restorePointAlignment": "PASS",
  "rolesRestore": "PASS",
  "schemaRestore": "PASS",
  "dataRestore": "PASS",
  "databaseRestoreTransactional": true,
  "databaseOnErrorStop": true,
  "storageRestore": "PASS",
  "storageObjectCountParity": "PASS",
  "storageTotalBytesParity": "PASS",
  "storageIntegrityVerification": "PASS",
  "databaseStorageConsistency": "PASS",
  "authSmokeTest": "PASS",
  "applicationSmokeTest": "PASS",
  "dataApiSecurityRegression": "PASS",
  "rlsTenantIsolation": "PASS",
  "storageInventoryVerification": "PASS",
  "representativeFileRead": "PASS",
  "migrationParity": "PASS",
  "deletionTombstonesReapplied": "PASS",
  "rtoMinutesMeasured": 0,
  "recoveryPointAgeMinutesMeasured": 0,
  "followUpRequired": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "notes": "Secret-free summary only."
}
```

follow-upが必要な場合のみ次を追加します。

```json
{
  "followUpRequired": true,
  "followUpReferencePresent": true
}
```

## 実行

```bash
pnpm security:restore-drill-evidence /path/to/evidence.json
```

成功時:

```text
RESTORE_DRILL_EVIDENCE_PASSED
```

## BA-008完了判定

このチェッカーがPASSしても、実際の別環境復旧を行っていなければBA-008は完了ではありません。少なくともDB・Storage復旧、Auth/Application/Data API/RLS、Storage integrity、Migration parity、削除tombstone再適用、RTO/復旧ポイント経過時間の実測が必要です。
