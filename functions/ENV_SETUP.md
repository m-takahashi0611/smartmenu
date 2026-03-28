# Cloud Functions シークレット設定

Firebase Cloud Functionsでは `firebase functions:secrets:set` コマンドでシークレットを設定します。

```bash
firebase functions:secrets:set LINE_CHANNEL_SECRET
# → b1587760b6e59b8d1779c6035e9cf5d9

firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
# → uXngkbLhIft8IuatXE3IIa8DkQHkgt7qpEKShM3nOqvZGILiimjYmHpo5fOj1hXT0+...

firebase functions:secrets:set OPENAI_API_KEY
# → sk-proj-OLkrL6uOC60HMsVIbJgQUTonCR3cv-...
```

設定後、`firebase deploy --only functions` でデプロイしてください。
