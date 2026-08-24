# RB-007 Secretローテーション訓練

## 1. 目的

RB-006の手順をProduction Secretに触れずに検証し、Secretの棚卸し、新Secret反映、Smoke test、旧Secret失効、旧Secret拒否確認、証跡記録を一巡できることを確認する。

## 2. 初回訓練の対象

- Productionは使用しない。
- Staging、Preview、Local、または専用の低影響Secretを使用する。
- Supabase Secret key、Legacy service_role、JWT signing key、DB passwordを混同しない。
- 実際のSecret値、JWT、メールアドレス、Project Ref、直接取得URLはGitHub・Issue・PR・チャット・実行ログへ保存しない。

## 3. 事前準備

1. `docs/runbooks/SECRET_INVENTORY_TEMPLATE.md`をアクセス制御された運用管理場所へ複製する。
2. Secret値を含めず、対象環境のメタデータを記入する。
3. JSONで管理する場合は次の形にし、リポジトリ外へ保存する。

```json
{
  "secrets": [
    {
      "secretId": "example-staging-secret",
      "provider": "Provider名",
      "purpose": "用途",
      "environment": "Staging",
      "storage": "Secret管理サービス名",
      "owner": "役割名",
      "components": ["API"],
      "issuedAt": "YYYY-MM-DD",
      "updatedAt": "YYYY-MM-DD",
      "status": "active",
      "nextReviewAt": "YYYY-MM-DD",
      "revocationCondition": "漏えい疑い、用途終了等"
    }
  ]
}
```

4. 台帳JSONを検査する。

```text
pnpm security:secret-inventory -- "C:\path\outside-repository\secret-inventory.json"
```

成功条件は`SECRET_INVENTORY_PASSED`。検査結果には秘密値そのものを出力しない。

## 4. 訓練手順

1. 対象Secret ID、Provider、環境、利用コンポーネントを確認する。
2. 対象がProductionではないことを再確認する。
3. Providerで新しい低影響Secretを発行する。
4. 対象環境のSecret管理場所だけを更新する。
5. 必要なコンポーネントだけを再デプロイする。
6. 対象機能のSmoke testを実行する。
7. 認証失敗、5xx、Webhook署名失敗、Job滞留などの異常がないことを確認する。
8. 旧Secretを失効する。
9. 旧Secretでのアクセスが拒否されることを確認する。
10. 新Secretで主要機能が引き続き成功することを確認する。
11. 実台帳の状態・最終更新日・次回確認日を更新する。
12. 秘密値を含まない訓練証跡を記録する。

## 5. 推奨Smoke test

対象に応じて必要なものだけ実行する。

```text
pnpm security:client-secrets
pnpm security:supabase-config
pnpm security:data-api:all
pnpm smoke:auth-project
```

Production以外でも書込みを伴う検証は対象データと影響範囲を確認してから実行する。

## 6. 証跡

```text
Drill ID:
Secret ID:
Environment:
Provider:
Started at:
Completed at:
Executor:
Approver:
Inventory validation: PASS/FAIL
New credential deployed: yes/no
Smoke test: PASS/FAIL
Old credential revoked: yes/no
Old credential rejected: yes/no/not-testable
Monitoring result:
Rollback used: yes/no
Notes:
```

Secret値、Secretの断片、JWT、メールアドレス、Project Ref、レスポンス本文は記録しない。

## 7. 初回訓練の完了条件

- Production Secretを変更していない。
- 台帳検査が`SECRET_INVENTORY_PASSED`。
- 新Secret反映後のSmoke testが成功。
- 旧Secretが失効済み。
- 旧Secret拒否を確認済み、またはProvider制約により`not-testable`として理由を記録。
- 新Secretで主要機能が正常。
- Git、Issue、PR、チャット、ログに秘密値が残っていない。
- 秘密値を含まない証跡がアクセス制御された運用管理場所に保存されている。

上記を満たした時点でBA-005の初回ローテーション訓練を完了扱いにできる。
