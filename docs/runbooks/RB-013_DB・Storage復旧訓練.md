# RB-013 DB・Storage復旧訓練

## 目的

BA-006のDB論理バックアップとBA-007のStorage外部バックアップから、Productionとは分離された環境へ安全に復旧できることを定期的に確認する。復旧可否だけでなく、RPO/RTO、権限境界、Storage整合性、false PASS防止まで実測・検証する。

## 原則

- 復旧訓練はProductionへ直接実行しない。
- 専用または破棄可能なStaging/検証環境へ復旧する。
- 実行前に復旧先の識別子を確認し、Productionではないことを安全ゲートで確定する。
- DBとStorageは同一または説明可能な近接復旧ポイントの組み合わせを使用する。
- Production Secretを復旧先へそのまま再利用しない。
- credential、接続文字列、Project Ref、個人情報、復旧データ本体をGitHub/PR/chat/logへ記録しない。
- 最大訓練間隔は90日とする。
- 主担当と副担当を運用台帳で明示する。氏名は公開Evidence JSONへ含めない。
- Supabase CLI `db dump` は`auth`・`storage`等のSupabase管理schemaを通常dumpから除外するため、Storage管理metadataの復旧をBA-006 dumpへ依存しない。
- `storage` schema、`storage.buckets`、`storage.objects`をSQLで復旧対象にしない。Storage復旧はStorage API/S3互換APIを使用する。
- `storage.protect_delete`等の安全機構を復旧のために無効化しない。
- Evidence JSON/SQL/manifestはstrict UTF-8を使用し、Evidence JSONはUTF-8 BOMなしで保存する。
- CLI成否はprocess exit codeを主判定とする。stderrが存在するだけで失敗扱いにせず、exit code 0でも期待したPASS markerと検証値を確認する。
- 対話PowerShellの複数手順は原則`& { ... }`の1ブロックで実行し、途中`throw`後に後続のPASS出力が継続しないようにする。
- PASS証跡は全検証が完了した後だけ生成し、無条件のPASS出力を禁止する。

## 事前準備

1. 復旧対象日時を決める。
2. BA-006のroles/schema/dataバックアップとmanifest/checksumを選定する。
3. BA-007のStorage object backupとmanifest/integrity evidenceを選定する。
4. 両バックアップが同じ復旧ポイントとして整合することを確認する。
5. 復旧先がProductionとは別Project/環境であることを識別子と環境情報から確認する。
6. 復旧先専用Secretを安全な保管先から注入する。
7. 開始日時、担当者、対象backup run IDを運用台帳へ記録する。
8. roles.sqlを確認し、Supabase管理reserved roleとApplication custom roleを分類する。custom roleが0件なら、reserved roleは復旧先native状態を維持し、roles replayを意図的skipとして記録する。
9. schema/data SQLがstrict UTF-8であることを確認する。コンテナへコピーする場合はlocal/containerのSHA-256一致も確認する。
10. 復旧先のdefault ACLを確認し、schema restore前に不要なdefault grantを正規化する。新規objectへ意図しないACLを継承させない。
11. BA-006 dumpへ`storage`管理schemaが混入していないことを確認する。混入している場合はそのままrestoreしない。
12. migration基準を記録する。migration ledgerがbackupに存在する場合はそのheadを使い、存在しない場合はbackup schemaと復旧DBのsemantic parityを使うことを事前に決める。

## DB復旧

標準はSupabase CLIで取得した論理バックアップを`psql`で復旧する。

復旧順序:

1. custom roles（存在する場合のみ）
2. schema
3. data

`psql`は単一transactionかつエラー即時停止で実行する。途中失敗を成功扱いにしない。

概念例:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file schema.sql \
  --file data.sql \
  --dbname "$TARGET_DB_URL"
```

custom rolesがある場合のみ、同一安全条件でroles.sql相当を適用する。Supabase管理reserved roleのDDLは復旧先へreplayしない。

実際の接続文字列やpasswordは表示・保存しない。

Supabaseの新規Projectへ復旧する場合は、対象Projectに既に存在するSupabase管理schema/roleを直接上書きしない。BA-006 dumpに含まれるApplication schema/dataとcustom roleを復旧対象とし、Supabase管理schema/roleは復旧先Projectが管理する状態を維持する。

### DB復旧後の必須確認

- `psql` process exit codeが0である。
- `ON_ERROR_STOP`とsingle transactionを使用した証跡がある。
- Application schema/table集合がbackup基準と一致する。
- protected view/RLS/RPCのACLが期待値と一致する。
- default ACL由来の不要grantが復旧objectへ付与されていない。
- migration ledgerがbackupに存在しない場合、現在のMain migration数と直接比較して誤判定しない。backup時点schemaと復旧DBのsemantic parityで確認する。
- soft delete対象に`deleted_at`等のtombstoneがある場合、backupと復旧後の件数を照合する。backup側0件でも「0 = 0」の一致を記録する。

## Storage復旧

Storage復旧は、`storage` schemaのSQL restoreではなくStorage API/S3互換APIを標準とする。

1. BA-007 manifestから復旧対象bucket/object inventoryを取得する。
2. 復旧先のStorage APIでbucket一覧を取得し、対象bucketの有無を確認する。存在確認を「個別GETが404になるはず」といったHTTP statusの推測へ依存しない。
3. 復旧先に対象bucketをStorage API/S3互換APIで作成する。
4. bucket固有設定が記録されている場合は、その設定を復旧する。暗黙にdefaultへ置き換えない。
5. BA-007の外部Storage backupから対象objectを復旧先へコピーする。
6. bucket名とobject keyを維持する。
7. Storage APIを通じてobjectを作成し、復旧先のStorage管理metadataを再生成する。
8. object数、総bytes、manifest、SHA-256/checksum/ETag/size等でintegrityを確認する。
9. 復旧後のStorage inventoryとmanifestを照合し、欠損・余剰objectを不整合として記録する。
10. SQL restore等によりghost metadataが存在した場合、Productionではないこと・対象bucket/objectが検証用であることを安全ゲートで確認した上で、Storage APIだけを用いてcleanupする。`storage` tableを直接DELETEしない。
11. cleanupのために`storage.protect_delete`等を無効化しない。

BA-007でbusiness object inventoryが0件の場合、validation objectでtransfer/integrity経路を検証してよい。ただしEvidenceには「business file restoreを実証した」と記録しない。

## 復旧後検証

最低限、次を確認する。

- schema/migration整合
- migration ledgerまたはbackup schema semantic parity
- soft-delete/tombstone parity
- 主要業務テーブルの件数または代表データ
- AuthログインSmoke
- 案件等の主要Application Smoke
- Data API Security回帰
- Storage全対象bucketのobject inventory
- 代表ファイルの取得
- RLS/権限境界
- SecretがProduction値へ向いていないこと

Auth SmokeはAuth利用可否と認証境界の確認を目的とし、BA-006論理dumpが`auth.users`等のSupabase管理Auth dataを復元することを成功条件にはしない。必要な検証ユーザーは復旧先専用として作成する。

Application Smokeの前に依存関係が利用可能であることを確認する。`node_modules`や`tsc`等が欠けている場合は、lockfileを維持して`pnpm install --frozen-lockfile`等で復旧し、tracked fileを変更していないことを確認してからbuild/smokeを実行する。

## RPO/RTO計測

BA-009へ渡す実測値を同じ訓練で取得する。

- 復旧ポイントはDB/Storageのうち保守的に古い時点をjoint recovery pointとして採用する。
- `recoveryPointAgeMinutesMeasured`は、想定障害/訓練開始時刻とjoint recovery pointの差を測る。
- RTOは訓練開始から「業務利用可能」と判定できた時刻までを測る。後続cleanup完了時刻まで不必要に延長しない。
- 業務利用可能判定には、少なくともDB/Storage整合、Auth、Application Smoke、Data API/RLS、代表Storage readが必要である。
- 実測値がBA-009目標を超えた場合も値を短縮・補正せず、実測値のままEvidenceへ記録しfollow-upを作成する。

## 成功条件

次をすべて満たした時だけ訓練成功とする。

1. 復旧先安全ゲートがPASS。
2. DB復旧がエラーなく完了。
3. Supabase管理role/schemaを不正に上書きしていない。
4. Storage復旧がStorage API/S3互換API経由で完了。
5. DBとStorageの復旧ポイントが整合。
6. Application/Auth SmokeがPASS。
7. Data API Security/RLS回帰がPASS。
8. Storage inventory/integrity確認がPASS。
9. migration/tombstone parityがPASS。
10. 実所要時間、RPO、RTOを記録。
11. 残課題がある場合、Ownerと期限を付けて記録。
12. secret-free Evidence validatorがPASS。

## Evidence生成ルール

公開GitHubへ実データやSecretを保存しない。運用台帳には次の非Secret情報のみ残す。

- drill run ID
- 実施日時
- 復旧先環境種別
- DB backup run ID
- Storage backup run ID
- 復旧ポイント日時
- 開始/終了時刻・所要時間
- RPO/RTO実測値
- 各検証のPASS/FAIL
- 障害・再実行内容
- 主担当・副担当
- follow-up ID

主担当・副担当の氏名、実backup run ID等はprivate運用台帳へ保存し、public Evidence JSONではboolean linkageやsecret-free summaryへ置き換える。

Evidence JSONはUTF-8 BOMなしで保存する。Windows PowerShell 5.1では`Set-Content -Encoding UTF8`がBOMを付与するため、必要に応じて`.NET`の`UTF8Encoding($false)`等を使用する。

Evidence validatorはBOMやmalformed JSONをstructured findingとして失敗させる。validatorのexit code 0と`RESTORE_DRILL_EVIDENCE_PASSED`の両方を確認する。

## false PASS防止

- 対話PowerShellは`& { $ErrorActionPreference = 'Stop'; ... }`のように1ブロックで実行する。
- `throw`やnon-zero exit後に後続のPASS evidence生成が継続しない構造にする。
- cleanup、restore、validator等のPASSは実コマンドのexit codeと独立確認結果の双方が成立した後だけ出力する。
- 「探索スクリプトが正常終了したPASS」と「対象検証がPASS」を混同しない。
- 失敗したEvidenceは`INVALID`扱いにし、後続の探索・集計対象から除外する。

## 失敗時

- DB restore failure: transactionを失敗扱いにし、原因解消後に新しい復旧先または初期化済み環境で再実行する。
- reserved role conflict: reserved roleをreplayせず、custom role集合を再分類する。
- protected view ACL mismatch: 復旧先default ACLを確認・正規化してから再構築する。
- Storage mismatch: objectを削除して帳尻を合わせず、manifest差分を特定する。
- Storage ghost metadata: Storage API経由でcleanupし、SQL直DELETEやprotect_delete無効化を行わない。
- Security regression failure: 復旧成功扱いにしない。
- Application build failure: dependency欠落かcode defectかを切り分け、dependency復旧後に再実行する。
- validator BOM failure: JSON内容を変更せずUTF-8 BOMなしへ正規化し、再validatorする。
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
4. Application/Auth/Data API Security/RLS/Storage検証がPASS。
5. migration/tombstone parityがPASS。
6. 復旧所要時間と復旧ポイント損失量を記録。
7. secret-free Evidence validatorがPASS。
8. BA-009のRPO/RTO策定に実測値を引き渡す。

## BA-008 2026-09訓練からの恒久化事項

2026-09のBA-008で確認した次の事象を再発防止ルールとして本Runbookへ反映する。

- Supabase管理reserved roleは復旧先native状態を維持し、custom roleが0件ならrole replayを意図的skipする。
- schema restore前にdefault ACLを正規化する。
- SQL/JSON encodingをstrict UTF-8で確認し、Evidence JSONはBOMなしとする。
- Storage metadataをSQLで復旧せず、Storage API/S3互換APIで再生成する。
- ghost Storage metadataをSQL直操作せずStorage APIでcleanupする。
- bucket不存在判定を個別GETの固定status codeへ依存しない。
- migration ledgerがbackupに無い場合はbackup schema semantic parityで検証する。
- Application Smoke前にdependency readinessを確認する。
- 対話PowerShellをatomic block化し、false PASS evidence生成を防止する。
- RPO/RTOは実測値をそのままBA-009へ渡し、目標超過をfollow-up対象とする。

## 関連

- BA-005 Secret管理
- BA-006 DB論理バックアップ
- BA-007 Storage外部バックアップ
- BA-008 DB・Storage復旧訓練
- BA-009 RPO・RTO
