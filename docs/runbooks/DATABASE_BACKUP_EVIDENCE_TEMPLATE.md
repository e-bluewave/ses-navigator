# BA-006 DB論理バックアップ 実環境証跡テンプレート

RB-011に従って実施したDB論理バックアップを、保存先ベンダーやSecretをGitHubへ記録せず検証するためのテンプレート。

## 禁止事項

以下をGitHub、PR、Issue、チャット、ログへ記録しない。

- DB URL / 接続文字列 / Password
- Supabase Project Ref / URL
- Secret / JWT / API key
- メールアドレス
- バックアップファイル本体
- Productionデータ
- 保存先の直接取得URL、アカウントID、資格情報

証跡JSONはアクセス制御されたリポジトリ外の運用管理場所へ保存する。

## 復旧ポイントとbaseline

`roles.sql`、`schema.sql`、`data.sql`は別コマンドで取得するため、単一の物理snapshot時刻とはみなさない。BA-008でRPOを過小評価しないよう、1セットの最初のdump開始直前に記録した`startedAt`を、そのbackup setの保守的な復旧ポイントとして扱う。

private manifestには次を記録する。

- backup setの`startedAt` / `completedAt`
- repository migration head、または同等のmigration baseline
- Application schema semantic baseline
- Supabase管理schema、とくに`storage`をApplication DB論理dumpの復旧対象に含めていないこと

公開用Evidenceにはmigration head等の実値を載せず、記録済みであることと方式だけを残す。

## JSONテンプレート

```json
{
  "evidenceId": "BA006-DB-BACKUP-YYYYMMDD-01",
  "environment": "Staging",
  "startedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "postgresMajorVersion": 17,
  "rolesDumpCreated": true,
  "schemaDumpCreated": true,
  "dataDumpCreated": true,
  "dataUsedCopy": true,
  "rolesSizeBytes": 0,
  "schemaSizeBytes": 0,
  "dataSizeBytes": 0,
  "rolesChecksumVerified": true,
  "schemaChecksumVerified": true,
  "dataChecksumVerified": true,
  "migrationBaselineRecorded": true,
  "migrationBaselineMethod": "repository-migration-head",
  "applicationSchemaBaselineRecorded": true,
  "storageManagedSchemaExcluded": true,
  "connectionMode": "direct",
  "offsiteDestinationConfirmed": true,
  "sameSupabaseProjectDestination": false,
  "repositoryDestination": false,
  "githubActionsArtifactLongTermDestination": false,
  "tlsInTransit": true,
  "encryptedAtRest": true,
  "retentionDays": 35,
  "frequencyHours": 24,
  "manifestCreated": true,
  "secretExposureReview": "PASS",
  "databaseUrlExposed": false,
  "databasePasswordExposed": false,
  "secretFreeEvidence": true,
  "notes": ""
}
```

## 許容値

- `environment`: `Staging` / `Production`
- `connectionMode`: `direct` / `session-pooler`
- `migrationBaselineMethod`: `repository-migration-head` / `schema-semantic-baseline`
- `secretExposureReview`: `PASS`

Transaction Poolerは使用不可。

## 実施順序

1. Stagingを対象にDirectまたはSession Pooler接続を準備する。
2. `startedAt`を記録する。この時刻を保守的なDB復旧ポイントとして扱う。
3. private manifestへmigration baselineとApplication schema baselineを記録する。
4. `roles.sql`、`schema.sql`、`data.sql`を作成する。
5. `data.sql`はCOPYモードで取得し、Supabase管理schemaをApplication復旧対象へ混入させない。
6. 3ファイルすべてのサイズが0より大きいことを確認する。
7. 各ファイルのSHA-256等チェックサムを計算・確認する。
8. `completedAt`を記録し、manifestを確定する。ただし接続情報、Secret、個人情報は含めない。
9. 対象Supabase Project外かつGitリポジトリ外のオフサイト保存先へTLSで転送する。
10. 保存時暗号化、35日以上の保持、24時間以内の実行間隔を確認する。
11. DB URL / Passwordがログや証跡へ露出していないことを確認する。
12. Evidence JSONをUTF-8 BOMなしで保存して検証する。

Windows PowerShellでは`Set-Content -Encoding UTF8`の挙動差に依存せず、必要に応じて`System.Text.UTF8Encoding($false)`でBOMなしUTF-8を明示する。

```text
pnpm security:db-backup-evidence -- "C:\path\outside-repository\database-backup-evidence.json"
```

成功条件:

```text
DATABASE_BACKUP_EVIDENCE_PASSED
```

## 注意

この証跡チェックは保存先ベンダーを固定しない。具体的な外部保存先の選定は別途必要だが、それまでも実施要件と証跡形式を先に確定できる。

バックアップ取得成功だけで復旧可能性を保証しない。復旧訓練はBA-008で扱う。
