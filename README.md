# SmartMenu - AI献立提案サービス

LINEを通じて毎朝AIが献立を提案するサービスです。

## システム構成

```
【ユーザー側】
LINEアプリ
  │
  ├── メッセージ受信（毎日の献立）
  │     └── Firebase Cloud Functions が自動送信（毎朝7時）
  │
  └── ボタンタップ → LIFF画面が開く
        └── Vercel が画面データを提供
              └── 入力データは Firebase（Firestore）に保存

【管理者側】
Firebase Console
  └── ユーザー管理・配信ログ確認
```

## ディレクトリ構成

```
smartmenu-firebase/
├── firebase.json          # Firebase設定
├── firestore.rules        # Firestoreセキュリティルール
├── firestore.indexes.json # Firestoreインデックス
├── functions/             # Cloud Functions（バックエンド）
│   ├── src/
│   │   ├── index.ts       # エントリーポイント
│   │   ├── line/
│   │   │   ├── webhook.ts # LINE Webhook受信
│   │   │   └── scheduler.ts # 毎朝7時の自動配信
│   │   └── menu/
│   │       └── generate.ts # AI献立生成
│   └── ENV_SETUP.md       # シークレット設定手順
├── liff/                  # LIFF Reactアプリ（Vercelにデプロイ）
│   ├── src/
│   │   ├── pages/         # 各画面
│   │   ├── hooks/         # Firestoreフック
│   │   ├── components/    # 共通コンポーネント
│   │   └── lib/firebase.ts # Firebase初期化
│   └── ENV_SETUP.md       # 環境変数設定手順
└── shared/
    └── types.ts           # 共有型定義
```

## デプロイ手順

### 1. Firebase CLIのセットアップ

```bash
npm install -g firebase-tools
firebase login
firebase use smartmenu-63f5e
```

### 2. Cloud Functionsのシークレット設定

```bash
firebase functions:secrets:set LINE_CHANNEL_SECRET
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
firebase functions:secrets:set OPENAI_API_KEY
```

詳細は `functions/ENV_SETUP.md` を参照。

### 3. Cloud Functionsのデプロイ

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

デプロイ後、以下のURLが発行されます：
- LINE Webhook: `https://asia-northeast1-smartmenu-63f5e.cloudfunctions.net/lineWebhook`

### 4. LIFFアプリのデプロイ（Vercel）

```bash
cd liff
npm install
```

Vercelにデプロイ：
```bash
npx vercel --prod
```

または GitHub連携でVercelに自動デプロイ設定。

環境変数は `liff/ENV_SETUP.md` を参照してVercelのダッシュボードで設定。

### 5. LINE設定

1. **Webhook URL登録**：
   - LINE Developers → SmartMenu → Messaging API設定
   - Webhook URL: `https://asia-northeast1-smartmenu-63f5e.cloudfunctions.net/lineWebhook`
   - Webhookの利用: ON

2. **LIFF登録**：
   - LINE Developers → SmartMenu → LIFF → 追加
   - エンドポイントURL: VercelのデプロイURL
   - スコープ: `profile`, `openid`
   - 発行されたLIFF IDを `VITE_LIFF_ID` に設定

## Firestoreデータ構造

```
users/{uid}/
  familyProfile/profile    # 家族の基本設定
  familyMembers/{id}       # 家族メンバー
  fridgeItems/{id}         # 冷蔵庫の食材
  stores/{id}              # マイ店舗
  menuPlans/{id}           # 献立プラン
  shoppingItems/{id}       # 買い物リスト

lineUsers/{lineUserId}     # LINE連携情報
deliveryLogs/{id}          # 配信ログ
```

## 技術スタック

| 項目 | 技術 |
|---|---|
| バックエンド | Firebase Cloud Functions（Node.js 20 / TypeScript） |
| データベース | Firebase Firestore |
| フロントエンド | React 18 + Vite + Tailwind CSS |
| ホスティング（LIFF） | Vercel |
| AI | OpenAI GPT-4o-mini |
| LINE連携 | LINE Messaging API + LIFF SDK |
