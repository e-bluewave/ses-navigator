# BA-008 Restore Drill Evidence Template

このテンプレートは、BA-008「DB・Storage復旧訓練」の実環境証跡を、Secret・個人情報・実Project識別子をGitHubへ保存せずに記録するためのものです。

## 記録ルール

- Productionへ直接復旧しない。
- 復旧先はStagingまたは破棄可能な専用検証環境に限定する。
- Production Secretを復旧先へ再利用しない。
- DB URL、password、JWT、API key、Project Ref、メールアドレス、個人情報、Storage object本文は記録しない。
- DB backup runとStorage backup runは、実値そのものではなく運用台帳上で相互参照できることだけを記録する。
- 主担当・副担当の氏名はprivate運用台帳へ記録し、public Evidence JSONへ含めない。
- follow-upが必要な場合は、公開可能な非機密IDが存在することだけを記録する。
- JSONはstrict UTF-8、BOMなしで保存する。Windows PowerShell 5.1の`Set-Content -Encoding UTF8`はBOMを付けるため注意する。
- PASS JSONは全検証完了後のみ生成する。途中失敗後に無条件でPASS証跡を生成しない。

## 判定上の補足

### rolesRestore

`rolesRestore: "PASS"`は「raw roles.sqlを必ず実行した」ことを意味しない。Supabase管理reserved roleは復旧先native状態を維持し、Application custom roleが0件であることを確認できた場合は、reserved role replayを意図的にskipした結果をPASSとして記録できる。

### migrationParity

BA-006 backupにmigration ledgerが存在する場合はそのheadを基準にする。migration ledgerが存在しない場合は、backup時点schemaと復旧後DBのApplication schema/table等をsemantic parityで比較する。現在のMain migration数をbackup時点へ直接比較して誤判定しない。

### deletionTombstonesReapplied

soft-delete列を持つ対象テーブルについてbackupと復旧後を照合する。backup側0件、復旧後0件でも一致はPASSとして記録する。

### Storage

Storage復旧はStorage API/S3互換APIで実施し、`storage.buckets` / `storage.objects`等の管理metadataをSQL restoreしない。BA-007のbusiness object inventoryが0件でvalidation objectのみを復旧した場合は、business file restoreを実証したと記載しない。

### RPO/RTO

- `recoveryPointAgeMinutesMeasured`: 訓練開始/想定障害時点と、DB/Storageのうち保守的に古いjoint recovery pointとの差。
- `rtoMinutesMeasured`: 訓練開始から業務利用可能判定まで。後続cleanup完了まで不必要に延長しない。
- 目標超過時も実測値を補正せず、`followUpRequired: true`と公開可能なfollow-up referenceを記録する。

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

## UTF-8 BOMなし保存例（Windows PowerShell 5.1）

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $jsonText, $utf8NoBom)
```

## 実行

```bash
pnpm security:restore-drill-evidence /path/to/evidence.json
```

成功時:

```text
RESTORE_DRILL_EVIDENCE_PASSED
```

BOM付きJSONは次のstructured findingで失敗する。

```text
utf8-bom-not-allowed
```

malformed JSONは次で失敗する。

```text
evidence-json-invalid
```

## BA-008完了判定

このチェッカーがPASSしても、実際の別環境復旧を行っていなければBA-008は完了ではありません。少なくともDB・Storage復旧、Auth/Application/Data API/RLS、Storage integrity、Migration parity、削除tombstone再適用、RTO/復旧ポイント経過時間の実測が必要です。
