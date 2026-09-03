# BA-005 Secretローテーション実環境検証証跡

## 証跡ID

`BA005-ROTATION-20260903-01`

## 対象

- 課題: BA-005 秘密情報管理・ローテーション
- 環境: Staging（非Production）
- Production変更: なし
- 参照Runbook: `RB-006_Secret漏えい・ローテーション.md`、`RB-007_Secretローテーション訓練.md`

## 検証結果

|確認項目|結果|
|---|---|
|外部Secret台帳validator|PASS（1件、findings 0）|
|ローテーション前の旧Secret|HTTP 200|
|交換用の新Secret|HTTP 200|
|旧Secret失効後の拒否|HTTP 401|
|旧Secret失効後の新Secret継続動作|HTTP 200|
|secret-free rotation evidence validator|`SECRET_ROTATION_DRILL_EVIDENCE_PASSED` / complete true / findings 0|
|Production touched|false|

## 補足検証

`security:service-rpc` は補助的に実行した。19件中14件がPASSし、固定検証データを必要とする `rpc_allowed_resources` 5件はHTTP 404となったため、このスイート全体はBA-005の合否ゲートには使用していない。今回のSecretローテーション合否は、旧Secret・新Secretそれぞれの実認証結果、旧Secret失効後の401拒否、新Secretの継続動作、および専用のrotation evidence validatorで判定した。補助検証ではDB変更は行っていない。

## 秘密情報管理

GitHub証跡には次を記録していない。

- Secret値またはその断片
- JWT / Access Token / Refresh Token
- メールアドレス
- Project Ref
- Supabase URL
- DB接続情報
- Productionデータ

実際のSecret台帳とローテーション証跡JSONはリポジトリ外の運用証跡領域に保存し、GitHubには検証結果のみを記録する。

## 判定

BA-005の初回非Production Secretローテーション訓練は完了。外部台帳、交換前確認、新Credential展開、旧Credential失効・拒否、新Credential継続確認、秘密値を含まない証跡validatorまで確認済みのため、BA-005を`verified`とする。
