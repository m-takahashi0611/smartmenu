# SmartMenu デプロイ手順書

**運営法人：** SELF-CONSULTING  
**作成日：** 2026年3月28日

---

## 全体の流れ

```
Step 1: GitHubリポジトリを作成してコードをプッシュ
Step 2: Firebase CLIでCloud Functionsをデプロイ
Step 3: VercelでLIFFアプリをデプロイ
Step 4: LINE DevelopersでWebhook URLとLIFF IDを設定
Step 5: 動作確認
```

---

## Step 1: GitHubリポジトリの作成

### 1-1. リポジトリ作成

1. [GitHub](https://github.com) にログイン
2. 「New repository」をクリック
3. リポジトリ名: `smartmenu`（プライベート推奨）
4. 「Create repository」をクリック

### 1-2. コードをプッシュ

```bash
cd smartmenu-firebase
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/smartmenu.git
git push -u origin main
```

> ⚠️ `.gitignore` に `.env` が含まれているため、APIキーは自動的に除外されます。

---

## Step 2: Firebase Cloud Functionsのデプロイ

### 2-1. Firebase CLIのインストール・ログイン

```bash
npm install -g firebase-tools
firebase login
```

### 2-2. プロジェクトの確認

```bash
firebase use smartmenu-63f5e
```

### 2-3. シークレットの設定

```bash
# LINE Channel Secret
firebase functions:secrets:set LINE_CHANNEL_SECRET
# 入力値: b1587760b6e59b8d1779c6035e9cf5d9

# LINE Channel Access Token
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
# 入力値: uXngkbLhIft8IuatXE3IIa8DkQHkgt7qpEKShM3nOqvZGILiimjYmHpo5fOj1hXT0+...（全文）

# OpenAI API Key
firebase functions:secrets:set OPENAI_API_KEY
# 入力値: sk-proj-OLkrL6uOC60HMsVIbJgQUTonCR3cv-...（全文）
```

### 2-4. Firestoreのルールとインデックスをデプロイ

```bash
firebase deploy --only firestore
```

### 2-5. Cloud Functionsをビルド・デプロイ

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

デプロイ完了後、以下のURLが発行されます：

| Function | URL |
|---|---|
| LINE Webhook | `https://asia-northeast1-smartmenu-63f5e.cloudfunctions.net/lineWebhook` |
| 献立生成（Callable） | `generateMenu`（LIFFから直接呼び出し） |
| 献立履歴（Callable） | `getMenuHistory`（LIFFから直接呼び出し） |
| 自動配信（Scheduler） | 毎朝7時に自動実行 |

---

## Step 3: VercelでLIFFアプリをデプロイ

### 3-1. Vercelアカウントの準備

1. [Vercel](https://vercel.com) にGitHubアカウントでログイン

### 3-2. プロジェクトのインポート

1. 「New Project」をクリック
2. GitHubの `smartmenu` リポジトリを選択
3. **Root Directory** を `liff` に設定（重要）
4. Framework Preset: `Vite`

### 3-3. 環境変数の設定

Vercelの「Settings → Environment Variables」で以下を設定：

| 変数名 | 値 |
|---|---|
| `VITE_LIFF_ID` | （Step 4で取得後に設定） |
| `VITE_FIREBASE_API_KEY` | `AIzaSyDRtRD0LgR6R6btJWo3BLoaTfH8JKeghvQ` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `smartmenu-63f5e.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `smartmenu-63f5e` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `smartmenu-63f5e.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `731386217506` |
| `VITE_FIREBASE_APP_ID` | `1:731386217506:web:c6f39c1c65701964f9f67b` |

4. 「Deploy」をクリック

デプロイ完了後、VercelのURL（例: `https://smartmenu-xxx.vercel.app`）が発行されます。

> 独自ドメインを使う場合は「Settings → Domains」から設定できます。

---

## Step 4: LINE Developersの設定

### 4-1. Webhook URLの登録

1. [LINE Developers](https://developers.line.biz/ja/) にログイン
2. SmartMenu（仮）→ Messaging API設定 を開く
3. **Webhook URL** に以下を入力：
   ```
   https://asia-northeast1-smartmenu-63f5e.cloudfunctions.net/lineWebhook
   ```
4. **Webhookの利用**: ON に切り替え
5. 「検証」ボタンで疎通確認

### 4-2. LIFFアプリの登録

1. SmartMenu（仮）→ LIFF タブを開く
2. 「追加」をクリック
3. 以下を設定：

| 項目 | 値 |
|---|---|
| LIFFアプリ名 | SmartMenu |
| サイズ | Full |
| エンドポイントURL | VercelのURL（例: `https://smartmenu-xxx.vercel.app`） |
| スコープ | `profile`, `openid` にチェック |
| ボットリンク機能 | On（Aggressive） |

4. 「追加」をクリック
5. 発行された **LIFF ID**（例: `2009624938-xxxxxxxx`）をコピー

### 4-3. LIFF IDをVercelに設定

1. Vercelの「Settings → Environment Variables」を開く
2. `VITE_LIFF_ID` に LIFF IDを設定
3. 「Redeploy」で再デプロイ

---

## Step 5: 動作確認

### 5-1. LINEでフォロー

1. LINEアプリで `@073ajwtq` を検索してフォロー
2. ウェルカムメッセージが届くことを確認

### 5-2. LIFFアプリの確認

1. LINEのウェルカムメッセージのリンクをタップ
2. LIFF画面が開くことを確認
3. 家族構成・冷蔵庫の食材を登録

### 5-3. 献立生成の確認

1. LINEで「献立」と送信
2. AIが生成した献立が返信されることを確認

### 5-4. 自動配信の確認

- 毎朝7時（JST）に自動配信されます
- Firebase Console → Functions → ログ で確認可能

---

## トラブルシューティング

| 症状 | 確認箇所 |
|---|---|
| Webhookの検証が失敗する | LINE_CHANNEL_SECRETが正しく設定されているか確認 |
| 献立が生成されない | OPENAI_API_KEYが正しく設定されているか確認 |
| LIFFが開かない | エンドポイントURLがHTTPSか、LIFF IDが正しいか確認 |
| 自動配信されない | Firebase ConsoleでScheduler Functionのログを確認 |

---

## 管理者の設定

初回ログイン後、Firebase ConsoleのFirestoreから管理者権限を付与できます：

```
Firestore → users → {あなたのUID} → role フィールドを "admin" に変更
```
