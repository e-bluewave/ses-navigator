# PROJECT_STATUS.md

# SESN (System Engineer Sales Navigator)

> AIを活用したSES営業支援システム

---

# プロジェクト情報

|項目|内容|
|----|----|
|Version|0.1.0 (MVP)|
|Status|🟢 Migration 001〜119完了／Data API実機・回帰検証完了|
|Repository|ses-navigator|
|優先基盤|Vercel + Supabase|
|更新日時|2026-08-04|

---

# プロジェクト目的

案件・技術者・BP情報を一元管理し、AIが案件と技術者の推薦、情報抽出、メール作成、営業判断支援を行うSES営業支援システムを構築する。

# プロジェクト方針

- MVPを最優先で完成させる
- AIは判断を支援し、正式反映は人が承認する
- GitHubを正本として運用し、確定内容は章単位でコミットする
- 将来改善事項は`docs/13_残課題・改善バックログ.md`で管理する
- 本番スキーマはSupabase CLIマイグレーションからのみ変更する

# 開発体制

|担当|役割|
|----|----|
|ChatGPT|要件定義・設計・レビュー・設計書更新|
|Claude Code|実装・リファクタリング|
|GitHub|設計書・ソースコード管理|

# 現在の進捗

## 完了

- 要件定義ベースライン化
- DB論理設計・ER設計
- 状態遷移設計
- API設計
- 画面設計
- 物理DB設計ヒアリング①〜⑪
- Vercel + Supabase基盤方針
- テナント、認証、組織、権限、RLS方針
- 会社、担当者、技術者、案件、提案、面談、契約、参画の物理構造
- 月次実績、請求、入金、BP支払、締め・訂正方式
- ファイル、コメント、タグ、通知、タスク、監査、ジョブ、AI、Webhook、外部連携の共通構造
- 制約、トランザクション、Outbox、インデックス、公開範囲、バックアップ方針
- `docs/08_テーブル設計.md`
- `docs/13_残課題・改善バックログ.md`
- Decision Log DL-001〜DL-225相当
- Migration 001〜119を欠番なく作成
- テナント、複数組織、ロール、権限、期限付き共有の権限基盤
- 会社・担当者・技術者・案件・提案の所有組織対応
- `app` 102テーブルと`audit` 2テーブルのRLS有効化・強制
- 機能権限、組織階層、担当、割当、共有、親子継承を評価する詳細RLS
- Data API公開状態レビュー、限定View/RPC、権限ハードニングをMigration 113〜119へ実装
- Data API実機検証37/37 PASS、cleanup完了、Migration 118・119回帰確認PASS

## 現在作業中

- Migration 001〜119、docs、supabase構成の最終整合性レビュー
- `ddl-initial`から`Main`へのマージ可否判定
- 冪等Seed
- インデックス・楽観ロック・最終整合性レビュー

# 開発進捗

|項目|進捗|
|----|----:|
|要件定義|100%|
|業務フロー|75%|
|DB設計|100%|
|テーブル設計|100%|
|状態遷移設計|100%|
|API設計|100%|
|画面設計|100%|
|AI設計|40%|
|DDL・Migration|99%|
|実装|0%|

# 今回の主要決定

- 実行基盤をVercel + Supabaseとする
- 認証はSupabase Authを利用し、`auth.users`を認証IDの正本とする
- 全業務テーブルでRLSを有効化する
- 通常ユーザーの認可は機能権限、テナント、組織階層、担当・割当、明示共有を組み合わせる
- UUID v7、全業務`tenant_id`、重要参照の複合外部キーを採用する
- Service Roleは限定処理だけに使用する
- Data APIの`anon`アクセスを禁止し、`authenticated`は必要最小限の表・操作だけを明示GRANTする
- 機密個人情報、原文、契約、財務、AI入出力、監査、Webhookはベーステーブルを直接公開せず、限定View/RPCを利用する
- 主要業務本体は最新値、重要変更は専用履歴、一般操作は追記型監査ログとする
- Transactional Outbox、共通Job、楽観ロックを採用する
- Supabase標準バックアップに加えDB・Storageの外部バックアップを行う
- 性能・規模拡大時の改善は残課題バックログで管理する

# 設計書

```text
README.md
PROJECT_STATUS.md

docs/
├── 00_開発ルール.md
├── 01_プロジェクト概要.md
├── 02_要件定義.md
├── 03_業務フロー.md
├── 04_DB設計.md
├── 05_AI設計.md
├── 05_状態遷移設計.md
├── 06_API設計.md
├── 07_画面設計.md
├── 08_Decision_Log.md
├── 08_Decision_Log_物理DB設計追補.md
├── 08_テーブル設計.md
├── 09_認証設計.md
├── 10_AIプロンプト設計.md
├── 11_テスト設計.md
├── 12_運用設計.md
└── 13_残課題・改善バックログ.md
```

# 次にやること

1. Migration 001〜119、docs、supabase構成の最終レビューを完了する
2. `ddl-initial`を`Main`へマージする
3. RLS・FK判定用インデックスと`row_version`不足を継続確認する
4. 冪等Seedと主要トランザクションテストを追加する

# 更新履歴

## 2026-08-04

- Migration 001〜119の作成・適用を完了
- Migration 118の`app.current_user_id()`安全な`search_path`固定を確認
- Migration 119の`system_admin_update` Policy削除と`authenticated` UPDATE取消を確認
- 限定6 Viewを`public` Exposed schema経由で再検証し、HTTP 200・空配列・6/6 PASSを確認
- Data API実機検証37/37 PASSおよびcleanup完了を記録

## 2026-07-28

- Migration 001〜112の作成・再適用検証を完了
- 複数テナント、組織スコープ、期限付きロール、明示共有の権限基盤へ更新
- 104テーブルのRLS有効化・強制と詳細認可Policyを実装
- Data API公開状態をレビューし、Migration 113のGRANT対象マトリクスを確定

## 2026-07-27

- 優先基盤をVercel + Supabaseへ変更
- 物理DB設計ヒアリング①〜⑪を完了
- `docs/08_テーブル設計.md`を物理DB確定版へ更新
- `docs/08_Decision_Log_物理DB設計追補.md`にDL-203〜DL-225を記録
- `docs/13_残課題・改善バックログ.md`を作成
- 次フェーズをSupabase DDL・Migration作成へ移行

## 2026-07-26

- 状態遷移、API設計、画面設計を完了
- Decision LogをDL-202まで更新

## 2026-07-25

- 要件定義を100%としてベースライン化
- To-Be業務フロー、ER・DB論理設計初版を作成
