# 06 API設計

SESN (System Engineer Sales Navigator)

## 1. 目的

SESNのWeb UI、外部連携、バッチ、AI処理が共通して利用するAPI規約を定義する。OpenAPI 3.1を正本とし、型、クライアント、モック、契約テストを生成する。

## 2. 基本方針

- REST / JSON / HTTPS
- ベースパス: `/api/v1`
- JSON項目名: `camelCase`
- DB項目名: `snake_case`
- 内部識別子: UUID
- 管理番号は検索条件として利用し、詳細URLの識別子はUUIDに限定
- 日時はUTCのISO 8601、画面表示はAsia/Tokyo
- 日付のみは`YYYY-MM-DD`
- 金額は数値、通貨はISO通貨コードを別項目で保持

## 3. 認証・セッション

- JWT Access Token + Refresh Token
- Access Token有効期限: 30分
- Refresh Token有効期限: 30日
- Refresh Token Rotationを有効化
- Refresh Token再利用検知時は同一セッションチェーンを失効
- Access Tokenはクライアントメモリに保持
- Refresh TokenはSecure / HttpOnly / SameSite Cookieに保持
- 複数端末・複数セッションを許可
- 管理者はユーザー単位・セッション単位で失効可能

## 4. APIキー・サービスアカウント

- 外部連携は専用サービスアカウントを使用
- APIキーごとにスコープ、有効期限、IP制限、対象テナントを設定
- APIキー平文は発行時に一度だけ表示
- サーバーにはハッシュのみ保存
- 発行、変更、利用、無効化を監査

## 5. テナント・認可

テナントは認証情報から確定し、クライアントから任意指定させない。

認可は次の3層で評価する。

1. ロール・機能権限
2. レコード権限
3. 項目権限

制限項目はレスポンスから省略する。個人情報等は権限に応じてマスキング可能とする。

## 6. HTTPメソッド

- `GET`: 参照
- `POST`: 作成、検索、業務アクション
- `PATCH`: 部分更新
- `PUT`: 全置換
- `DELETE`: 通常は論理削除

作成成功は`201 Created`、作成後リソースと`Location`ヘッダーを返す。通常の論理削除成功は`204 No Content`とする。

## 7. 状態変更API

業務状態は汎用PATCHではなく、専用アクションAPIで変更する。

```http
POST /api/v1/proposals/{id}/request-approval
POST /api/v1/proposals/{id}/approve
POST /api/v1/proposals/{id}/return
POST /api/v1/proposals/{id}/send
POST /api/v1/proposals/{id}/correct
POST /api/v1/contracts/{id}/cancel-before-start
POST /api/v1/engagements/{id}/finish
```

実行可能な操作は事前確認APIで取得できる。

```http
GET /api/v1/proposals/{id}/available-actions
```

各操作について`allowed`、理由コード、理由入力要否、承認要否を返す。

## 8. PATCHの意味

PATCHでは次を区別する。

- 項目なし: 変更しない
- `null`: 値を消去する
- 空文字: 空文字として設定可能な項目のみ許可
- 空配列: 関連集合を空にする意味を明示したAPIのみ許可

関連データは原則として専用エンドポイントで追加・削除する。

## 9. 子リソース

作成・一覧は親配下、詳細・更新は独立URLを許可する。

```http
POST /api/v1/projects/{projectId}/sources
GET  /api/v1/projects/{projectId}/sources
GET  /api/v1/project-sources/{sourceId}
PATCH /api/v1/project-sources/{sourceId}
```

## 10. 一覧・ページング

- 標準はカーソルページング
- カーソルは署名または暗号化
- 既定50件、最大200件
- 管理画面の一部はページ番号方式を許可
- `include=`で関連データを限定取得
- 一覧では`fields=`による項目選択を許可
- ソート項目はAPIごとの許可リスト方式
- 降順は`-updatedAt`形式

## 11. 検索

単純条件はGET、複雑条件はPOST検索を使用する。

```http
GET  /api/v1/projects?managementNo=PJ-000123&status=recruiting
POST /api/v1/projects/search
```

POST検索は原則キャッシュしない。必要時のみ検索条件ハッシュで短時間キャッシュする。

保存検索は独立リソースとして管理する。

```http
POST /api/v1/saved-searches
GET  /api/v1/saved-searches
```

個人用／共有、共有範囲、条件、ソート、表示項目を保持する。

## 12. 楽観ロック

- レスポンスにETagを付与
- 更新・重要操作は`If-Match`を要求
- `rowVersion`もレスポンスに含める
- 不一致は`412 Precondition Failed`

## 13. 冪等性

作成、送信、成約、契約生成、Bulk等の重複実行リスクがあるAPIでは`Idempotency-Key`を必須化する。

適用単位:

`tenant + actor + operation + idempotencyKey`

保持期間は原則24時間。成約・契約生成等は処理種別ごとに延長できる。

## 14. Bulk API

- 専用Bulk APIを提供
- 小規模は同期、大規模は非同期へ自動選択
- 行単位の部分成功を標準
- 業務上必要な処理のみ全体ロールバック
- `Idempotency-Key`必須

## 15. 非同期ジョブ

非同期受付は`202 Accepted`とし、`jobId`、状態確認URL、取得可能な場合は推定待ち時間を返す。

```http
GET  /api/v1/jobs/{jobId}
POST /api/v1/jobs/{jobId}/cancel
POST /api/v1/jobs/{jobId}/retry
```

- 完了済みジョブ参照期間: 通常90日
- 監査対象の実行記録: 別途長期保存
- 結果ファイル: 原則7日、機密データは短縮可能

## 16. ファイル

アップロードはPre-signed URL方式とする。

```http
POST /api/v1/files/upload-requests
POST /api/v1/files/{id}/complete
GET  /api/v1/files/{id}
```

ウイルスチェック中は`pendingScan`とし、ダウンロード・AI解析・業務利用を禁止する。

## 17. エクスポート

- 原則非同期
- 実行理由必須
- 権限に応じてマスキング
- 生成・ダウンロードを監査
- ファイル期限は原則7日

## 18. AI API

AI処理開始は業務リソース配下、状態・結果・レビューは共通実行APIで管理する。

```http
POST /api/v1/projects/{id}/ai/match-engineers
GET  /api/v1/ai-executions/{id}
GET  /api/v1/ai-executions/{id}/output
POST /api/v1/ai-executions/{id}/approve
POST /api/v1/ai-executions/{id}/reject
```

抽出、マッチング、長文生成、一括評価は原則非同期。短い補正文や小規模要約のみ条件付き同期を許可する。AI成功だけでは業務データを更新せず、人の承認APIで正式反映する。

## 19. Webhook

- 管理者が購読イベントを選択
- At-least-once delivery
- Event ID付与
- HMAC署名
- タイムスタンプ検証
- 再試行
- Dead Letter管理
- 本文は概要と対象IDを基本とし、詳細はAPIで再取得

## 20. エラー形式

HTTP標準ステータスを使用する。

- 400: 不正リクエスト
- 401: 未認証
- 403: 権限不足
- 404: 未存在または非開示
- 409: 業務競合・重複候補
- 412: ETag不一致
- 422: 業務バリデーション
- 429: レート超過
- 500: サーバーエラー

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください。",
    "details": [
      {
        "field": "unitPrice",
        "code": "OUT_OF_RANGE",
        "message": "単価を確認してください。"
      }
    ]
  },
  "requestId": "req_xxx"
}
```

業務エラーコードは英語固定で安定させ、表示文言は日本語を標準とする。将来拡張のため`Accept-Language`を解釈可能にする。

## 21. 重複候補

技術者・顧客・案件の重複候補検出時は即時確定せず、`409 Conflict`で候補、スコア、判定根拠を返す。専用確認APIで新規登録、既存利用、統合申請を確定する。

## 22. レート制限

ユーザー、APIキー、テナントの各単位で制限し、エンドポイントごとに値を設定する。超過時は`429`と再試行可能時刻を返す。

## 23. キャッシュ

- マスタ参照: ETag付きキャッシュ可
- 個人情報、金額、提案詳細: 原則`no-store`
- 一覧: APIごとに短時間キャッシュを判断
- 更新系: キャッシュ禁止

## 24. 監査

次を監査対象とする。

- 閲覧
- 登録・更新
- 状態変更
- 承認・差戻し
- 送信
- エクスポート
- AI利用
- 削除・復元
- APIキー操作
- Webhook変更
- セッション失効

記録候補はrequestId、実行主体、テナント、API、メソッド、対象ID、結果コード、IP、User-Agent、処理時間、理由とする。Access Token、Refresh Token、APIキー平文、パスワード、ファイル本文、不要な個人情報は保存しない。

## 25. 削除・復元

通常削除は論理削除。物理削除は専用管理API、専用権限、理由、影響確認、監査を必須とする。復元も専用APIとし、理由、権限、重複・整合性確認を必須とする。

## 26. コメント履歴

コメント編集時は版履歴を保持し、過去版参照APIを提供する。

```http
GET /api/v1/comments/{id}/versions
```

## 27. API非推奨化

- 非推奨期間は原則6か月以上
- Deprecation / Sunset関連ヘッダーを返す
- ドキュメントに代替APIと終了日を明記

## 28. OpenAPI運用

OpenAPI 3.1を正本とし、以下をCIで生成・検証する。

- TypeScript型・クライアント
- サーバースタブ
- モックサーバー
- 契約テスト
- 破壊的変更検知
- ドキュメント

## 29. 今後の詳細化

物理DB・テーブル設計後に、各リソースのスキーマ、操作一覧、権限マトリクス、OpenAPI YAMLへ展開する。
