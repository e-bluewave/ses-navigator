# BA-002 リージョン・DB接続 実環境証跡テンプレート

このテンプレートは、RB-010の実環境確認結果をSecret-freeで記録するために使用する。

## 禁止事項

以下はGitHub、PR、Issue、チャット、ログへ記録しない。

- Supabase Project Ref / Project ID
- Supabase URL
- Vercel Project ID
- DB接続文字列
- Password / Secret / JWT / API key
- メールアドレス
- Productionデータ

証跡ファイル自体はアクセス制御されたリポジトリ外の運用管理場所へ保存する。

## JSONテンプレート

```json
{
  "evidenceId": "BA002-REGION-YYYYMMDD-01",
  "verifiedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "stagingRegionConfirmed": true,
  "productionRegionConfirmed": true,
  "regionAlignment": "PASS",
  "stagingDatabaseMode": "data-api",
  "productionDatabaseMode": "data-api",
  "migrationConnectionMode": "direct",
  "backupRestoreConnectionMode": "session-pooler",
  "runtimeBindingCheck": "PASS",
  "stagingSmokeTest": "PASS",
  "latencyMeasured": true,
  "latencyP50Ms": 0,
  "latencyP95Ms": 0,
  "latencyP99Ms": 0,
  "errorRatePercent": 0,
  "crossRegionProductionException": "none",
  "secretFreeEvidence": true,
  "sampleCount": 0,
  "notes": ""
}
```

## 許容値

- `stagingDatabaseMode` / `productionDatabaseMode`
  - `data-api`
  - `transaction-pooler`
- `migrationConnectionMode` / `backupRestoreConnectionMode`
  - `direct`
  - `session-pooler`
- `crossRegionProductionException`
  - `none`
  - `approved`

現行SES NavigatorのRuntime既定は`data-api`。Transaction Poolerは将来Direct SQLが必要な場合のみ使用し、Migration / backup / restoreには使用しない。

## 実施順序

1. Staging/ProductionのSupabase DB regionを管理画面で確認する。
2. Vercel Function regionがDBに近接していることを確認する。
3. 実行時環境変数だけで`pnpm security:db-connectivity`を実行し、PASSを確認する。
4. StagingでAuth / Data API / 主要API Smokeを実施する。
5. Staging通常負荷で複数回リクエストを計測し、p50 / p95 / p99 / error rateを記録する。
6. Migration、backup/restoreの接続分類を確認する。
7. Productionクロスリージョン通信がある場合のみ例外承認を記録する。
8. 証跡JSONをリポジトリ外へ保存し、次を実行する。

```text
pnpm security:region-connectivity-evidence -- "C:\path\outside-repository\region-connectivity-evidence.json"
```

成功条件は`REGION_CONNECTIVITY_EVIDENCE_PASSED`。

## BA-002完了条件との関係

この証跡がPASSして初めて、GitHub上の設計・CIガードに加えて実環境確認が完了したと判断できる。実環境未確認の段階ではBA-002を完了扱いにしない。
