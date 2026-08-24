# RB-011 DB論理バックアップ

## 目的

SES NavigatorのSupabase PostgreSQLについて、MVP本番開始前に必要な論理バックアップの標準手順を定義する。

対象は **DBの論理バックアップ**。Supabase Storageの実オブジェクトはDBバックアップに含まれないため、StorageバックアップはBA-007で別管理する。

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

## バックアップ構成

1回のバックアップは以下3ファイルを1セットとして扱う。

1. `roles.sql`
2. `schema.sql`
3. `data.sql`

代表コマンド例:

```powershell
supabase db dump --db-url "$env:SESN_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$env:SESN_DB_URL" -f schema.sql
supabase db dump --db-url "$env:SESN_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

`SESN_DB_URL`の値自体は表示しない。PowerShell履歴やCIログにも展開値を残さない。

## バックアップ後の検証

各実行で次を記録する。

- 実行日時
- 対象環境（Staging / Production）
- PostgreSQLメジャーバージョン
- roles/schema/dataの生成成功
- 各ファイルサイズ
- 各ファイルのSHA-256等のチェックサム
- 保存先の論理識別子（秘密情報や直接取得URLを含めない）
- 保持期限
- 実行結果

バックアップファイルそのものやDB接続文字列はGitHubへコミットしない。

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

## 定期実行

MVP初期値は **1日1回** とする。BA-009でRPO/RTOを確定した結果、24時間より短いRPOが必要になった場合は頻度を引き上げる。

Pro/Team/EnterpriseのSupabase管理バックアップが有効でも、運用上必要な独立コピーとして論理バックアップを維持する。Free tierでは特にオフサイト論理バックアップを必須とする。

## 復旧確認との分離

バックアップ取得成功だけでは復旧可能性を保証しない。別環境への復旧手順・定期訓練・責任者はBA-008で管理する。

BA-006の完了条件:

- `ops/database-backup-policy.json`がCIでPASS
- 実際の保存先をGitHub外で決定
- Stagingで1回以上、roles/schema/dataのバックアップ成功
- チェックサムと保持期限を非秘密情報として確認
- 保存先暗号化とTLSを確認
- バックアップにDB接続情報が露出していないことを確認

## CI検証

```bash
pnpm security:db-backup
pnpm security:db-backup:check
```

CIはポリシーと単体テストのみを実行し、実DBのバックアップや本番Secretの読み込みは行わない。
