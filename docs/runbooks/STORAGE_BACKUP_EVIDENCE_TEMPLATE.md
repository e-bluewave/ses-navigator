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

## JSONテンプレート

```json
{
  "evidenceId": "BA007-STORAGE-BACKUP-YYYYMMDD-01",
  "environment": "Staging",
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
  "destinationVersioningEnabled": true,
  "encryptedAtRest": true,
  "tlsInTransit": true,
  "retentionDays": 35,
  "frequencyHours": 24,
  "sourceDeletionPropagatesImmediately": false,
  "dedicatedBackupCredentialUsed": true,
  "databaseBackupRunLinked": true,
  "credentialExposed": false,
  "objectDataExposed": false,
  "secretFreeEvidence": true,
  "notes": ""
}
```

## 許容値

- `environment`: `Staging` / `Production`
- `integrityVerification`: `checksum` / `etag-and-size` / `equivalent`

## 実施順序

1. Stagingの全対象Files bucketを列挙する。
2. bucket名/object keyを保持したmanifestを作成する。
3. 専用backup credentialで外部保存先へ転送する。
4. Source object数・総bytesと転送後の件数・総bytesを照合する。
5. checksum、ETag+size等でintegrityを確認する。
6. 転送失敗がある場合は全件再実行し、解消を確認する。
7. 外部保存先が対象Supabase Projectとは別障害ドメインであることを確認する。
8. versioning、保存時暗号化、TLS、35日以上保持、24時間以内の実行間隔を確認する。
9. Source削除が外部保存先へ即時伝播しないことを確認する。
10. 対応するBA-006 DB backup runとの関係を運用台帳へ記録する。
11. credentialやobject本文がログ・証跡へ露出していないことを確認する。
12. リポジトリ外の証跡JSONを検証する。

```text
pnpm security:storage-backup-evidence -- "C:\path\outside-repository\storage-backup-evidence.json"
```

成功条件:

```text
STORAGE_BACKUP_EVIDENCE_PASSED
```

## 注意

この証跡チェックは保存先ベンダーを固定しない。実保存先の選定とStaging初回バックアップが完了するまではBA-007を完了扱いにしない。

復旧可能性の確認はBA-008で行う。
