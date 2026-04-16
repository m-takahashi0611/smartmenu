import 'dotenv/config';
import axios from 'axios';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineUserId = 'U3a978d44ad16e83f704e5130e7e3298f';
const displayName = '高橋導成';

async function sendLineMessage(to, messages) {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to, messages },
    { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function main() {
  console.log('ウェルカムメッセージを送信中...');

  // 1: テキストウェルカム
  await sendLineMessage(lineUserId, [
    {
      type: 'text',
      text: `🍽️ こんにちは、${displayName}さん！\n献立日和～coto coto～へようこそ！\n毎日の献立をAIがご提案します。\n「今日何作ろう…」のお悩みから解放されましょう♪\n⚠️ AIの応答には30秒～1分ほどかかる場合があります。返信が来るまで少々お待ちください🙏`,
    },
  ]);
  console.log('1/5 テキスト送信完了');

  // 2: キャラクター画像
  await sendLineMessage(lineUserId, [
    { type: 'text', text: '🎉 はじめましょう！' },
    {
      type: 'image',
      originalContentUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/mori_kitchen_colorful_b246d0d3.jpg',
      previewImageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/mori_kitchen_colorful_b246d0d3.jpg',
    },
  ]);
  console.log('2/5 キャラクター画像送信完了');

  // 3: 使い方画像
  await sendLineMessage(lineUserId, [
    {
      type: 'image',
      originalContentUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_B_steps_v2-9A8LjBpnEDhAuoDHCav52d.png',
      previewImageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/welcome_B_steps_v2-9A8LjBpnEDhAuoDHCav52d.png',
    },
    {
      type: 'image',
      originalContentUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_02_fridge-d3bkgkRcZQTBCDuaN6bSye.png',
      previewImageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_02_fridge-d3bkgkRcZQTBCDuaN6bSye.png',
    },
    {
      type: 'image',
      originalContentUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_03_commands-By9oD4t2reaRVJFbjRnUSq.png',
      previewImageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663223584738/cX9NcQmb35cA4KMDW3eQdK/new_welcome_03_commands-By9oD4t2reaRVJFbjRnUSq.png',
    },
  ]);
  console.log('3/5 使い方画像送信完了');

  // 4: 設定ボタン
  await sendLineMessage(lineUserId, [
    {
      type: 'template',
      altText: '設定を始めましょう！',
      template: {
        type: 'buttons',
        text: 'ガイドを読み終わったら、さっそく設定を始めましょう！',
        actions: [
          {
            type: 'uri',
            label: '⚙️ 設定を始める →',
            uri: 'https://www.kondatebiyori.com',
          },
        ],
      },
    },
  ]);
  console.log('4/5 設定ボタン送信完了');

  // 5: カード登録促進 Flex Message
  await sendLineMessage(lineUserId, [
    {
      type: 'flex',
      altText: '🎁 20日間 全機能無料体験のご案内',
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎁 20日間 全機能無料体験',
              weight: 'bold',
              size: 'lg',
              color: '#ffffff',
              align: 'center',
            },
          ],
          backgroundColor: '#FF6B35',
          paddingAll: '16px',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'カード登録するだけで\nプレミアム機能が20日間タダ！',
              wrap: true,
              size: 'sm',
              color: '#555555',
              align: 'center',
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                { type: 'text', text: '✓ AI高精度献立（天気・栄養考慮）', size: 'sm', color: '#333333' },
                { type: 'text', text: '✓ 買い物リスト自動生成', size: 'sm', color: '#333333' },
                { type: 'text', text: '✓ チラシ・レシート解析', size: 'sm', color: '#333333' },
                { type: 'text', text: '✓ 献立テーマ（ダイエットなど）', size: 'sm', color: '#333333' },
                { type: 'text', text: '✓ お弁当モード', size: 'sm', color: '#333333' },
              ],
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'text',
              text: '20日後は月額480円 ／ いつでも解約OK',
              size: 'xs',
              color: '#aaaaaa',
              align: 'center',
              margin: 'md',
            },
          ],
          paddingAll: '16px',
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '✨ 今すぐ無料で始める →',
                uri: 'https://www.kondatebiyori.com/plan',
              },
              style: 'primary',
              color: '#FF6B35',
              height: 'sm',
            },
          ],
          paddingAll: '12px',
        },
      },
    },
  ]);
  console.log('5/5 カード登録促進Flexメッセージ送信完了');
  console.log('✅ ウェルカムメッセージ全送信完了！');
}

main().catch(err => {
  console.error('エラー:', err.response?.data ?? err.message);
  process.exit(1);
});
