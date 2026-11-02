const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  fs.mkdirSync('docs', { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file:///' + path.resolve('dist/index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(2400);

  const snap = async (file) => {
    await page.screenshot({ path: `docs/${file}`, type: 'jpeg', quality: 88 });
  };

  await snap('preview.jpg');

  await page.evaluate(() => window.__demo.skipTo(1, 8));
  await page.evaluate(() => window.__demo.advance(5));
  await snap('phase1.jpg');
  await snap('cockpit.jpg');

  await page.evaluate(() => window.__demo.skipTo(2, 1.6));
  await page.evaluate(() => window.__demo.advance(3.2));
  await snap('phase2.jpg');

  await page.evaluate(() => window.__demo.skipTo(3, 6));
  await page.evaluate(() => window.__demo.advance(7));
  await snap('phase3.jpg');

  await page.evaluate(() => window.__demo.skipTo(1, 34));
  await page.evaluate(() => window.__demo.advance(96));
  await page.waitForTimeout(3000);
  await snap('result.jpg');

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(4200);
  await page.evaluate(() => window.__demo.applyTheme('city', { instant: true }));
  await page.waitForTimeout(1600);
  await snap('city.jpg');

  await page.evaluate(() => window.__demo.setCinematic(true));
  await page.waitForTimeout(1600);
  await snap('cinematic.jpg');

  console.log('captured; errors:', errors.length ? errors : 'none');
  await browser.close();
})();
