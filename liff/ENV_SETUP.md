# LIFF 環境変数設定

Vercelにデプロイする際は以下の環境変数を設定してください。

```
VITE_LIFF_ID=（LINE DevelopersコンソールのLIFF IDを設定）
VITE_FIREBASE_API_KEY=AIzaSyDRtRD0LgR6R6btJWo3BLoaTfH8JKeghvQ
VITE_FIREBASE_AUTH_DOMAIN=smartmenu-63f5e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=smartmenu-63f5e
VITE_FIREBASE_STORAGE_BUCKET=smartmenu-63f5e.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=731386217506
VITE_FIREBASE_APP_ID=1:731386217506:web:c6f39c1c65701964f9f67b
```

ローカル開発時は `.env.local` ファイルを作成してください（.gitignoreに追加済み）。
