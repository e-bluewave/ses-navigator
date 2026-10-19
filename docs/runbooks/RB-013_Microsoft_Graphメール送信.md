# RB-013 Microsoft Graphメール送信・資格情報運用

## 1. 目的

SES Navigator の提案メッセージを Microsoft Graph 経由で実送信するための設定、検証、障害時の停止、資格情報のローテーション手順を定義する。

Issue #165 の送信・再送・配信履歴基盤を前提とし、本Runbookは Issue #167 の実メールprovider接続を対象とする。

## 2. 実装境界

- API serverだけがMicrosoft Graphへ接続する。
- browserへMicrosoft Graph access token、client secret、Supabase service role keyを渡さない。
- providerは `ProposalMessageDeliveryProvider` 境界の内側に閉じる。
- `MESSAGE_DELIVERY_PROVIDER=microsoft_graph` を明示した場合だけGraph providerを選択する。
- 必須設定が1つでも不足する場合はproviderを unavailable として送信をfail closedする。
- `fake` providerはProductionでは利用できない。
- Graphの `202 Accepted` は「Microsoft Graphが送信処理を受け付けた」ことを表し、最終配送保証ではない。
- Graph `sendMail` の202応答はmessage idを返さないため、初期実装では `provider_message_id` はnullとする。
- bounce / complaint / unsubscribe 等の非同期配送イベント連携はMVP 1後の拡張対象とする。

## 3. 必須環境変数

値はGitHub、Issue、PR、ログ、ドキュメントへ記録しない。

| 変数 | 用途 |
| --- | --- |
| `MESSAGE_DELIVERY_PROVIDER` | `microsoft_graph` を指定 |
| `MICROSOFT_GRAPH_TENANT_ID` | Microsoft Entra tenant ID |
| `MICROSOFT_GRAPH_CLIENT_ID` | App registrationのApplication (client) ID |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | server-side client credential |
| `MICROSOFT_GRAPH_SENDER` | SES Navigatorが送信元として利用するメールボックス |

StagingとProductionで資格情報を分離する。Production値をLocalやStagingへコピーしない。

## 4. Microsoft Entra側の設定

この操作はMicrosoft 365 / Entra管理者が行う。

1. SES Navigator専用のApp registrationを作成する。
2. Microsoft GraphのApplication permissionとして `Mail.Send` だけを付与する。
3. 管理者同意を実施する。
4. SES Navigator専用client credentialを作成する。
5. 送信元メールボックスを `MICROSOFT_GRAPH_SENDER` として決める。
6. Exchange Online側で、可能な限りアプリのアクセス範囲を専用送信元メールボックスへ制限する。
7. Client secretの期限、所有者、ローテーション日をSecret管理台帳へ記録する。値自体は記録しない。

不要な `Mail.Read`、`Mail.ReadWrite`、Directory系権限は追加しない。

## 5. Vercel設定

### Staging

- `MESSAGE_DELIVERY_PROVIDER=microsoft_graph`
- Staging専用Entra credential
- Staging専用または明示承認された送信元
- テスト送信先は事前承認したアドレスだけを使用する

### Production

Stagingの実送信smokeが成功し、責任者が承認するまで設定しない。

Production設定後も、最初の送信は責任者が確認したテスト宛先へ限定する。

## 6. Staging実送信smoke

可能な限り手作業でAPIを叩かず、以下の安全ガード付きrunnerを利用する。

```text
pnpm smoke:microsoft-graph-preflight
pnpm smoke:proposal-delivery-real-mail
```

`smoke:proposal-delivery-real-mail` は、Staging指定、期待宛先の完全一致、明示確認文字列が揃わない限り送信しない。メールアドレスやtokenはログへ出さない。


1. PR / Main / deployment SHAを記録する。
2. Stagingのprovider設定が `microsoft_graph` であることを確認する。秘密値は表示しない。
3. 承認済み提案メッセージを1件用意する。
4. 宛先がテスト用メールアドレスであることを二重確認する。
5. SES Navigatorの送信操作を1回だけ実行する。
6. APIが成功し、attemptが `accepted`、response codeが `202` であることを確認する。
7. Microsoft 365の送信済みアイテムと受信側で実メールを確認する。
8. 同一操作の二重実行がidempotencyで抑止されることを確認する。
9. 意図的失敗条件またはテスト環境で失敗履歴と再送導線を確認する。
10. provider response本文やaccess tokenが画面・ログ・監査へ露出していないことを確認する。

## 7. Production有効化条件

- Issue #165 Local runtime smoke PASS
- Issue #167 CI / review PASS
- Entra `Mail.Send` Application permissionと管理者同意確認
- 送信元メールボックス確定
- アプリのメールボックスアクセス範囲制限確認
- Staging実送信smoke PASS
- Secret管理・ローテーション手順確認
- 誤送信防止用の最初のProduction送信先を明示
- Production反映責任者の承認

## 8. 障害時

### 401 / 403

- provider設定を変更せず送信を停止する。
- Entra tenant / client ID / secret期限 / admin consent / mailbox restrictionを確認する。
- 認証エラー本文やtokenをIssueへ貼らない。

### 429

- `Retry-After` を証跡として確認する。
- 自動連打しない。
- SES Navigator側では失敗attemptとして保持し、再送判断を人が行う。

### 5xx / network error

- Microsoft 365 Service Healthを確認する。
- 重複送信防止のため、同一送信を手動で即時連打しない。
- 配信履歴とidempotency keyを確認してから再送する。

### 誤送信・資格情報漏えい疑い

1. `MESSAGE_DELIVERY_PROVIDER` を無効値または未設定へ戻し送信をfail closedする。
2. 必要ならEntra credentialを失効する。
3. RB-006 Secret漏えい・ローテーションを実施する。
4. 監査・配信履歴を保全する。
5. 影響範囲を確認してから再有効化する。

## 9. Secretローテーション

1. 新しいcredentialをEntraで発行する。
2. Stagingへ新credentialを設定しsmokeする。
3. Productionへ新credentialを設定する。
4. Productionの限定送信確認後、旧credentialを失効する。
5. 値を含めず、実施日時・実施者・対象環境・結果を記録する。

## 10. MVP 1完了証跡

- Issue #165 / PR #166完了
- Issue #167 PR完了
- Microsoft Graph provider単体テストPASS
- Staging実メール送信PASS
- Production限定実メール送信PASS
- 送信履歴・失敗・再送確認PASS
- Secret漏えい0件
- 最終MVP 1業務シナリオ通しPASS
