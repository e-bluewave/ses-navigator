# RB-012 Storage外部バックアップ

## 目的

Supabase Storageに保存された実オブジェクトを、対象Supabase Projectとは独立した外部保存先へ定期退避し、誤削除・Project障害・移行時にも復旧可能な状態を維持する。

## 前提

- Supabase CLI `db dump` はSupabase管理schemaを除外し、`auth`・`storage`等を通常の論理dumpへ含めない。
- したがって、BA-006のroles/schema/data論理バックアップだけで`storage.buckets` / `storage.objects`等のStorage管理metadataを直接復元できるとは考えない。
- Storage object本体とbucket/object inventoryはBA-007で独立管理し、復旧時はBA-008でStorage API/S3互換APIを通じてbucket/objectを再作成してStorage管理metadataを再生成する。
- Supabase StorageはS3互換APIを提供し、一括一覧・取得にはS3互換クライアントを利用できる。
- Supabase StorageのSource側versioningを前提にしない。削除済みオブジェクトをSource側だけで復元できると考えない。
- DB論理バックアップはBA-006、DB・Storage統合復旧訓練はBA-008で管理する。

## 標準方針

### 対象

- SES Navigatorが利用する全Files bucketを対象とする。
- bucket名とobject keyを保持したまま退避する。
- 一時生成物を除外する場合は、除外理由・再生成手順・責任者をRunbook外の運用台帳に記録する。暗黙の除外は禁止する。

### 頻度と保持

- 最大バックアップ間隔: 24時間
- 最低保持期間: 35日
- Source側削除を外部バックアップへ即時伝播しない。
- 外部保存先では、過去世代を誤削除・上書きから保護できるgeneration protectionを必須とする。

### Generation protection

保存先の世代保護方式は、次のいずれかを許可する。

1. `native-versioning`
   - 保存先のネイティブversioningを有効化する。
   - 上書き・削除後も過去versionを保持できることを確認する。

2. `immutable-snapshot`
   - 各backup runを一意のtimestamp付きprefixへ保存し、既存世代を上書きしない。
   - snapshot対象prefixまたはbucket全体に、35日以上の削除・上書き防止retention lockを適用する。
   - lifecycle削除を使う場合、retention lockより短い期間で実データが削除されないことを確認する。

BA-007で重要なのは特定providerのS3 Versioning機能そのものではなく、バックアップ世代が35日以上、Sourceの上書き・削除から独立して保持されることである。

MVP初期実装は`immutable-snapshot`方式を採用する。具体的なprovider名、bucket名、account ID、endpoint、credentialは公開GitHubへ記録せず、運用証跡側で管理する。

### 保存先

保存先は次をすべて満たすこと。

- 対象Supabase Projectとは別の障害ドメインにある。
- Git repositoryではない。
- GitHub Actions Artifactを長期バックアップ保存先にしない。
- 保存時暗号化を有効化する。
- TLSで転送する。
- `native-versioning`または`immutable-snapshot`のどちらかで世代保護する。

## 推奨転送方式

S3互換クライアントを使用し、Sourceの全対象bucketを外部保存先へコピーする。大量オブジェクトでは個別Dashboard downloadよりS3互換クライアントを優先する。

候補:

- `rclone`
- AWS CLI等のS3互換クライアント
- `supabase storage` CLIを使った取得処理

使用ツール自体よりも、全対象objectの列挙、bucket/key保持、再実行性、失敗検知、integrity確認を満たすことを優先する。

## 復旧ポイントの記録

BA-008で復旧ポイントを後追い探索しないため、BA-007実行時点でDB/Storageのjoint recovery pointを確定する。

1. 対応するBA-006 backup runを選択する。
2. BA-006 private manifestの`startedAt`を、保守的なDB復旧ポイントとして取得する。
3. Storage backup開始直前に`startedAt`を記録し、保守的なStorage復旧ポイントとする。
4. 2時刻の絶対差を分で計算し、`recoveryPointSkewMinutesMeasured`として記録する。
5. private manifestに両時刻と対応関係を保存する。
6. 公開Evidenceには実run IDを載せず、link/recorded/jointのbooleanとskew分数だけを記録する。

このRunbookではskewの許容上限を固定しない。差を隠さず実測し、BA-009/RB-014のRPO目標と業務tierに照らして判断する。

## 実行手順

1. 実行対象をStagingまたはProductionとして明示する。
2. 対応するBA-006 backup runと、そのprivate manifest上のDB復旧ポイントを確認する。
3. 対象bucket一覧を取得し、運用台帳の対象一覧と照合する。
4. 専用backup credentialを安全な実行環境へ注入する。
5. backup run IDとtimestamp付きsnapshot prefixを確定する。
6. Storage backup開始直前に`startedAt`を記録する。
7. BA-006 DB復旧ポイントとのskewを分で計算して記録する。
8. Sourceのobject一覧を取得し、manifestを生成する。
9. 外部保存先へ全対象objectをbucket名/object keyを保持してコピーする。
10. Sourceで消えたobjectを既存snapshotから自動削除しない。
11. object数・総bytes・integrity情報を照合する。
12. generation protection、retention lock、暗号化、TLSを確認する。
13. `completedAt`を記録し、DB/Storageのjoint recovery point対応をprivate manifestで確定する。
14. backup run ID、開始/終了日時、対象環境、object数、総bytes、結果、manifest/checksum evidenceの所在だけを運用台帳へ記録する。
15. credential、署名URL、Project Ref、object本文・個人情報をGitHub/PR/chat/logへ記録しない。
16. UTF-8 BOMなしのEvidence JSONを作成してvalidatorへ渡す。

## 整合性確認

最低限、各実行で次を確認する。

- 全対象bucketがmanifestに存在する。
- Source側のobject数と転送対象件数が説明可能である。
- 転送エラーが0件、または全エラーが再実行済みである。
- checksum、ETag、size等、利用可能な手段で転送後integrityを検証する。
- manifest自体をバックアップ本体とは別の検証可能な証跡として保持する。
- `immutable-snapshot`ではtimestamp付きprefixを使用し、同一runの再実行でも既存完了snapshotを上書きしない。
- retention lockにより保存期間中の削除・上書きが拒否されることを確認する。
- 対応するBA-006 DB復旧ポイントがprivate manifestへ記録されている。
- Storage復旧ポイントがprivate manifestへ記録されている。
- DB/Storage復旧ポイントskewが数値で実測されている。
- BA-008が直接参照できるjoint recovery point対応が確定している。

S3互換実装でchecksum方式に制約がある場合は、size + ETag等の代替方式を採用し、その方式を運用台帳へ記録する。

## DB復旧ポイントとの同期

完全復旧ではApplication DBとStorage objectを同一または説明可能な近接復旧ポイントへ戻す必要がある。

- BA-006とBA-007の復旧ポイントを「同一運用日」という曖昧な表現だけで済ませず、両方の時刻をprivate manifestへ記録する。
- Storage backup manifestに対応するDB backup run IDを記録する。
- DB/Storage復旧ポイント差を`recoveryPointSkewMinutesMeasured`として必ず計算する。
- BA-006の通常dumpがStorage管理schemaを含むとはみなさない。
- 復旧時はBA-008で先にApplication DBを復旧し、その後Storage API/S3互換APIでbucket/objectを再作成してStorage管理metadataを生成する。
- bucket固有設定が存在する場合は、Source inventoryまたは運用台帳の設定値を用いて復旧し、暗黙のdefault値への置換を行わない。
- 最後にDB側のApplication状態、Storage inventory、object取得結果をまとめて整合確認する。

## Evidence生成

Evidence JSONはUTF-8 BOMなしで保存する。Windows PowerShellでは必要に応じて`System.Text.UTF8Encoding($false)`を使用する。

Evidence validatorはBOMまたは不正JSONをPASS扱いにせず、構造化されたfindingとして返す。

## Secret管理

- S3 access key / secret key等はBA-005のSecret管理対象とする。
- backup専用credentialを使用し、通常アプリ実行credentialを流用しない。
- Secret値をGit、Issue、PR、chat、ログへ出力しない。
- credentialローテーション後はbackup jobの接続確認を行う。

## 失敗時

- 一部失敗: 失敗objectのみ再実行し、manifestを更新する。
- 認証失敗: credentialの有効性・権限・ローテーション状況を確認する。
- 保存先容量/保持失敗: 新規バックアップを止めず、保存先拡張または別保存先へ切り替える。
- Source誤削除発見時: 外部保存先の既存世代を削除せず、BA-008の復旧手順へ移行する。
- DB/Storage復旧ポイント情報欠落: BA-007完了扱いにせず、対応するBA-006 manifestを確定してskewを再計算する。

## BA-007完了条件

GitHub上のRunbook・policy・CIだけではBA-007を完了扱いにしない。次を実環境で確認して完了とする。

1. 外部保存先が確定している。
2. 保存先暗号化・TLS・35日以上の保持が確認済み。
3. `native-versioning`または`immutable-snapshot`によるgeneration protectionが実環境で確認済み。
4. Stagingの全対象Files bucketで初回外部バックアップが成功している。
5. manifestとintegrity evidenceを保存している。
6. Source削除が外部バックアップへ即時伝播しないことを確認している。
7. BA-006のDBバックアップとの復旧ポイント対応関係を記録している。
8. DB/Storage双方の復旧ポイント時刻とskewを記録している。
9. joint recovery point evidenceが確定している。
10. BOMなしEvidence validatorがPASSしている。

## CI検証

```bash
pnpm security:storage-backup
pnpm security:storage-backup:check
pnpm security:storage-backup-evidence:check
```

CIはpolicy・validator・単体テストを検証し、実Storage objectやcredentialを読み込まない。

## 関連

- BA-005 Secret管理
- BA-006 DB論理バックアップ
- BA-007 Storage外部バックアップ
- BA-008 DB・Storage復旧訓練
- BA-009 RPO・RTO
