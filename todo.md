# SmartMenu TODO

## Phase 1: DBスキーマ・マイグレーション
- [x] familyProfiles テーブル（家族構成）
- [x] familyMembers テーブル（家族メンバー詳細）
- [x] fridgeItems テーブル（冷蔵庫在庫）
- [x] stores テーブル（マイ店舗）
- [x] menuPlans テーブル（献立プラン）
- [x] deliveryLogs テーブル（配信ログ）
- [x] shoppingListItems テーブル（買い物リスト）
- [x] lineUsers テーブル（LINEユーザー連携）
- [x] DBマイグレーション実行

## Phase 2: バックエンドAPI
- [x] LINE Webhook受信エンドポイント（/api/line/webhook）
- [x] LINE メッセージ送信ヘルパー
- [x] 家族構成 CRUD API（getProfile, addMember, deleteMember）
- [x] 冷蔵庫在庫 CRUD API（list, add, delete）
- [x] マイ店舗 CRUD API（list, add, update, delete）
- [x] 献立生成API（getOrGenerate - OpenAI統合）
- [x] 買い物リスト生成API（自動生成 + toggle + delete）
- [x] 手動配信トリガーAPI（sendToLine）
- [x] 管理者API（listUsers, listLineUsers, listDeliveryLogs, broadcastMenus）

## Phase 3: フロントエンド
- [x] グローバルデザインテーマ設定（緑系カラー・Noto Sans JP）
- [x] ランディングページ（Home.tsx）- サービス紹介・ログイン導線
- [x] ダッシュボードページ（Dashboard.tsx）- 今日の献立・買い物リスト
- [x] 家族構成管理ページ（Family.tsx）
- [x] 冷蔵庫管理ページ（Fridge.tsx）
- [x] マイ店舗登録ページ（Stores.tsx）
- [x] 買い物リストページ（Shopping.tsx）
- [x] 献立履歴ページ（History.tsx）
- [x] 管理画面（Admin.tsx）
- [x] App.tsxルーティング設定（全8ページ）

## Phase 4: 管理画面・バッチ・テスト
- [x] 管理画面（Admin.tsx）- ユーザー一覧・配信ログ・一括配信
- [x] 自動配信バッチ（server/batch/deliverMenus.ts）
- [x] Vitestユニットテスト（献立生成ロジック - 4テスト全通過）
- [x] LINE Webhook署名検証（X-Line-Signature）

## Phase 5: 納品
- [x] 動作確認（TypeScript: エラーなし、テスト: 4/4通過、サーバー: 正常稼働）
- [x] チェックポイント保存（version: 3e2f914a）
- [x] デプロイ手順書作成（README参照）

## Phase 6: LINE Webhook接続
- [ ] LINE Channel Access Token・Channel Secretをシークレットに設定
- [ ] Webhook URLをLINEデベロッパーコンソールに登録
- [ ] Webhook署名検証の動作確認
- [ ] LINE友だち追加時の自動返信テスト

## Phase 7: レシートOCR機能（冷蔵庫自動登録）
- [ ] レシート画像アップロードUI（Fridge.tsx）
- [ ] S3へのレシート画像アップロード処理
- [ ] OpenAI Vision APIによるレシートOCR（品目・金額抽出）
- [ ] 抽出結果の確認・編集UI（登録前プレビュー）
- [ ] 冷蔵庫DBへの一括登録処理
- [ ] receipts テーブル追加（画像URL・抽出データ保存）

## Phase 8: 家計簿機能（課金オプション）
- [ ] householdExpenses テーブル追加（日付・品目・金額・カテゴリ）
- [ ] レシートOCRと家計簿の連携（自動仕訳）
- [ ] 家計簿ページ（Household.tsx）- 月別集計・グラフ
- [ ] 課金プラン設計（フリー/プレミアム）
- [ ] Stripe課金オプション統合

## フェーズ2B：AI応答強化・位置情報・会話履歴

- [ ] DBスキーマ拡張：line_conversation_history テーブル追加（会話履歴保持）
- [ ] DBスキーマ拡張：line_users テーブルに latitude/longitude/region カラム追加
- [ ] LINE上で直接情報収集：「冷蔵庫に○○があります」→ DBに自動登録
- [ ] LINE上で直接情報収集：「家族は4人です」→ 家族構成をDBに自動登録
- [ ] 会話履歴保持：直近5〜10ターンの会話をDBに保存・プロンプトに含める
- [ ] 位置情報取得：LINEの位置情報メッセージを受信してDBに保存
- [ ] 位置情報活用：ユーザーの地域に基づいた天気取得（東京固定を解消）
- [ ] 位置情報活用：近隣スーパー検索に位置情報を活用

## フェーズ2C：管理者セキュリティ強化

- [ ] 管理者権限付与：usersテーブルのroleをadminに更新するSQL
- [ ] 管理者専用ログインフォーム（ID/PASS）
- [ ] 2要素認証：ログイン後にLINEまたはメールにOTPコードを送信
- [ ] 2FAセッション管理：認証済みセッションのみ管理画面にアクセス可能
- [ ] OTPテーブル追加（admin_otp: code, expiresAt, lineUserId）

## バグ修正

- [x] リッチメニュー画像アップロード時に「413 Request Entity Too Large」エラー → 画像を圧縮してLINE API制限（1MB以下）に合わせる（779KB JPEGに圧縮済み）
- [x] usersテーブルのNULL重複レコード生成バグを修正（SELECT→INSERT/UPDATEパターンに変更、openIdにUNIQUEインデックス追加）
- [x] 既存のNULLレコードをDBから削除（24件削除完了）

## 完了した機能（フェーズ2B・2C）

- [x] LINE上で直接情報収集（冷蔵庫・家族構成をLINEチャットから登録）
- [x] 会話履歴の保持（複数ターンの文脈を維持）
- [x] 位置情報取得（地域別天気API連携）
- [x] 管理者2要素認証（ID/PASS + LINE OTP）
- [x] 管理者ログインページ（/admin-login）
- [x] 管理者パスワード設定UI（/admin）

## 残タスク

- [ ] 管理者権限をDBで付与（usersテーブルのroleをadminに変更）
- [x] リッチメニュー画像の圧縮（413エラー解消）
- [ ] 定時プッシュ通知の有効化（TEST_MODE_DISABLE_SCHEDULED_DELIVERY = false）
- [ ] テストユーザーへの案内開始

## バグ修正・UI改善（追加）

- [x] 管理画面（Admin.tsx）にログアウトボタンを追加（2要素認証テストのため）
- [x] LIFF環境でセッション切れ時にManusサインイン画面にリダイレクトされる問題を修正（main.tsxのグローバルエラーハンドラーをLINE内ブラウザ対応に修正）
- [x] LIFF環境でセッション切れ時にHome.tsxで自動的にLINEログインを再試行する機能を追加
- [x] リッチメニュー画像を2500x1686px（LINE公式許可サイズ）にリサイズして400エラーを解消

## 仕様変更（2026-04-01）

- [x] リッチメニュー「冷蔵庫管理」ボタン → LIFF遷移ではなくLINEトーク返信（冷蔵庫の中身一覧を返信）に変更
- [x] リッチメニュー「買い物リスト」ボタン → LIFF遷移ではなくLINEトーク返信（買い物リスト一覧を返信）に変更
- [x] リッチメニュー「家族設定」ボタン → ダッシュボードへのLIFF遷移に変更
- [ ] LINEログインループ問題の根本解決（LIFF内でliff.loginが機能しない問題）
- [x] リッチメニュー「家族設定」ボタンを「ダッシュボードへ」に変更（画像・コード両方）
- [x] 献立の時間帯判定バグ修正（22時なのに夕食提案している）→ 21時以降は翌日の朝食提案に変更
- [x] 冷蔵庫・買い物リストのLINE返信が機能しない問題を修正（IDが2つある問題の対処）

## 2026-04-02 追加タスク

- [x] 冷蔵庫の中身・買い物リストがLINEで正しく表示されない問題の根本修正（AIが代わりに返答してしまっている）
- [x] 冷蔵庫食材追加の会話フロー実装：「玉ねぎ追加して」→「何個追加する？今 X個残っているけど、それに追加で良い？」→「はい」→DBに正しく反映

## 2026-04-02 緊急修正

- [ ] 本番サーバーのLINE Webhookで冷蔵庫・買い物リストが正しく表示されない根本原因を特定・修正
- [ ] テストデータクリア（fridge_items, shopping_list_items, menu_plans, line_conversation_historyを全削除）
- [ ] 重複ユーザーID問題の解決（userId=1とuserId=570001が同一人物）
