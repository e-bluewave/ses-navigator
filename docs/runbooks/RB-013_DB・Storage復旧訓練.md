# RB-013 DB・Storage復旧訓練

## 目的

BA-006のDB論理バックアップとBA-007のStorage外部バックアップから、別環境へ復旧できることを定期的に確認する。

## 原則

- 復旧訓練はProductionへ直接実行しない。
- 専用または破棄可能なStaging/検証環境へ復旧する。
- DBとStorageは同一または説明可能な近接復旧ポイントの組み合わせを使用する。
- Production Secretを復旧先へそのまま再利用しない。
- credential、接続文字列、Project Ref、個人情報、復旧データ本体をGitHub/PR/chat/logへ記録しない。
- 最大訓練間隔は90日とする。
- 主担当と副担当を運用台帳で明示する。

## 事前準備

1. 復旧対象日時を決める。
2. BA-006のroles/schema/dataバックアップとmanifest/checksumを選定する。
3. BA-007のStorage object backupとmanifest/integrity evidenceを選定する。
4. 両バックアップが同じ復旧ポイントとして整合することを確認する。
5. 復旧先がProductionとは別Project/環境であることを確認する。
6. 復旧先専用Secretを安全な保管先から注入する。
7. 開始日時、担当者、対象backup run IDを運用台帳へ記録する。

## DB復旧

標準はSupabase CLIで取得した論理バックアップを`psql`で復旧する。

復旧順序:

1. roles
2. schema
3. data

`psql`は単一transactionかつエラー即時停止で実行する。途中失敗を成功扱いにしない。

概念例:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$TARGET_DB_URL"
```

実際の接続文字列やpasswordは表示・保存しない。

## Storage復旧

1. DB側のbucket/object metadataを確認する。
2. BA-007の外部Storage backupから対象bucket/objectを復旧先へコピーする。
3. bucket名とobject keyを維持する。
4. object数、総bytes、manifest、checksum/ETag/size等でintegrityを確認する。
5. DB metadataに存在するが実objectがないもの、実objectはあるがmetadataにないものを不整合として記録する。

## 復旧後検証

最低限、次を確認する。

- schema/migration整合
- 主要業務テーブルの件数または代表データ
- AuthログインSmoke
- 案件等の主要Application Smoke
- Data API Security回帰
- Storage全対象bucketのobject inventory
- 代表ファイルの取得
- RLS/権限境界
- SecretがProduction値へ向いていないこと

## 成功条件

次をすべて満たした時だけ訓練成功とする。

1. DB復旧がエラーなく完了。
2. Storage復旧が完了。
3. DBとStorageの復旧ポイントが整合。
4. Application/Auth SmokeがPASS。
5. Data API Security回帰がPASS。
6. Storage inventory/integrity確認がPASS。
7. 実所要時間を記録。
8. 残課題がある場合、Ownerと期限を付けて記録。

## 証跡

公開GitHubへ実データやSecretを保存しない。運用台帳には次の非Secret情報のみ残す。

- drill run ID
- 実施日時
- 復旧先環境種別
- DB backup run ID
- Storage backup run ID
- 復旧ポイント日時
- 開始/終了時刻・所要時間
- 各検証のPASS/FAIL
- 障害・再実行内容
- 主担当・副担当
- follow-up ID

## 失敗時

- DB restore failure: transactionを失敗扱いにし、原因解消後に新しい復旧先または初期化済み環境で再実行する。
- Storage mismatch: objectを削除して帳尻を合わせず、manifest差分を特定する。
- Security regression failure: 復旧成功扱いにしない。
- 所要時間超過: BA-009のRTO策定へ実績値として反映する。
- 復旧ポイント差による欠損: BA-006/BA-007の取得タイミングや運用を改善する。

## 定期訓練

- 最大90日ごとに1回。
- Production開始前に少なくとも1回、Staging相当の別環境で実施する。
- Production開始後は四半期ごとを標準とする。
- 大規模Migration、バックアップ方式変更、Storage移行後は定期周期を待たず追加訓練を行う。

## BA-008完了条件

GitHub上のRunbook・policy・CIだけでは完了扱いにしない。次を実環境で確認して完了とする。

1. 主担当・副担当が確定。
2. 別環境へのDB復旧が成功。
3. Storage復旧が成功。
4. Application/Auth/Data API Security/Storage検証がPASS。
5. 復旧所要時間と復旧ポイント損失量を記録。
6. BA-009のRPO/RTO策定に実測値を引き渡す。

## 関連

- BA-005 Secret管理
- BA-006 DB論理バックアップ
- BA-007 Storage外部バックアップ
- BA-008 DB・Storage復旧訓練
- BA-009 RPO・RTO
