const { chromium } = require('playwright');
const path = require('path');

(async () => {
  require('fs').mkdirSync('shots', { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message + '\n' + e.stack));
  const url = 'file:///' + path.resolve('dist/index.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });
  await page.bringToFront();
  await page.waitForTimeout(2300);
  await page.screenshot({ path: 'shots/00-idle.png' });

  const shot = async (phase, t, advance, name) => {
    await page.evaluate(([p, tt]) => window.__demo.skipTo(p, tt), [phase, t]);
    await page.evaluate((s) => window.__demo.advance(s), advance);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `shots/${name}.png` });
  };

  await shot(1, 8, 4, '01-p1');
  await shot(2, 1.6, 3.2, '02-p2');
  await shot(3, 6, 6, '03-p3');

  const info = await page.evaluate(() => ({
    fps: document.getElementById('fps').textContent,
    phase: window.__demo.sim.state.phase,
    enemies: window.__demo.game.enemies.length,
    boss: window.__demo.game.bossVisible,
    blocked: window.__demo.sim.state.metrics.blocked,
    shield: Math.round(window.__demo.sim.state.metrics.shield),
  }));
  console.log(JSON.stringify(info, null, 2));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
