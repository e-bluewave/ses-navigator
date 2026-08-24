# RB-012 Storage外部バックアップ

## 目的

Supabase Storageに保存された実オブジェクトを、対象Supabase Projectとは独立した外部保存先へ定期退避し、誤削除・Project障害・移行時にも復旧可能な状態を維持する。

## 前提

- Database backupには`storage.buckets`や`storage.objects`等のメタデータは含まれるが、Storage APIで保存したファイル本体は含まれない。
- Supabase StorageはS3互換APIを提供し、一括一覧・取得にはS3互換クライアントを利用できる。
- Supabase StorageのS3互換機能ではSource側のobject versioningを前提にできない。削除済みオブジェクトをSource側だけで復元できると考えない。
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
- 外部保存先ではversioningを有効化し、上書き・誤削除から過去世代を保護する。

### 保存先

保存先は次をすべて満たすこと。

- 対象Supabase Projectとは別の障害ドメインにある。
- Git repositoryではない。
- GitHub Actions Artifactを長期バックアップ保存先にしない。
- 保存時暗号化を有効化する。
- TLSで転送する。
- versioningを有効化する。

具体的なprovider名、bucket名、account ID、endpoint、credential、secret retrieval URLは公開GitHubへ記録しない。

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
4. Sourceのobject一覧を取得し、manifestを生成する。
5. 外部保存先へ新規・更新objectをコピーする。
6. Sourceで消えたobjectを外部保存先から自動削除しない。
7. object数・総bytes・integrity情報を照合する。
8. backup run ID、開始/終了日時、対象環境、object数、総bytes、結果、manifest/checksum evidenceの所在だけを運用台帳へ記録する。
9. credential、署名URL、Project Ref、object本文・個人情報をGitHub/PR/chat/logへ記録しない。

## 整合性確認

最低限、各実行で次を確認する。

- 全対象bucketがmanifestに存在する。
- Source側のobject数と転送対象件数が説明可能である。
- 転送エラーが0件、または全エラーが再実行済みである。
- checksum、ETag、size等、利用可能な手段で転送後integrityを検証する。
- manifest自体をバックアップ本体とは別の検証可能な証跡として保持する。

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
- Source誤削除発見時: 外部保存先の世代を削除せず、BA-008の復旧手順へ移行する。

## BA-007完了条件

GitHub上のRunbook・policy・CIだけではBA-007を完了扱いにしない。次を実環境で確認して完了とする。

1. 外部保存先が確定している。
2. 保存先versioning・保存時暗号化・35日以上の保持が確認済み。
3. Stagingの全対象Files bucketで初回外部バックアップが成功している。
4. manifestとintegrity evidenceを保存している。
5. Source削除が外部バックアップへ即時伝播しないことを確認している。
6. BA-006のDBバックアップとの対応関係を記録している。

## 関連

- BA-005 Secret管理
- BA-006 DB論理バックアップ
- BA-007 Storage外部バックアップ
- BA-008 DB・Storage復旧訓練
