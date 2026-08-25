# BA-016 財務・請求業務検証 証跡テンプレート

このテンプレートは `ops/finance-policy.json` に定義された財務・請求ルールを Staging または Disposable 環境で検証した結果を、Secret・個人情報・Production 識別子を含めず記録するためのものです。

## 記録禁止

- 適格請求書発行事業者の実登録番号
- 実取引先名、担当者名、メールアドレス、住所、銀行情報
- 実請求書番号、実金額、実明細
- Supabase Project Ref、URL、JWT、API Key、DB 接続文字列
- Production 固有 ID

## JSON 証跡例

```json
{
  "evidenceId": "BA016-FINANCE-YYYYMMDD-01",
  "environment": "Staging",
  "completedAt": "YYYY-MM-DDTHH:mm:ss+09:00",
  "qualifiedInvoiceValidated": true,
  "registrationNumberExternalized": true,
  "taxRatesTenAndEightValidated": true,
  "defaultTaxRateTenValidated": true,
  "taxRoundingOncePerInvoicePerRateValidated": true,
  "lineItemTaxRoundingNotUsed": true,
  "floorRoundingValidated": true,
  "withholdingDefaultNotApplicableValidated": true,
  "withholdingOverrideValidated": true,
  "industryNameOnlyInferenceNotUsed": true,
  "businessReviewCompleted": true,
  "confirmedInvoiceOverwriteBlocked": true,
  "revisionHistoryValidated": true,
  "originalInvoiceLinkValidated": true,
  "reasonActorTimestampValidated": true,
  "issuedNumberReuseBlocked": true,
  "configurableAccountingMappingValidated": true,
  "vendorSpecificCodesNotHardcoded": true,
  "confirmedInvoiceMappingNotRetroactivelyChanged": true,
  "stagingBusinessValidationCompleted": true,
  "productionIdentifiersRecorded": false,
  "personalDataRecorded": false,
  "secretOrPersonalDataExposed": false,
  "secretFreeEvidence": true,
  "followUpRequired": false,
  "notes": "Secret-free finance business validation evidence."
}
```

## 必須検証

1. 適格請求書対応を確認し、登録番号などの実データはリポジトリ外で管理する。
2. 消費税 10% と 8% の両方を検証し、既定税率 10% を確認する。
3. 税額計算は税率ごとに請求書単位で 1 回だけ行い、明細単位の税額丸めを使わない。
4. 丸めは切捨てを確認する。
5. 源泉徴収は既定で適用しない。必要時は取引先または請求書単位の明示設定と業務レビューを必要とし、業種名・名称だけで自動判定しない。
6. 確定済み請求書は直接上書きできないことを確認する。訂正時は履歴、元請求書リンク、理由・実行者・日時を保持し、発行済み番号を再利用しない。
7. 会計マッピングは設定可能で、特定会計ソフトのコードをハードコードしない。確定済み請求書へ設定変更を遡及適用しない。
8. Staging で業務レビューを完了する。

## 判定

証跡 JSON を作成したら次を実行します。

```bash
node scripts/check-finance-evidence.mjs <evidence.json>
```

`FINANCE_EVIDENCE_PASSED` の場合のみ BA-016 の実環境証跡として扱います。証跡チェッカーが存在するだけでは BA-016 完了とはしません。
