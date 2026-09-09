# RB-011 DB論理バックアップ

## 目的

SES NavigatorのSupabase PostgreSQLについて、MVP本番開始前に必要な論理バックアップの標準手順を定義する。

対象は **Application DBの論理バックアップ**。Supabase Storageの実オブジェクトとSupabase管理Storage metadataはBA-007/BA-008で別管理する。

## 方針

- 標準方式: Supabase CLI `db dump`
- 頻度: 24時間以内に1回
- 保存期間: 35日以上
- 保存先: Gitリポジトリ外・対象Supabase Project外の管理されたオフサイトストレージ
- 転送: TLS必須
- 保存時: 暗号化必須
- 長期保存先としてGitHub Actions Artifactを使用しない
- DB URL、DBパスワード、接続文字列をGit、PR、Issue、チャット、ログへ出さない
- Transaction Poolerは論理バックアップに使用しない
- Direct接続またはSupavisor Session modeを使用する
- Supabase管理schemaをApplication DB復旧対象として扱わない。特にStorage管理metadataの復旧をこのdumpへ依存しない
- 各backup setで復旧ポイント時刻、migration baseline、Application schema baselineをprivate manifestへ記録する

## バックアップ構成

1回のバックアップは以下3ファイルを1セットとして扱う。

1. `roles.sql`
2. `schema.sql`
3. `data.sql`

代表コマンド例:

```powershell
supabase db dump --db-url "$env:SESN_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$env:SESN_DB_URL" -f schema.sql
supabase db dump --db-url "$env:SESN_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets" -x "storage.objects" -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

`SESN_DB_URL`の値自体は表示しない。PowerShell履歴やCIログにも展開値を残さない。

Supabase CLIは管理schemaを通常dumpから除外するが、復旧時にStorage metadataがSQL由来で再生成される余地を残さないため、data-only dumpでも`storage.buckets`、`storage.objects`、`storage.buckets_vectors`、`storage.vector_indexes`を明示除外する。CLIのデフォルト挙動だけに依存しない。

manifest/EvidenceでもStorage管理schemaをApplication復旧対象へ含めていないことを明示する。

## 保守的な復旧ポイント

`roles.sql`、`schema.sql`、`data.sql`は別コマンドで取得するため、3ファイルを単一transaction snapshotの同一瞬間として扱わない。

1. 最初のdump開始直前に`startedAt`を記録する。
2. BA-008/BA-009では、この`startedAt`をbackup setの保守的なDB復旧ポイントとして使用する。
3. 全artifact取得とchecksum確定後に`completedAt`を記録する。
4. `completedAt`だけからRPOを計算してはならない。

これにより、復旧訓練時にファイル時刻やフォルダ名を探索して復旧ポイントを推測することを禁止する。

## Migration / schema baseline

backup開始時にprivate manifestへ次を記録する。

- repository migration head、またはそれと同等のmigration baseline
- Application schema semantic baseline
- baseline取得方式

標準は`repository-migration-head`とする。migration ledgerが取得対象外、または復旧先へ再現されない方式では`schema-semantic-baseline`を使用できる。

実migration versionや詳細baselineはprivate manifestで管理する。公開Evidenceには次だけを記録する。

- `migrationBaselineRecorded: true`
- `migrationBaselineMethod`
- `applicationSchemaBaselineRecorded: true`

## バックアップ後の検証

各実行で次を記録する。

- `startedAt` / `completedAt`
- 対象環境（Staging / Production）
- PostgreSQLメジャーバージョン
- roles/schema/dataの生成成功
- 各ファイルサイズ
- 各ファイルのSHA-256等のチェックサム
- migration baseline記録済み
- Application schema baseline記録済み
- Storage管理schemaをApplication復旧対象へ含めていないこと
- `storage.buckets` / `storage.objects`を含む必須Storage data exclusionsが適用済みであること
- 保存先の論理識別子（秘密情報や直接取得URLを含めない）
- 保持期限
- 実行結果

バックアップファイルそのものやDB接続文字列はGitHubへコミットしない。

## Manifest

private manifestは最低限次を持つ。

- backup run ID
- `startedAt`
- `completedAt`
- artifact一覧とchecksum
- migration baseline実値と取得方式
- Application schema baseline
- Supabase管理schema除外確認
- 必須Storage data exclusion確認

manifest自体にもcredential、DB URL、Project Ref、個人情報を保存しない。

## 保存先要件

保存先は次をすべて満たすこと。

- 対象Supabase Projectとは障害ドメインを分離
- Gitリポジトリではない
- 保存時暗号化あり
- TLS経由でアップロード可能
- 35日以上のライフサイクル保持が設定可能
- 削除権限を最小化できる
- アクセス監査を取得できる

具体的なクラウド/バケット名、アカウントID、資格情報はGitHubへ記録しない。

## Evidence生成

Evidence JSONはUTF-8 BOMなしで保存する。Windows PowerShellでは`Set-Content -Encoding UTF8`のバージョン差に依存せず、必要に応じて`System.Text.UTF8Encoding($false)`を使用する。

Evidence validatorはBOMまたは不正JSONをPASS扱いにしない。

## 定期実行

MVP初期値は **1日1回** とする。BA-009のTier 1 RPO 60分を継続的に満たすには、論理バックアップだけでは頻度改善または別の復旧方式が必要である。このRunbookの24時間は上限であり、BA-009の目標達成を保証する値ではない。

Pro/Team/EnterpriseのSupabase管理バックアップが有効でも、運用上必要な独立コピーとして論理バックアップを維持する。Free tierでは特にオフサイト論理バックアップを必須とする。

## 復旧確認との分離

バックアップ取得成功だけでは復旧可能性を保証しない。別環境への復旧手順・定期訓練・責任者はBA-008で管理する。

BA-006の完了条件:

- `ops/database-backup-policy.json`がCIでPASS
- 実際の保存先をGitHub外で決定
- Stagingで1回以上、roles/schema/dataのバックアップ成功
- `startedAt`を保守的な復旧ポイントとしてprivate manifestに記録
- migration/Application schema baselineを記録
- Storage管理schema除外を確認
- `storage.buckets` / `storage.objects`を含む必須Storage data exclusionsを確認
- チェックサムと保持期限を非秘密情報として確認
- 保存先暗号化とTLSを確認
- バックアップにDB接続情報が露出していないことを確認
- BOMなしEvidence validatorがPASS

## CI検証

```bash
pnpm security:db-backup
pnpm security:db-backup:check
pnpm security:db-backup-evidence:check
```

CIはポリシーと単体テストのみを実行し、実DBのバックアップや本番Secretの読み込みは行わない。
