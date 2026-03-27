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
