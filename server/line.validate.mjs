// LINE APIトークン検証スクリプト
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const secret = process.env.LINE_CHANNEL_SECRET;

console.log('TOKEN set:', !!token && token.length > 10);
console.log('SECRET set:', !!secret && secret.length > 10);

if (!token) {
  console.error('LINE_CHANNEL_ACCESS_TOKEN が未設定です');
  process.exit(1);
}

const res = await fetch('https://api.line.me/v2/bot/info', {
  headers: { 'Authorization': 'Bearer ' + token }
});
const data = await res.json();
console.log('LINE Bot info:', JSON.stringify(data, null, 2));

if (data.userId) {
  console.log('✅ LINE APIトークン有効 - Bot名:', data.displayName);
} else {
  console.error('❌ LINE APIトークン無効:', data);
  process.exit(1);
}
