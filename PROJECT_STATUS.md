# PROJECT_STATUS.md

# SESN (System Engineer Sales Navigator)

> AIを活用したSES営業支援システム

---

# プロジェクト情報

| 項目       | 内容                                                         |
| ---------- | ------------------------------------------------------------ |
| Version    | 0.1.0 (MVP)                                                  |
| Status     | 🟢 DB基盤・主要設計書初版完了／フロントエンド・API基盤実装中 |
| Repository | ses-navigator                                                |
| 優先基盤   | Vercel + Supabase                                            |
| 更新日時   | 2026-08-09                                                   |

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

| 担当        | 役割                                 |
| ----------- | ------------------------------------ |
| ChatGPT     | 要件定義・設計・レビュー・設計書更新 |
| Claude Code | 実装・リファクタリング               |
| GitHub      | 設計書・ソースコード管理             |

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
- Migration 001〜122を欠番なく作成・リモートDBへ適用
- テナント、複数組織、ロール、権限、期限付き共有の権限基盤
- 会社・担当者・技術者・案件・提案の所有組織対応
- `app` 102テーブルと`audit` 2テーブルのRLS有効化・強制
- 機能権限、組織階層、担当、割当、共有、親子継承を評価する詳細RLS
- Data API公開状態レビュー、限定View/RPC、権限ハードニングをMigration 113〜119へ実装
- Data API実機検証37/37 PASS、cleanup完了、Migration 118・119回帰確認PASS
- Migration 120でRLS・FK判定用インデックスを追加
- Migration 121で`private.redact_sensitive_jsonb(jsonb)`のvolatilityを`stable`へ修正
- Migration 122で58実テーブルへ`row_version`と自動加算Triggerを追加
- Supabase DB Lint：`No schema errors found`
- Local／Remote Migration 001〜122完全一致
- pnpm workspace、React + Vite、Fastify、品質チェック、CIの基盤
- 案件一覧・案件詳細のOpenAPI契約、認証・認可境界、参照API
- OpenAPI連動の型付きAPIクライアントと生成差分CIチェック
- 案件一覧・案件詳細画面（読込・空・エラー状態、一覧から詳細への遷移）
- Supabase Authログイン、セッション保持・更新、ログアウト、未認証ガード
- 認証済みAccess TokenのAPIクライアント連携
- Auth・案件参照の実環境結合スモークテストと実行手順
- 管理者判定API、TOTP登録・検証、AAL2必須ガードによる管理者MFAフロー
- パスワード再設定メール、回復・招待リンク受諾、新パスワード設定フロー
- 案件一覧の管理番号・案件名検索、案件状態・募集状態絞り込み、カーソルページング
- 案件登録・編集、権限制御、楽観ロック
- 案件の論理削除、削除理由、監査ログの原子的記録、監査履歴導線

## 現在作業中

- Supabase Authの実環境結合確認（実行待ち）

# 開発進捗

| 項目           | 進捗 |
| -------------- | ---: |
| 要件定義       | 100% |
| 業務フロー     |  75% |
| DB設計         | 100% |
| テーブル設計   | 100% |
| 状態遷移設計   | 100% |
| API設計        | 100% |
| 画面設計       | 100% |
| AI設計         | 100% |
| 認証設計       | 100% |
| DDL・Migration | 100% |
| 実装           |  10% |

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

# 構成レビュー結果

- Migration 001〜122：欠番なし、3桁連番のため辞書順と適用順が一致
- `supabase/tests/data_api/`：検証SQL、PowerShell、手順書、レポートを配置済み
- `ddl-initial`：Migration 001〜119を`Main`へマージ済み
- `supabase/config.toml`：作成・`Main`反映済み
- `supabase/seed.sql`：冪等Seedを作成・`Main`反映済み
- `docs/05_AI設計.md`：初版作成済み
- `docs/10_AIプロンプト設計.md`：初版作成済み
- `docs/09_認証設計.md`：初版作成済み
- `docs/11_テスト設計.md`：初版作成済み
- `docs/12_運用設計.md`：初版作成済み
- 未作成の主要設計文書：なし

# 次にやること

1. 検証環境の値を設定し、Auth・案件参照の実環境スモークテストを実行する
2. 会社一覧・詳細の参照スライスを実装する

# 更新履歴

## 2026-08-09

- PR #23を`Main`へマージし、案件登録・編集フローを完了
- Migration 123で案件の論理削除と監査記録を原子的に行う限定RPCを追加
- 案件削除理由、楽観ロック、監査履歴API・画面導線を実装
- PR #22を`Main`へマージし、案件一覧の検索・絞り込み・ページングを完了
- 案件登録・編集フローを実装
- PR #21を`Main`へマージし、パスワード再設定・招待受諾フローを完了
- 案件一覧の検索・絞り込みとカーソルページングを実装
- PR #20を`Main`へマージし、管理者MFAフローを完了
- パスワード再設定メール、回復・招待リンク受諾、新パスワード設定画面を実装
- PR #19を`Main`へマージし、Auth・案件参照の結合スモークテストを完了
- DB上のシステム管理者・管理権限を正本とするMFA必須判定APIを追加
- Supabase TOTP Factorの登録、チャレンジ、検証とAAL2業務画面ガードを実装
- PR #18を`Main`へマージし、Supabase Authログイン・セッション管理を完了
- Authログイン、Bearer Token転送、案件一覧、ログアウトを確認するスモークテストを追加
- Secretを保存しない実環境結合確認手順を追加
- PR #17を`Main`へマージし、Issue #15を完了
- Supabase Authのメール・パスワードログイン画面を実装
- セッション永続化、期限前Refresh Token更新、ログアウトを実装
- 未認証ガード、認証状態ローディング、期限切れ・認証エラー表示を実装
- 認証済みAccess Tokenを案件APIのBearer Tokenへ連携
- Auth・画面テストを追加

## 2026-08-08

- `row_version`適用範囲を更新主体、条件付き更新、追記専用、集合・関連へ分類
- フロントエンド・APIの初期構成をReact、Fastify、SupabaseのTypeScriptモノレポとして確定
- PR #11を`Main`へマージ
- Migration 120のRLS・FK判定用インデックス追加を完了
- Migration 121で`private.redact_sensitive_jsonb(jsonb)`のvolatilityを`stable`へ修正
- ローカルSupabase環境のPostgreSQLメジャーバージョンを17へ更新
- Migration 001〜121のリモートDB適用とLocal／Remote一致を確認
- Migration 122のリモートDB適用、58実テーブルのTrigger設定、自動加算動作を確認
- 案件参照スライス用のIssue #15と作業ブランチを作成
- pnpm workspace、React + Vite、Fastify、Vitest、ESLint、Prettier、CIの基盤実装を開始
- Supabase DB Lintで`No schema errors found`を確認
- DDL・Migrationフェーズを100%完了として更新
- 案件一覧・案件詳細のOpenAPI契約、Bearer認証・RLS連携APIを実装
- OpenAPI連動の型付きAPIクライアントと生成差分チェックを実装
- 案件一覧・案件詳細画面、一覧から詳細への遷移、読込・空・エラー表示を実装

## 2026-08-04

- 最終整合性レビューで複合外部キーの子列インデックス不足を確認し、Migration 120を追加
- `ddl-initial`、Supabase CLI設定、冪等Seedを`Main`へ反映
- `docs/05_AI設計.md`初版を作成
- `docs/10_AIプロンプト設計.md`初版を作成
- `docs/09_認証設計.md`初版を作成
- `docs/11_テスト設計.md`初版を作成
- `docs/12_運用設計.md`初版を作成
- 監視、障害対応、変更管理、バックアップ・復旧、権限・Secret・AI運用、本番公開基準を確定
- テストレベル、RLS・権限、AI評価、CI/CD、リリース判定基準を確定
- Supabase Auth、招待制、管理者MFA、セッション、停止・退職、監査の認証方針を確定
- AIの入力、構造化、マッチング、生成、承認、監査、品質、障害対応を確定
- AIプロンプトの用途別入出力、構造化出力、Injection対策、版管理、評価・公開手順を確定
- 完全自動登録・自動送信・Embedding類似検索をMVP外として整理
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
