import { config } from 'dotenv';
import https from 'https';
config();

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = 'U3a978d44ad16e83f704e5130e7e3298f'; // 管理者のLINE ID

console.log('Token length:', token ? token.length : 0);
console.log('Sending test message to:', lineUserId);

const body = JSON.stringify({
  to: lineUserId,
  messages: [
    {
      type: 'text',
      text: '【テスト】管理者ログイン認証テスト\n\n認証コード：999999\n\nこれはテストメッセージです。',
    },
  ],
});

const req = https.request(
  {
    hostname: 'api.line.me',
    path: '/v2/bot/message/push',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', data);
    });
  }
);
req.on('error', (err) => console.error('Error:', err));
req.write(body);
req.end();
