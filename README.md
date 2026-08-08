# SESN

**System Engineer Sales Navigator**

SES営業向けAI営業支援システム

---

## プロジェクト概要

SES営業における案件・技術者・BP情報を一元管理し、AIを活用して営業活動を効率化するシステムです。

営業担当者の作業時間を削減し、マッチング精度と提案品質の向上を目的としています。

最終目標は、AIが案件と技術者を自動推薦し、営業担当者の意思決定を支援することです。

---

## 開発方針

- MVPを最優先で開発する
- 実際の営業業務で利用しながら改善する
- AIファーストで設計する
- 保守しやすい構成を採用する
- 設計書はGitHubで管理する

---

## 技術スタック

- Frontend: React / TypeScript
- Backend: Node.js
- Database: PostgreSQL
- AI: OpenAI / Claude
- Development: Claude Code / ChatGPT
- Version Control: GitHub

---

## 現在の開発状況

- 要件定義・主要設計書の初版完了
- DB設計・DDL／Migration 001〜122完了
- SupabaseリモートDB適用、Migration一致、DB Lint確認済み
- `row_version`適用分類とフロントエンド・API初期構成を確定
- 案件参照スライスのTypeScriptモノレポ・Web・API基盤を実装中

詳細は PROJECT_STATUS.md を参照してください。

---

## Documents

設計書は docs フォルダで管理します。
