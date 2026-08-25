# BA-017 長時間処理・外部ワーカー境界 証跡テンプレート

このテンプレートは `ops/long-running-processing-policy.json` の境界を Staging または Disposable 環境で検証した結果を、プロバイダー名・Secret・個人情報・Production 識別子を含めず記録するためのものです。

## 記録禁止

- ワーカー/キューの接続情報、認証情報、URL、Token
- Supabase Project Ref、JWT、API Key、DB 接続文字列
- 実案件・技術者・取引先などの個人/業務データ
- Production 固有 ID

## 必須検証

1. Edge の期待実行時間を30秒以内に制限し、超過見込み処理を Worker へ移す。
2. CPU負荷、Bulk、大容量ファイル、複数AI呼出し、進捗/取消、retry/dead-letter が必要な処理を Worker へ移す。
3. job_id、tenant_id、job_type、idempotency_key、attempt、lease、progress、dead-letter state を確認する。
4. retryable/permanent 分類、backoff、重複実行防止、副作用の冪等性を確認する。
5. timeout時に部分的な業務状態を残さない。
6. Worker中断、再起動、lease失効からの復旧を確認する。
7. dead-letter 遷移と再処理経路を確認する。
8. BA-013 に接続する queue depth、oldest queued age、running duration、retry/failure/dead-letter、expired lease の監視を確認する。
9. tenant境界を破らないこと、payload/CIログにSecretや不要な個人情報を含めないことを確認する。

## JSON 証跡例

```json
{
  "evidenceId": "BA017-WORKER-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "edgeThirtySecondBoundaryValidated": true,
  "longTaskRoutedToWorker": true,
  "cpuHeavyTaskRoutedToWorker": true,
  "bulkTaskRoutedToWorker": true,
  "largeFileTaskRoutedToWorker": true,
  "multiAiBatchRoutedToWorker": true,
  "progressAndCancellationValidated": true,
  "jobIdValidated": true,
  "tenantIdValidated": true,
  "jobTypeValidated": true,
  "idempotencyKeyValidated": true,
  "attemptTrackingValidated": true,
  "leaseValidated": true,
  "progressStateValidated": true,
  "deadLetterStateValidated": true,
  "retryClassificationValidated": true,
  "backoffValidated": true,
  "duplicateExecutionProtectionValidated": true,
  "sideEffectIdempotencyValidated": true,
  "timeoutLeavesNoPartialBusinessState": true,
  "workerInterruptionRecoveryValidated": true,
  "restartRecoveryValidated": true,
  "expiredLeaseRecoveryValidated": true,
  "deadLetterFlowValidated": true,
  "monitoringSignalsValidated": true,
  "tenantBoundaryValidated": true,
  "secretFreeEvidence": true,
  "productionSecretsInPayload": false,
  "unnecessaryPersonalDataInPayload": false,
  "productionIdentifiersRecorded": false,
  "personalDataRecorded": false,
  "personalDataInCiLogs": false,
  "followUpRequired": false,
  "notes": "Provider-neutral long-running processing evidence."
}
```

## 判定

```bash
node scripts/check-long-running-processing-evidence.mjs <evidence.json>
```

`LONG_RUNNING_PROCESSING_EVIDENCE_PASSED` の場合のみ実環境証跡として扱います。チェッカーが存在するだけでは BA-017 完了とはしません。また実際の Worker/Queue 製品選定は別の意思決定として扱います。
