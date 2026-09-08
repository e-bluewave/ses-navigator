# BA-007 Storage外部バックアップ実環境検証証跡

## 証跡ID

`BA007-STORAGE-BACKUP-20260908-01`

## 対象

- 課題: BA-007 Storageオブジェクト外部バックアップ
- 環境: Staging（非Production）
- Production変更: なし
- 参照Runbook: `RB-012_Storage外部バックアップ.md`
- 連携DBバックアップ: BA-006

## 検証前状態

Staging StorageのFiles bucket一覧をS3互換APIで確認したところ、実Files bucketは0件だった。

そのため、BA-007の実環境要件を確認するための一時validation bucket/objectをStagingに作成し、バックアップ・整合性・世代保護・source削除非伝播を検証した。検証完了後、source側のvalidation object/bucketは削除済み。

## 検証結果

|確認項目|結果|
|---|---|
|Storage backup policy|PASS|
|Staging S3互換接続|PASS|
|専用backup資格情報|PASS|
|全Files bucket対象確認|PASS（検証前の実Files bucketは0件）|
|validation bucket/object作成|PASS|
|bucket名/object key保持|PASS|
|外部保存先へのsnapshot作成|PASS|
|snapshot方式|timestamp付きimmutable snapshot|
|source object数 / backup object数|1 / 1|
|source / backup byte一致|PASS|
|source再取得SHA-256|PASS|
|backup再取得SHA-256|PASS|
|同一key上書き保護|PASS|
|backup object削除保護|PASS|
|最低保持期間|35日|
|TLS転送|PASS|
|保存時暗号化|PASS|
|source削除後のbackup残存|PASS|
|source削除後のbackup SHA-256|PASS|
|BA-006 DB復旧ポイント連携|PASS|
|storage backup evidence validator|`STORAGE_BACKUP_EVIDENCE_PASSED` / complete true / findings 0|
|database backup evidence validator|`DATABASE_BACKUP_EVIDENCE_PASSED` / complete true / findings 0|
|Production touched|false|

## 補足

R2等の具体的な保存先サービス名・bucket名・アカウント識別子・Endpoint・Access Key等は、このGitHub証跡へ記録しない。詳細manifestおよび実証跡JSONはGitリポジトリ外の運用証跡領域へ保存する。

実Files bucketが0件だったため、初回実データbackupの代わりに一時validation objectを使用して、実環境でtransfer、checksum、immutable snapshot、retention lock、overwrite/delete protection、source deletion non-propagationを実証した。将来Files bucketが作成された場合も、RB-012の24時間以内のbackup頻度で全bucketを対象とする。

Supabase CLI `db dump` は`auth`・`storage`等のSupabase管理schemaを通常dumpから除外する。したがって、この証跡で確認したBA-006連携はApplication DBとStorage backupの復旧ポイント対応関係を意味し、`storage.buckets` / `storage.objects`をBA-006 SQL dumpから直接復元できることを意味しない。Storage管理metadataの再生成はBA-008でStorage API/S3互換APIを用いて検証する。

BA-007はbackup取得可能性の確認を対象とし、別環境へのStorage復旧可否はBA-008の復旧訓練で確認する。

## 秘密情報管理

GitHub証跡には次を記録していない。

- Supabase Project Ref / Supabase URL
- Access Key / Secret Key
- S3互換Endpoint / アカウント識別子
- 具体的なsource/destination bucket名
- object key / object data
- DB URL / DBパスワード
- JWT / Access Token / Refresh Token
- SHA-256値そのもの
- 個人情報

## 判定

Stagingで専用資格情報によるS3互換Storage接続、一時validation objectの外部backup、bucket/object key保持、timestamp付きimmutable snapshot、SHA-256再取得照合、35日以上のretention lock、overwrite/delete protection、source削除非伝播、BA-006 DB復旧ポイント連携、秘密情報非露出、専用evidence validator PASSまで確認済みのため、BA-007を`verified`とする。
