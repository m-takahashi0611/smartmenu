import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  headless: true
});
const page = await browser.newPage();
await page.setContent('<html><body style="background:white;font-size:20px">Hello PNG</body></html>');
const buf = await page.screenshot({ type: 'png' });
console.log('PNG size:', buf.length, 'bytes - OK');
await browser.close();
