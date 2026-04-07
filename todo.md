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

## 会話ベース時間帯対応・プロフィール拡張（2026-04-02）

- [x] line.ts: 「献立」キーワード時に時間帯に応じた確認質問を返す会話フローを実装（完了）
  - 朝〜昼（5〜15時）：「朝食/昼食の提案？それとも今夜の夕飯？」と聞く
  - 夕方以降（15〜22時）：「今晩の献立？それとも明日分まとめて？」と聞く
  - 夜（22時〜）：「明日の朝食？それとも明日の夕飯まで考える？」と聞く
  - 回答に応じて適切なmealTypeでgenerateMenuPlanを呼ぶ
- [ ] line.ts: pendingActionに「menu_type_selection」タイプを追加して選択待ち状態を管理
- [ ] drizzle/schema.ts: family_profilesテーブルにshoppingFrequency・cookingFrequencyカラムを追加
- [ ] DBマイグレーション実行
- [ ] server/db.ts: updateFamilyProfileにshoppingFrequency・cookingFrequencyを含める
- [ ] server/routers/family.ts: updateProfileにshoppingFrequency・cookingFrequencyを追加
- [ ] client/src/pages/Family.tsx: 「週の買い物回数」「週の自炊回数」セレクトを追加
- [ ] menu.ts: generateMenuPlanのプロンプトにshoppingFrequency・cookingFrequencyを活用

## 会話ベース時間帯対応・プロフィール拡張（2026-04-02）

- [x] line.ts: 「献立」キーワード時に時間帯に応じた確認質問を返す会話フローを実装（完了）
- [ ] line.ts: pendingActionに「menu_type_selection」タイプを追加して選択待ち状態を管理
- [ ] drizzle/schema.ts: family_profilesテーブルにshoppingFrequency・cookingFrequencyカラムを追加
- [ ] DBマイグレーション実行（pnpm drizzle-kit generate → webdev_execute_sql）
- [ ] server/db.ts: updateFamilyProfileにshoppingFrequency・cookingFrequencyを含める
- [ ] server/routers/family.ts: updateProfileにshoppingFrequency・cookingFrequencyを追加
- [ ] client/src/pages/Family.tsx: 「週の買い物回数」「週の自炊回数」セレクトを追加
- [ ] menu.ts: generateMenuPlanのプロンプトにshoppingFrequency・cookingFrequencyを活用

## 詳細プロフィール拡張（2026-04-02 第2弾）

- [ ] drizzle/schema.ts: family_profilesに追加カラム
  - shoppingDays: json（買い物曜日リスト、例: ["mon","wed","sat"] または "everyday"/"irregular"）
  - breakfastCookCount: int（週の朝食自炊回数）
  - lunchCookCount: int（週の昼食自炊回数）
  - dinnerCookCount: int（週の夕食自炊回数）
  - breakfastAttendees: json（朝食を食べる家族メンバーIDリスト）
  - lunchAttendees: json（昼食を食べる家族メンバーIDリスト）
  - dinnerAttendees: json（夕食を食べる家族メンバーIDリスト）
- [ ] DBマイグレーション実行
- [ ] server/db.ts: upsertFamilyProfileに新カラムを追加
- [ ] server/routers/family.ts: upsertProfileのzodスキーマに新フィールドを追加
- [ ] client/src/pages/Family.tsx: 詳細プロフィール入力UI
  - 買い物曜日（毎日/曜日選択/不定期）
  - 食事別自炊回数（朝・昼・夜）
  - 食事別参加メンバー（朝・昼・夜）
- [ ] menu.ts: generateMenuPlanのプロンプトに食事別人数・自炊回数を反映
- [ ] line.ts: 朝0回・昼0回なら朝食・昼食の提案選択肢を非表示
- [ ] line.ts: 週1〜2回の自炊なら「今日は自炊予定？」と確認してから献立生成

## ダッシュボードナビ変更・初回登録フロー（2026-04-02 第3弾）

- [x] line.ts: 404行目の未終端文字列リテラルを修正（既に正常動作確認済み）
- [x] Dashboard.tsx: 上部タブを「冷蔵庫・買い物リスト・レシピ」の3つに変更
- [x] Dashboard.tsx: 家族構成セクションと履歴セクションはタブ下のスクロールエリアに移動
- [x] line.ts: 新規ユーザー（家族未登録）が初回メッセージ送信時に家族構成登録を促すメッセージを送信
- [x] line.ts: 家族登録促進メッセージにダッシュボードへのリンクを含める

## 買い物リストキーワード認識修正（2026-04-02）

- [x] line.ts: 「買い物リスト購入済み」「買い物完了」などのキーワードで買い物リストを全チェック完了にする
- [x] line.ts: 「購入済み」キーワードが買い物リスト表示にマッチしてしまうバグを修正

## 買い物リスト購入済み一括削除（2026-04-02）

- [ ] ShoppingList.tsx: 「購入済みを削除」ボタンを追加（購入済みアイテムが1件以上ある場合に表示）
- [ ] server/routers/shopping.ts または family.ts: deleteCheckedItems ミューテーションを追加

## 冷蔵庫増減ボタン・買い物リスト登録バグ修正（2026-04-02）

- [ ] line.ts: 「買い物リストに登録して」が冷蔵庫に追加されてしまうバグを修正（冷蔵庫登録パターンの正規表現を厳密化）
- [ ] DB/API: fridge.updateQuantity ミューテーション追加（quantity文字列を増減）
- [ ] Dashboard.tsx: 冷蔵庫タブの削除ボタンを＋／－増減ボタンに変更
- [ ] Fridge.tsx: 冷蔵庫ページの削除ボタンを＋／－増減ボタンに変更

## 買い物リスト連続入力分割対応（2026-04-02）

- [ ] line.ts: 「ナス3本牛乳バター」のような連続入力をAIで食材ごとに分割して登録する

## 冷蔵庫登録数量解析バグ修正（2026-04-02）

- [ ] line.ts: 「300g」と入力した場合に「300個」と表示されるバグを修正（単位なし数字に「個」が付与されないよう修正）

## 冷蔵庫登録の曖昧な数量表現対応（2026-04-02）

- [ ] line.ts: 「半分くらい」「少し」「適量」「1本」などの曖昧な数量表現も受け付けるよう修正（数字なしのテキストも数量として保存）

## 管理画面：ユーザーのLINEトーク履歴閲覧機能（2026-04-02）

- [x] server/routers/admin.ts に getUserConversationHistory プロシージャを追加（lineUserId指定で履歴取得）
- [x] Admin.tsx のユーザー一覧テーブルに「トーク履歴」ボタンを追加
- [x] トーク履歴モーダルを実装（会話の吹き出し表示、日時付き）

## 音声メッセージ解析・復唱機能（2026-04-02）

- [ ] LINE Webhookで音声メッセージ（audio type）を受信できるようにする
- [ ] 音声ファイルをダウンロードしてWhisper APIで文字起こし
- [ ] 文字起こし結果をユーザーに復唱して確認を求める
- [ ] ユーザーが承認したら冷蔵庫登録などの処理を実行

## レシート画像アップロード→冷蔵庫自動登録機能（2026-04-02）

- [ ] LINE Webhookで画像メッセージ（image type）を受信
- [ ] 画像をダウンロードしてLLM（Vision API）で解析
- [ ] レシートから商品名・数量を抽出
- [ ] 抽出した商品を冷蔵庫に自動登録
- [ ] 買い物リストに存在する商品は購入済みにして冷蔵庫へ移行

## 買い物リストから冷蔵庫への移行機能（2026-04-02）

- [ ] LINEで買い物リストの購入確認時に「冷蔵庫へ移行」or「削除」を選択できるようにする
- [ ] ダッシュボードの買い物リスト削除ボタンを「冷蔵庫へ移行」or「削除」の2択に変更
- [ ] server/db.ts に moveShoppingItemToFridge 関数を追加
- [ ] 移行時に数量・単位を保持して冷蔵庫に登録


## バグ修正：LINE未連携ユーザーへの冷蔵庫追加

- [x] LINE連携済みだがgetFamilyMembersに間違ったuserIdを渡していたバグを修正（familyProfile.idを渡すように変更）
- [x] 「献立」送信時に毎回同じ家族情報登録メッセージが返る問題を修正（getFamilyMembersの引数バグが原因）

## 献立提案の会話ロジック改善

- [ ] 献立候補提示後に「1」「2」「3」のみの入力が来た場合、復唱確認を追加（「『1』とお送りいただきましたが、先ほどの献立候補から1番を選ぶということでしょうか？それとも1番のレシピを見たいということでしょうか？」）
- [ ] pendingActionに `menu_option_selection` タイプを追加（献立候補の選択待ち状態を保持）
- [ ] 献立候補提示時に選択肢情報をpendingActionに保存
- [ ] 復唱確認後の「はい」で献立選択を確定、「レシピ」で詳細レシピ生成

## 管理機能改善
- [x] 全LINEメッセージ（献立・冷蔵庫・買い物リスト含む）をトーク履歴に保存
- [x] handleFridgeRegistration内の全処理ルートでaddConversationMessage呼び出しを追加

## 今夜実装済み（2026-04-03）
- [x] 音声削除確認（はい）後にAI雑談に流れる問題を修正（handleFridgeRegistrationにStep 4削除処理を追加）
- [x] 冷蔵庫食材の表記ゆれ統合（normalizeIngredientName + findMatchingFridgeItem 関数追加）
- [x] 商品名正規化キャッシュDB（product_name_cache テーブル追加・ルールベース+LLMフォールバック）
- [x] レシート登録時に重複食材を新規登録せず数量更新に変更

## バグ修正（2026-04-03 朝）
- [ ] 長い食材リスト（「もやし きゅうり ほうれんそう...豚コマを追加して」）が途中で切れて「もを追加します」と誤認識される問題を修正
- [ ] 「献立考えた」などの類似キーワードに対してBotが無応答になる問題を修正

## 音声復唱強化・献立テーマ機能（2026-04-03）
- [ ] DBテーブル追加：menu_themes（献立テーマ履歴）、user_preferences（好みパターン）
- [ ] 音声復唱強化：LLMでパターン分類（追加/削除/在庫確認/献立/テーマ/家族好み/数量更新）→パターン別3択メッセージ生成
- [ ] 献立やり直しフロー：「やり直し」→テーマ収集→内部カテゴリ分類（主食/ジャンル/味付け/調理法/シーン）→再生成

## 会話精度バグ修正（2026-04-06）
- [ ] B-NEW1: 冷蔵庫登録で長い食材リスト（改行区切り・スペース区切り混在）が途中で切れて全件登録されないバグを修正
- [ ] B-NEW2: 献立候補提示後に「2」を送るとAI雑談（LLM意図判定）に流れるバグを修正
- [ ] B1: 音声「買い物リストへ追加して」がbought_item（買ってきた）に誤分類されるバグを修正
- [ ] B2/B3: 「やっぱり3にして」がquantity_update（数量更新）に誤分類されるバグを修正
- [ ] B4: ウェルカムメッセージの待機時間表示を「5〜15秒」→「30秒〜1分」に修正
- [ ] B5: キャンセル後に「献立」と送ると同じ選択肢が出て無限ループになる問題を防止

## 緊急対応・未実装機能（2026-04-06）
- [ ] アカウントマージ: userId=1170001にline_usersレコード追加（lineUserId=U3a978d44ad16e83f704e5130e7e3298f）
- [ ] 2段階認証のLINE送信復旧確認
- [ ] F1: 長い食材リスト途中切れ修正（LLMによる食材抽出の安定化）
- [ ] F2: 「献立考えた」などの類似キーワード無応答修正（menu_vague判定）
- [ ] F4: 買い物リスト購入済み一括削除ボタン（ダッシュボード）
- [ ] F5: 冷蔵庫の増減ボタン（＋/－）
- [ ] F6: 買い物リストから冷蔵庫への移行機能（購入済み→冷蔵庫 or 削除）
- [ ] F7: 週の買い物回数・自炊回数の入力（DBカラム追加・UI追加）
- [ ] F8: 買い物曜日・食事別自炊回数・食事別参加メンバー（DBマイグレーション）
- [ ] F9: 献立テーマ機能（やり直しフロー: テーマ収集→内部カテゴリ分類→再生成）
- [ ] F10: 献立生成プロンプトへの自炊回数反映（F7/F8完成後）

## 2026-04-06 追加タスク（ユーザー報告）

- [ ] DASH-BUG: ダッシュボードのトーク履歴にBOT返信が表示されない根本修正
- [ ] B4-FIX: ウェルカムメッセージの待機時間「数秒〜15秒」→「30秒〜1分」に修正

## 2026-04-07 追加タスク

- [ ] BUG: 食材追加時に既存の冷蔵庫データとマージされない（重複登録・上書きされない問題）
- [ ] LIFF外部サイト警告ポップアップの修正（LINE Developersのドメイン設定・LIFF設定見直し）
- [ ] 将来: 「離乳食」などの食事制約をAIに反映する機能（要件定義後に実装）
- [ ] 将来: テキスト入力→クイックリプライ化（朝食/昼食/夕食、はい/いいえなど）

## 課金UI Phase 1：献立テーマ設定・お弁当モード（2026-04-07）

### 献立テーマ設定画面（B）
- [x] THEME-1: MenuTheme.tsx 新規作成（/menu-theme ルート）
- [x] THEME-2: 中項目アコーディオン（健康・ライフステージ・節約・調理スタイル）
- [x] THEME-3: 詳細項目チェックボックス（各中項目の配下）
- [x] THEME-4: 無料ユーザーにはロックアイコン＋「プレミアム機能」バッジ表示
- [x] THEME-5: App.tsxにルート追加、ダッシュボードから遷移できるボタン追加

### お弁当モード設定画面（C）
- [x] BENTO-1: BentoMode.tsx 新規作成（/bento-mode ルート）
- [x] BENTO-2: 対象メンバー選択（家族メンバーから選択）
- [x] BENTO-3: お弁当箱サイズ選択（小・中・大）
- [x] BENTO-4: お弁当曜日設定（毎日/曜日選択/不定期）
- [x] BENTO-5: 前日仕込み可否トグル
- [x] BENTO-6: 夕食＋お弁当同時提案のプレビューUI（モックイメージ）
- [x] BENTO-7: 無料ユーザーにはロック表示＋アップグレード導線
- [x] BENTO-8: App.tsxにルート追加、ダッシュボードから遷移できるボタン追加

## 課金UI Phase 2：subscriptions DB・プレミアム判定・課金確認ポップアップ（2026-04-07）

- [x] SUB-1: subscriptionsテーブルをDBに適用（migration SQL実行）
- [x] SUB-2: 既存ユーザー全員にプレミアムプラン（plan=premium, status=active）を付与
- [x] SUB-3: tRPCにsubscription.getMyPlan クエリを追加（プレミアム判定を返す）
- [x] SUB-4: MenuTheme.tsxのIS_PREMIUMモックを実際のtrpcクエリに差し替え
- [x] SUB-5: BentoMode.tsxのIS_PREMIUMモックを実際のtrpcクエリに差し替え
- [x] SUB-6: 無料期間終了後にレ点チェックしようとした際の課金確認ポップアップを実装
  - ポップアップ内容：「課金対象プランへの追加になりますがよろしいですか？」
  - 「はい（プレミアムへ）」→ アップグレードページへ遷移（後でStripe連携）
  - 「キャンセル」→ ポップアップを閉じる

## 最終修正フェーズ：全般エラー検知・オーナー通知（後回し）

- [ ] NOTIFY-1: ログインエラー発生時にオーナーへLINE通知（ユーザー名・エラー内容・発生時刻）
- [ ] NOTIFY-2: 「ログイン中...」が30秒以上続いた場合のタイムアウト検知・通知
- [ ] NOTIFY-3: LINE Webhookエラー（500系・署名検証失敗・タイムアウト）発生時にオーナーへ通知
- [ ] NOTIFY-4: AI生成エラー（OpenAI APIエラー・レートリミット）発生時にオーナーへ通知
- [ ] NOTIFY-5: DB接続エラー発生時にオーナーへ通知
- [ ] NOTIFY-6: 定時配信バッチ失敗時にオーナーへ通知
- [ ] NOTIFY-7: 通知内容にエラー種別・ユーザー情報（利用可能な場合）・発生時刻・スタックトレースを含める
