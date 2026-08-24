# RB-014 RPO・RTO管理

## 目的

SES Navigatorの主要業務領域について、許容可能なデータ損失幅（RPO）とサービス復旧時間（RTO）を定義し、BA-006〜008のバックアップ・復旧実測値と照合して本番運用可否を判断できる状態にする。

## 定義

- RPO: 障害発生時に許容できるデータ損失時間。
- RTO: 障害発生から業務利用再開までに許容できる時間。
- 目標値は設計上の希望値ではなく、BA-008復旧訓練の実測値で達成可能性を確認する。

## サービステier

|Tier|RPO|RTO|対象例|
|---|---:|---:|---|
|Tier 1|60分|240分|契約、請求、入金、Auth・Membership|
|Tier 2|240分|480分|案件・応募、技術者・経歴書、会社・担当者|
|Tier 3|1440分|1440分|監査・AI実行履歴等|

### Tier 1

金銭・契約・アクセス制御など、欠損または長時間停止が重大な業務影響につながる領域。Production開始前にBA-008の実測RPO/RTOが目標内であることを確認する。

### Tier 2

営業活動・人材管理の中核データ。短時間の停止や数時間の復旧ポイント差は手動再入力・再同期で補完可能であることを業務側で確認する。

### Tier 3

履歴・分析・監査補助等。24時間以内の復旧を基本とし、法令・監査要件がより厳しい場合はTierを引き上げる。

## 対象領域

- contracts: Tier 1
- invoices: Tier 1
- payments: Tier 1
- auth-and-membership: Tier 1
- projects-and-applications: Tier 2
- engineers-and-resumes: Tier 2
- companies-and-contacts: Tier 2
- audit-and-ai-execution: Tier 3

Tier 1領域のTier引下げは禁止する。変更する場合は、業務責任者・技術責任者の承認、影響評価、期限付き例外または正式なpolicy改訂を必要とする。

## 実測値との照合

BA-008の復旧訓練で次を記録する。

1. 障害想定時刻
2. 使用したDB backup run ID
3. 使用したStorage backup run ID
4. 復旧ポイント時刻
5. 実RPO
6. 復旧開始時刻
7. 業務利用可能判定時刻
8. 実RTO
9. Auth/Application/Data API/Storage検証結果
10. 主担当・副担当

GitHubにはSecret、Project Ref、DB URL、Storage credential、個人情報、復旧した実データを記録しない。

## Production判定

Production開始・継続条件として以下を満たす。

- Tier 1の実RPOが60分以内。
- Tier 1の実RTOが240分以内。
- Tier 2の実RPOが240分以内。
- Tier 2の実RTOが480分以内。
- Tier 3の実RPO/RTOが1440分以内。
- BA-006 DB backup、BA-007 Storage backup、BA-008復旧訓練が有効である。
- 実測値が目標を超えた場合、Productionリリースを停止するか、期限付き例外を承認する。

## 目標未達時

### RPO超過

- backup頻度を短縮する。
- DBとStorageの取得時刻差を縮める。
- 必要に応じてPITR等、より短い復旧ポイントを実現する方式を評価する。
- 手動再入力可能な業務データを特定する。

### RTO超過

- restore手順の自動化を進める。
- backup artifactの検証・取得時間を短縮する。
- 復旧先環境の事前準備を改善する。
- Auth、Storage、Data API検証の並列化可否を評価する。

## レビュー

- 最低年1回、RPO/RTOをレビューする。
- 契約・請求・決済方式、バックアップ方式、インフラ構成、データ量が大きく変化した場合は随時再評価する。
- 業務責任者と技術責任者の双方を指定する。
- 例外は理由、承認者、有効期限、是正計画を運用台帳へ残す。

## BA-009完了条件

GitHub上のRunbook・policy・CIだけではBA-009を完了扱いにしない。次をすべて満たした時点で完了とする。

1. 全対象領域のTier/RPO/RTOが業務レビュー済み。
2. 業務責任者・技術責任者が確定している。
3. BA-008の別環境復旧訓練で実RPO/RTOを測定している。
4. 実測値が各Tier目標内である、または期限付き例外が承認されている。
5. Production開始判定にRPO/RTO確認が組み込まれている。

## 関連

- BA-006 DB論理バックアップ
- BA-007 Storage外部バックアップ
- BA-008 DB・Storage復旧訓練
- BA-009 RPO・RTO具体値
