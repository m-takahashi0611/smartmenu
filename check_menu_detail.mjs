import https from 'https';

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function lineApiRequest(method, apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.line.me',
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// 野崎めぐみのLINE IDに設定されているリッチメニューを確認
const userId = 'U16b177433495e9e03aa2a267632e3fab';
const res = await lineApiRequest('GET', `/v2/bot/user/${userId}/richmenu`);
console.log('=== 野崎めぐみの現在のリッチメニュー ===');
console.log(res.status, JSON.stringify(res.data, null, 2));

// プレミアムメニューの詳細を確認
const premiumMenuId = 'richmenu-c2f82b0b7889080cddb68dbfe9bb1b2e';
const menuDetail = await lineApiRequest('GET', `/v2/bot/richmenu/${premiumMenuId}`);
console.log('\n=== プレミアムメニューの詳細 ===');
console.log(menuDetail.status, JSON.stringify(menuDetail.data, null, 2));
