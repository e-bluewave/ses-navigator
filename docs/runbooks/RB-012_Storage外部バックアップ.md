# RB-012 Storage外部バックアップ

## 目的

Supabase Storageに保存された実オブジェクトを、対象Supabase Projectとは独立した外部保存先へ定期退避し、誤削除・Project障害・移行時にも復旧可能な状態を維持する。

## 前提

- Database backupには`storage.buckets`や`storage.objects`等のメタデータは含まれるが、Storage APIで保存したファイル本体は含まれない。
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

## 実行手順

1. 実行対象をStagingまたはProductionとして明示する。
2. 対象bucket一覧を取得し、運用台帳の対象一覧と照合する。
3. 専用backup credentialを安全な実行環境へ注入する。
4. backup run IDとtimestamp付きsnapshot prefixを確定する。
5. Sourceのobject一覧を取得し、manifestを生成する。
6. 外部保存先へ全対象objectをbucket名/object keyを保持してコピーする。
7. Sourceで消えたobjectを既存snapshotから自動削除しない。
8. object数・総bytes・integrity情報を照合する。
9. generation protection、retention lock、暗号化、TLSを確認する。
10. backup run ID、開始/終了日時、対象環境、object数、総bytes、結果、manifest/checksum evidenceの所在だけを運用台帳へ記録する。
11. credential、署名URL、Project Ref、object本文・個人情報をGitHub/PR/chat/logへ記録しない。

## 整合性確認

最低限、各実行で次を確認する。

- 全対象bucketがmanifestに存在する。
- Source側のobject数と転送対象件数が説明可能である。
- 転送エラーが0件、または全エラーが再実行済みである。
- checksum、ETag、size等、利用可能な手段で転送後integrityを検証する。
- manifest自体をバックアップ本体とは別の検証可能な証跡として保持する。
- `immutable-snapshot`ではtimestamp付きprefixを使用し、同一runの再実行でも既存完了snapshotを上書きしない。
- retention lockにより保存期間中の削除・上書きが拒否されることを確認する。

S3互換実装でchecksum方式に制約がある場合は、size + ETag等の代替方式を採用し、その方式を運用台帳へ記録する。

## DBメタデータとの同期

完全復旧にはStorage object本体だけでなく、`storage.buckets` / `storage.objects`等のDBメタデータも必要になる。

- BA-006のDBバックアップと同一運用日・近接時刻で取得する。
- Storage backup manifestに対応するDB backup run IDを記録する。
- 復旧時はBA-008の手順に従い、DB metadataとobject本体の双方を検証する。

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

## BA-007完了条件

GitHub上のRunbook・policy・CIだけではBA-007を完了扱いにしない。次を実環境で確認して完了とする。

1. 外部保存先が確定している。
2. 保存先暗号化・TLS・35日以上の保持が確認済み。
3. `native-versioning`または`immutable-snapshot`によるgeneration protectionが実環境で確認済み。
4. Stagingの全対象Files bucketで初回外部バックアップが成功している。
5. manifestとintegrity evidenceを保存している。
6. Source削除が外部バックアップへ即時伝播しないことを確認している。
7. BA-006のDBバックアップとの対応関係を記録している。

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
