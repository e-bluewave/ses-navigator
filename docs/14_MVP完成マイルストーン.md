# 14 MVP完成マイルストーン

## 1. 目的

SES Navigator v0.1.0を「実装済み」ではなく「本番開始判断ができる状態」まで進めるため、残作業を依存関係順に整理する。

## 2. 現在地

2026-08-24時点で、Migration 001〜158、主要業務ドメイン、RLS/Data API境界、主要CRUD/API/UI、認証基盤、Data API統合実環境検証45/45 PASSまで完了している。

一方、本番開始前バックログには環境分離、Secret運用、バックアップ/復旧、監視、保持・削除、ファイル安全性、負荷試験、移行、財務レビュー、長時間処理、公開範囲の最終確認が残っている。

## 3. マイルストーン

| Milestone | 目的 | 主な対象 | 完了条件 |
| --- | --- | --- | --- |
| M0 基盤・主要機能 | MVPの主要画面/API/DBを成立させる | 主要ドメイン、Migration、RLS、CRUD | 完了済み範囲を回帰可能な状態で維持 |
| M1 Security & Secret readiness | 認証・権限・秘密情報の運用境界を確定 | BA-003, BA-005, BA-019 | Auth運用手順、Secret訓練、限定公開面の最終確認が完了 |
| M2 Environment & deployment readiness | 本番と検証環境を混同しない | BA-001, BA-002 | Production/Staging分離、リージョン・接続・Pooler方針確定 |
| M3 Backup & recovery readiness | 障害時に戻せることを確認 | BA-006, BA-007, BA-008, BA-009 | DB/Storageバックアップ、復旧訓練、RPO/RTO確定 |
| M4 Data governance & file safety | 保存・削除・ファイル取扱いを確定 | BA-010, BA-011, BA-012 | 保持期間、完全削除、ウイルス検査/隔離手順確定 |
| M5 Operations & performance readiness | 本番監視と性能上限を把握 | BA-013, BA-014, BA-017 | 監視通知、代表負荷試験、長時間処理移行基準確定 |
| M6 Business readiness | 初期データと財務仕様を本番運用可能にする | BA-015, BA-016 | 移行リハーサル、財務レビュー完了 |
| M7 Release candidate | 全体回帰して本番開始判定 | 全P0 + CI/Smoke/E2E | P0 blocker 0、CI成功、主要Smoke/E2E成功、Runbook確認 |
| M8 MVP release | v0.1.0本番開始 | Production | リリース承認、デプロイ、監視開始、初期運用確認 |

## 4. 推奨実施順

1. BA-005 Secret台帳・初回ローテーション訓練
2. BA-003 Auth運用手順と失効確認
3. BA-019 限定View/RPC公開範囲の最終確認
4. BA-001 Production/Staging分離
5. BA-002 リージョン・接続方式・Pooler
6. BA-006/007/008/009 バックアップ・Storage・復旧・RPO/RTO
7. BA-010/011/012 保持・削除・ファイル安全性
8. BA-013/014/017 監視・負荷・長時間処理
9. BA-015/016 移行・財務業務レビュー
10. 全P0回帰、Release Candidate、本番開始判定

## 5. リリース判定ゲート

MVPリリース前に以下をすべて満たす。

- P0バックログに未解決の本番blockerがない。
- Local/Remote Migrationが一致している。
- GitHub Actions CIが成功している。
- RLS/Data API/Authの実環境回帰が成功している。
- Production/StagingのSecretとSupabase/Vercel環境が分離されている。
- DB/Storageのバックアップ取得と別環境復旧を実証している。
- RPO/RTOと障害時Runbookが確定している。
- 監視・通知の代表アラートを試験している。
- 初期データ移行を再実行可能な形でリハーサルしている。
- 財務・請求の業務ルールを確認している。
- Production Secret、JWT、メール、Project Ref等がGit/ログへ混入していない。

## 6. MVP後

P1（検索精度、外部ワーカー、メール配信、外部連携、AI監視、高度UI等）は、MVP本番開始のblockerにしない。ただし提案メール本運用やAI本番利用など、対象機能を有効化する時点で対応条件を満たす必要がある。
