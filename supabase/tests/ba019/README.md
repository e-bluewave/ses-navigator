# BA-019 実環境適用・回帰確認

Migration 159 `159_sensitive_source_surface_hardening.sql` を実環境へ適用し、機密公開面が意図どおり閉じていることを確認する手順。

## 前提

- GitHub `Main` が正本。
- Migration 159より前のMigrationが実環境へ適用済みであること。
- 秘密値、JWT、DB URL、Project Ref、メールアドレス、個人情報をGitHub・PR・チャットへ記録しないこと。
- `02_setup.sql` / `05_cleanup.sql` はこのBA-019確認では再実行しない。

## 手順

1. ローカルを最新`Main`へ更新する。
2. `supabase/tests/ba019/01_precheck.sql` を対象DBで実行する。
3. `supabase migration list` でLocal/Remote差分を確認する。
4. Migration 159のみが未適用なら、通常の運用手順で `supabase db push` を実行する。
5. 再度 `supabase migration list` を実行し、001〜159がLocal/Remote一致したことを確認する。
6. `supabase/tests/ba019/02_postcheck.sql` を対象DBで実行する。
7. `BA019_POSTCHECK_PASSED` を確認する。
8. 既存の静的回帰を実行する。

```powershell
pnpm security:data-api-sensitive
pnpm security:data-api-sensitive:check
```

9. 必要に応じて既存Data API統合回帰を実行する。検証用認証ユーザーを再利用する場合でも、既存のData API検証手順とcleanup方針を守る。

## 合格条件

- Remote Migrationが159まで一致。
- `public.project_source_summaries` が `security_barrier=true` / `security_invoker=true`。
- `anon` と `service_role` は同Viewを直接SELECT不可、`authenticated`のみ許可。
- `authenticated` は `app.project_sources` のフルSELECT不可。
- 許可列以外の `app.project_sources` 列は `authenticated` から不可視。
- raw source / resume / AI input-output / webhook payload系の保護対象テーブルはclient roleから直接SELECT不可。
- `audit.audit_logs` にclient roleのフルSELECTがない。
- `pnpm security:data-api-sensitive` と単体テストがPASS。

## 証跡

GitHubへ記録してよいのは次の非秘密情報だけ。

- 実施日
- 対象環境名（例: Staging。Project Refは記載しない）
- Remote Migration 159適用確認
- `BA019_POSTCHECK_PASSED`
- 静的回帰PASS
- 必要に応じたData API回帰の件数・PASS/FAIL

上記を満たした後にのみ、BA-019とP0 Release ReadinessのBA-019を`verified`へ更新する。
