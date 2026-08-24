# BA-009 RPO/RTO Evidence Template

BA-008の復旧訓練実測値をBA-009のRPO/RTO目標と照合するためのSecret-free証跡テンプレートです。

## 固定目標

`ops/rpo-rto-policy.json` を正本とし、現行目標は以下です。

- Tier 1: RPO 60分 / RTO 240分
- Tier 2: RPO 240分 / RTO 480分
- Tier 3: RPO 1440分 / RTO 1440分

## 記録ルール

- 実測値はBA-008復旧訓練から取得する。
- DB URL、password、JWT、API key、Project Ref、メールアドレス、個人情報を記録しない。
- Business Owner / Technical Ownerの氏名そのものではなく、承認済みかどうかだけを記録する。
- 目標超過時はProduction Readyにしない。例外申請があっても、目標超過そのものは解消扱いにしない。

## Evidence JSON例

```json
{
  "evidenceId": "BA009-RPO-RTO-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "restoreDrillEvidencePassed": true,
  "measurementsTakenFromBa008": true,
  "tier1RpoMinutesMeasured": 0,
  "tier1RtoMinutesMeasured": 0,
  "tier2RpoMinutesMeasured": 0,
  "tier2RtoMinutesMeasured": 0,
  "tier3RpoMinutesMeasured": 0,
  "tier3RtoMinutesMeasured": 0,
  "businessOwnerApproved": true,
  "technicalOwnerApproved": true,
  "targetsAcknowledged": true,
  "annualReviewScheduled": true,
  "exceptionUsed": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "notes": "Secret-free summary only."
}
```

例外を記録する場合のみ以下を追加します。ただし実測値が目標を超えていれば本チェッカーはFAILのままです。

```json
{
  "exceptionUsed": true,
  "exceptionApprovalPresent": true,
  "exceptionExpiryPresent": true
}
```

## 実行

```bash
pnpm security:rpo-rto-evidence /path/to/evidence.json
```

成功時:

```text
RPO_RTO_EVIDENCE_PASSED
```

## BA-009完了判定

GitHub上のpolicy/Runbook/CIだけでは完了扱いにしません。BA-008の実測値が全Tier目標内で、Business OwnerとTechnical Ownerの承認が確認され、Production Ready判定へ反映された時点で完了候補となります。
