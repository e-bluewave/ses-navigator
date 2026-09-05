# BA-006 DB論理バックアップ実環境検証証跡

## 証跡ID

`BA006-DB-BACKUP-20260905-01`

## 対象

- 課題: BA-006 DB論理バックアップ
- 環境: Staging（非Production）
- Production変更: なし
- 参照Runbook: `RB-011_DB論理バックアップ.md`

## 検証結果

|確認項目|結果|
|---|---|
|DBバックアップポリシー|`DATABASE_BACKUP_POLICY_PASSED`|
|roles dump|PASS|
|schema dump|PASS|
|data dump|PASS|
|data dump方式|COPY使用|
|PostgreSQLメジャーバージョン|17|
|DB接続方式|Session Pooler|
|Gitリポジトリ外の保存先|PASS|
|対象Supabase Project外のオフサイト保存|PASS|
|TLS転送|PASS|
|保存時暗号化|PASS|
|最低保持期間|35日|
|ライフサイクル削除|40日後|
|roles/schema/dataのSHA-256再取得照合|3/3 PASS|
|manifest作成|PASS|
|database backup evidence validator|`DATABASE_BACKUP_EVIDENCE_PASSED` / complete true / findings 0|
|Production touched|false|

## 補足

`data.sql` の取得時、循環外部キー制約に関する `pg_dump` warning が出力されたが、dump自体は正常終了した。バックアップ取得成功と復旧可能性は分離して扱い、実際の別環境への復旧可否はBA-008の復旧訓練で確認する。

具体的な保存先識別子、接続先、資格情報、DB接続情報はこの証跡には記録しない。詳細なmanifestおよび実証跡JSONはリポジトリ外の運用証跡領域に保存する。

## 秘密情報管理

GitHub証跡には次を記録していない。

- DB URL / DBパスワード
- Supabase Project Ref / Supabase URL
- Access Key / Secret Key
- S3互換Endpoint / アカウント識別子
- 具体的なバケット名
- JWT / Access Token / Refresh Token
- 個人情報またはバックアップデータ本体
- SHA-256値そのもの

## 判定

Stagingでroles/schema/dataの論理バックアップ取得、外部保存、サイズ一致、外部保存先からの再取得後SHA-256一致、35日以上の保持、TLS、保存時暗号化、manifest作成、秘密情報非露出、専用evidence validator PASSまで確認済みのため、BA-006を`verified`とする。
