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

## JSONテンプレート

```json
{
  "evidenceId": "BA006-DB-BACKUP-YYYYMMDD-01",
  "environment": "Staging",
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
- `secretExposureReview`: `PASS`

Transaction Poolerは使用不可。

## 実施順序

1. Stagingを対象にDirectまたはSession Pooler接続を準備する。
2. `roles.sql`、`schema.sql`、`data.sql`を作成する。
3. `data.sql`はCOPYモードで取得し、RB-011指定の除外対象を維持する。
4. 3ファイルすべてのサイズが0より大きいことを確認する。
5. 各ファイルのSHA-256等チェックサムを計算・確認する。
6. Manifestを作成する。ただし接続情報、Secret、個人情報は含めない。
7. 対象Supabase Project外かつGitリポジトリ外のオフサイト保存先へTLSで転送する。
8. 保存時暗号化、35日以上の保持、24時間以内の実行間隔を確認する。
9. DB URL / Passwordがログや証跡へ露出していないことを確認する。
10. リポジトリ外に証跡JSONを作成して検証する。

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
