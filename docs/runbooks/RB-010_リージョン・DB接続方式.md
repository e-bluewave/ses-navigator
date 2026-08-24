# RB-010 リージョン・DB接続方式

## 1. 目的

Vercel FunctionsとSupabase PostgreSQL間の不要なクロスリージョン通信と接続枯渇を避け、実行用途ごとにData API、Transaction Pooler、Direct/Session接続を使い分ける。

## 2. リージョン方針

1. Supabase DBの配置を先に決める。
2. Vercel FunctionsはDBに最も近い利用可能リージョンを選ぶ。
3. StagingとProductionは同一のリージョンクラスを基本とする。
4. Productionの恒常的なクロスリージョンDB通信は例外扱いとし、理由・Latency・費用・障害影響を記録する。
5. GitHubには実環境Project Ref、URL、DB接続文字列、Passwordを保存しない。

実際のリージョンコードは環境作成時に確定し、秘密値を含まない運用台帳へ記録する。

## 3. 接続方式

| 用途 | 標準方式 | 備考 |
| --- | --- | --- |
| Browser | Supabase Data API | DB接続文字列を渡さない |
| Vercel API / Functions | Supabase Data API | 現行SESNの既定 |
| VercelからDirect SQLが必要な将来機能 | Supavisor Transaction mode | port 6543。prepared statementsを無効化 |
| Migration | Direct connection | IPv6等の制約時はSession poolerを代替可 |
| pg_dump / restore /管理ツール | Direct connection | IPv6等の制約時はSession poolerを代替可 |

Transaction PoolerをMigration、pg_dump、restoreの経路として使わない。

## 4. 現行アプリへの適用

SES NavigatorのWeb/APIは原則としてSupabase Data API経由を維持する。BA-002では、Direct SQL接続を新規導入しない。

将来、Data APIでは扱いにくいサーバー処理でPostgres Wire Protocol接続が必要になった場合だけTransaction Poolerを使用する。その際はアプリ側の接続プールを小さくし、prepared statementsを使用しない設定を確認する。

## 5. 実環境確認

Staging/Productionごとに次を確認する。

- Supabase DB region
- Vercel Function region
- 同一または近接リージョンであること
- Runtime DB modeが`data-api`または`transaction-pooler`であること
- Transaction Pooler使用時はport 6543であること
- Migration/backup経路がTransaction Poolerではないこと
- DB接続文字列・PasswordがGitHub、ログ、ブラウザへ露出していないこと

リージョンを論理グループ名で検証する場合、環境変数は次を使う。

- `SESN_STAGING_REGION_GROUP`
- `SESN_PRODUCTION_REGION_GROUP`
- `SESN_STAGING_DATABASE_MODE`
- `SESN_PRODUCTION_DATABASE_MODE`

値はGitHubへコミットせず、実行時だけ設定する。

```bash
pnpm security:db-connectivity
```

## 6. 設定変更手順

1. StagingでSupabase DB regionとVercel Function regionを確認する。
2. Stagingで通常APIのLatencyとエラー率を測定する。
3. Direct SQLを使う場合はTransaction Poolerで接続確認する。
4. MigrationはDirectまたはSession接続で実行する。
5. Productionも同じ接続分類を設定する。
6. Staging/Productionの論理region groupとdatabase modeを検証する。
7. 変更後にAuth、Data API、主要API smokeを実行する。

## 7. 障害時

- DB接続数逼迫時に、闇雲にpool sizeを増やさない。
- Transaction Poolerの接続障害時はSupabaseの状態とリージョン障害を確認する。
- Migration失敗時にRuntime用Transaction Poolerへ切り替えて続行しない。
- リージョン変更はデータ移行・停止時間・接続先変更を伴うため、通常設定変更として即時実行しない。

## 8. 完了条件

BA-002は次を満たした時点で完了とする。

1. Staging/ProductionのSupabase DB regionが確定している。
2. Vercel FunctionsがDBに近接するregionへ設定されている。
3. Runtime接続方式が確定し、現行はData APIを標準としている。
4. Direct SQL利用時のTransaction Pooler方針が確定している。
5. Migration/backupがDirectまたはSession経路で実行される。
6. `pnpm security:db-connectivity`が静的・実環境バインド検査でPASSする。
7. Stagingで主要SmokeとLatency確認が成功している。

GitHub側の設計・CIガードだけでは完了扱いにせず、実環境のregion/binding確認後に完了へ更新する。
