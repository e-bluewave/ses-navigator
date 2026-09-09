# BA-007 Storage外部バックアップ 実環境証跡テンプレート

RB-012に従って実施したStorage外部バックアップを、保存先ベンダーやSecretをGitHubへ記録せず検証するためのテンプレート。

## 禁止事項

以下をGitHub、PR、Issue、チャット、ログへ記録しない。

- Supabase Project Ref / URL
- S3 endpoint / bucket名 / account ID
- Access key / Secret key / JWT / API key
- 署名URL
- object本文、個人情報、Productionデータ
- 保存先の直接取得URLやcredential

証跡JSONはアクセス制御されたリポジトリ外の運用管理場所へ保存する。

## DBとの復旧ポイント整合

Storage backupは対応するBA-006 DB backupと相互参照し、private manifestで両方の復旧ポイント時刻を保持する。

- `startedAt`: Storage backup setの開始時刻。保守的なStorage復旧ポイントとして扱う。
- `databaseRecoveryPointRecorded`: 対応するBA-006の保守的なDB復旧ポイントがprivate manifestに記録済みであること。
- `storageRecoveryPointRecorded`: Storage側復旧ポイントが記録済みであること。
- `recoveryPointSkewMinutesMeasured`: DBとStorageの復旧ポイント差の絶対値を分で実測した値。
- `jointRecoveryPointEstablished`: BA-008が復旧対象として利用できる対応関係を確定したこと。

許容上限値はこのEvidence validatorでは決めない。差は必ず実測し、BA-009/RB-014のRPO評価へ渡す。

## JSONテンプレート

```json
{
  "evidenceId": "BA007-STORAGE-BACKUP-YYYYMMDD-01",
  "environment": "Staging",
  "startedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "allFileBucketsIncluded": true,
  "bucketAndObjectKeyPreserved": true,
  "sourceObjectCount": 0,
  "backedUpObjectCount": 0,
  "sourceTotalBytes": 0,
  "backedUpTotalBytes": 0,
  "transferErrorCount": 0,
  "allTransferErrorsRetried": true,
  "integrityVerification": "checksum",
  "manifestCreated": true,
  "offsiteDestinationConfirmed": true,
  "sameSupabaseProjectDestination": false,
  "repositoryDestination": false,
  "githubActionsArtifactLongTermDestination": false,
  "generationProtectionMode": "immutable-snapshot",
  "generationProtectionVerified": true,
  "timestampedSnapshotPrefixUsed": true,
  "retentionLockEnabled": true,
  "encryptedAtRest": true,
  "tlsInTransit": true,
  "retentionDays": 35,
  "frequencyHours": 24,
  "sourceDeletionPropagatesImmediately": false,
  "dedicatedBackupCredentialUsed": true,
  "databaseBackupRunLinked": true,
  "databaseRecoveryPointRecorded": true,
  "storageRecoveryPointRecorded": true,
  "recoveryPointSkewMinutesMeasured": 0,
  "jointRecoveryPointEstablished": true,
  "credentialExposed": false,
  "objectDataExposed": false,
  "secretFreeEvidence": true,
  "notes": ""
}
```

## 許容値

- `environment`: `Staging` / `Production`
- `integrityVerification`: `checksum` / `etag-and-size` / `equivalent`
- `generationProtectionMode`: `native-versioning` / `immutable-snapshot`

`immutable-snapshot`では`timestampedSnapshotPrefixUsed`と`retentionLockEnabled`をtrueにする。`native-versioning`では両フィールドをfalseにできる。

## 実施順序

1. Stagingの全対象Files bucketを列挙する。
2. 対応するBA-006 DB backup runを選び、DB復旧ポイントがprivate manifestに存在することを確認する。
3. Storage backup開始直前に`startedAt`を記録する。
4. DB/Storage復旧ポイント差を分で計算し、`recoveryPointSkewMinutesMeasured`として記録する。
5. bucket名/object keyを保持したmanifestを作成する。
6. 専用backup credentialで外部保存先へ転送する。
7. Source object数・総bytesと転送後の件数・総bytesを照合する。
8. checksum、ETag+size等でintegrityを確認する。
9. 転送失敗がある場合は全件再実行し、解消を確認する。
10. 外部保存先が対象Supabase Projectとは別障害ドメインであることを確認する。
11. generation protection、保存時暗号化、TLS、35日以上保持、24時間以内の実行間隔を確認する。
12. Source削除が外部保存先へ即時伝播しないことを確認する。
13. `completedAt`を記録し、DB/Storageのjoint recovery point対応をprivate manifestで確定する。
14. credentialやobject本文がログ・証跡へ露出していないことを確認する。
15. Evidence JSONをUTF-8 BOMなしで保存して検証する。

Windows PowerShellでは必要に応じて`System.Text.UTF8Encoding($false)`を使用し、BOMなしUTF-8を明示する。

```text
pnpm security:storage-backup-evidence -- "C:\path\outside-repository\storage-backup-evidence.json"
```

成功条件:

```text
STORAGE_BACKUP_EVIDENCE_PASSED
```

## 注意

この証跡チェックは保存先ベンダーを固定しない。実保存先の選定とStaging初回バックアップが完了するまではBA-007を完了扱いにしない。

復旧可能性の確認はBA-008で行う。復旧ポイント差の許容性とRPO/RTO目標はBA-009/RB-014で判断する。
