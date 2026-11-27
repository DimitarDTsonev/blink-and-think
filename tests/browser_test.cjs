// UI integration tests use a shared simulated device, never a physical board.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { PreviewDevice } = require('../preview/demo.js');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox']
  });
  const contexts = [],
    errors = [],
    externalRequests = [];
  const boot = Date.now(),
    device = new PreviewDevice(() => Date.now() - boot);
  let failNetwork = false,
    presses = 0,
    wifiBody;
  const screenshots =
    process.env.SCREENSHOT_DIR || path.join(require('node:os').tmpdir(), 'blink-think-qa');
  fs.mkdirSync(screenshots, { recursive: true });
  async function capture(p, filename, fullPage = true) {
    await p.evaluate(() => scrollTo(0, 0));
    await p.screenshot({ path: path.join(screenshots, filename), fullPage });
  }
  async function page(width = 1440, url = '/') {
    const context = await browser.newContext({
      viewport: { width, height: width > 800 ? 1050 : 844 },
      isMobile: width < 800,
      hasTouch: width < 800
    });
    contexts.push(context);
    await context.route('**/*', async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      if (u.origin !== 'http://blink.test') {
        externalRequests.push(u.href);
        return route.abort();
      }
      if (u.pathname.startsWith('/api/')) {
        if (failNetwork) return route.abort();
        const data =
          req.method() === 'POST'
            ? Object.fromEntries(new URLSearchParams(req.postData()))
            : undefined;
        if (u.pathname === '/api/networks')
          return route.fulfill({
            json: {
              saved: 'Home_Lab',
              networks: [
                { ssid: 'Home-Lab', channel: 6 },
                { ssid: 'Home-Lab', channel: 11 }
              ]
            }
          });
        if (u.pathname === '/api/wifi') {
          assert.equal(req.headers()['x-setup'], '1');
          wifiBody = data;
          return route.fulfill({ json: { saved: true } });
        }
        if (u.pathname === '/api/press') presses++;
        const result = device.request(u.pathname, req.headers()['x-player-id'], data);
        return route.fulfill({ status: result.status, json: result.body });
      }
      const relative =
        u.pathname === '/'
          ? 'web/index.html'
          : u.pathname === '/setup'
            ? 'web/setup.html'
            : u.pathname === '/preview/'
              ? 'preview/index.html'
              : `web${u.pathname}`;
      const file = path.join(root, relative);
      const mime = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml'
      }[path.extname(file)];
      if (!mime || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ contentType: mime, body: fs.readFileSync(file) });
    });
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://blink.test${url}`);
    return p;
  }
  const fit = async (p) =>
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      'Horizontal overflow'
    );
  try {
    const desktop = await page();
    await desktop.waitForFunction(
      () => document.getElementById('connection').textContent === 'Board connected'
    );
    await fit(desktop);
    await capture(desktop, 'desktop-home.png');
    await desktop.locator('#name').fill('Alex');
    await desktop.locator('a[data-nav="play"]').click();
    await desktop.locator('#speed').selectOption('500');
    await desktop.locator('#start').click();
    await desktop.waitForFunction(
      () => document.getElementById('title').textContent === 'Here we go.'
    );
    const phone = await page(390, '/#play');
    await phone.waitForFunction(() => document.getElementById('start').disabled);
    assert.equal(await phone.locator('[data-color]:disabled').count(), 4);
    device.game.phase = 'showing';
    device.shown = 0;
    device.since = device.clock();
    device.illuminated = true;
    await desktop.waitForFunction(
      () => document.getElementById('title').textContent === 'Watch the pattern.'
    );
    assert.equal(await desktop.locator('[data-color]:disabled').count(), 4);
    device.game.phase = 'input';
    device.sequence = [0, 1, 3];
    device.since = device.clock();
    await desktop.waitForFunction(() => !document.querySelector('[data-color]').disabled);
    await desktop.locator('[data-color="0"]').evaluate((b) => {
      b.click();
      b.click();
    });
    await desktop.waitForFunction(() =>
      document.getElementById('caption').textContent.startsWith('1 of 3')
    );
    assert.equal(presses, 1);
    await desktop.locator('[data-color="2"]').click();
    await desktop.waitForFunction(() => document.getElementById('score').textContent === '1.5');
    assert.match(await desktop.locator('#award').textContent(), /other green/);
    await desktop.locator('#main').focus();
    await desktop.keyboard.press('3');
    await desktop.waitForFunction(
      () => document.getElementById('title').textContent === 'Nicely remembered.'
    );
    assert.equal(await desktop.locator('#score').textContent(), '2.5');
    await capture(desktop, 'desktop-game.png');
    await desktop.reload();
    await desktop.waitForFunction(() => !document.getElementById('stop').hidden);
    await desktop.locator('#stop').click();
    await phone.waitForFunction(() => !document.getElementById('start').disabled);
    await phone.locator('#name').fill('Morgan');
    await phone.locator('#mode').selectOption('1');
    await phone.locator('#start').click();
    await phone.waitForFunction(
      () => document.getElementById('title').textContent === 'Here we go.'
    );
    device.game.phase = 'input';
    device.since = device.clock();
    await phone.waitForFunction(() =>
      document.getElementById('hint').textContent.includes('backwards')
    );
    await fit(phone);
    await capture(phone, 'mobile-game.png');
    failNetwork = true;
    await phone.waitForFunction(() => !document.getElementById('networkNotice').hidden);
    assert.equal(await phone.locator('[data-color]:disabled').count(), 4);
    failNetwork = false;
    await phone.waitForFunction(() => document.getElementById('networkNotice').hidden);
    await phone.locator('#stop').click();
    await phone.locator('[data-nav="studio"]').click();
    await phone.locator('[data-led="1"]').click(); // One tap acquires an idle board.
    await phone.waitForFunction(
      () => document.querySelector('[data-led="1"]').getAttribute('aria-pressed') === 'true'
    );
    assert.equal(device.manual.mask, 2);
    await desktop.locator('[data-nav="studio"]').click();
    await desktop.waitForFunction(() => document.querySelector('[data-led]').disabled);
    await phone.locator('#brightness').fill('60');
    await phone.locator('#brightness').dispatchEvent('change');
    await phone.waitForFunction(() => !document.getElementById('brightness').disabled);
    assert.equal(device.manual.brightness, 60);
    for (const effect of ['1', '2', '3', '4', '5']) {
      await phone.locator('#effect').selectOption(effect);
      await phone.waitForFunction(() => !document.getElementById('effect').disabled);
      assert.equal(device.manual.effect, Number(effect));
    }
    await phone.locator('#allOn').click();
    await phone.waitForFunction(() => document.querySelectorAll('[data-led].lit').length === 4);
    await phone.locator('#testLeds').click();
    await phone.waitForFunction(
      () => document.getElementById('testLeds').textContent === 'Testing the lights…'
    );
    assert.equal(await phone.locator('[data-led]:disabled').count(), 4);
    for (const color of [0, 1, 3, 2]) {
      await phone.waitForFunction(
        (c) => document.querySelector(`[data-led="${c}"]`).classList.contains('lit'),
        color
      );
      const elapsed = device.clock() - device.manual.testStart;
      assert(elapsed % 1800 < 1500 && [0, 1, 3, 2][Math.floor(elapsed / 1800)] === color);
    }
    await phone.waitForFunction(() => !document.getElementById('testLeds').disabled);
    await phone.locator('#testLeds').click();
    await phone.waitForFunction(() =>
      document.querySelector('[data-led="0"]').classList.contains('lit')
    );
    await phone.locator('#allOff').click();
    await phone.waitForFunction(() => document.querySelectorAll('[data-led].lit').length === 0);
    assert.equal(device.manual.testing, false);
    await capture(phone, 'mobile-studio.png');
    await phone.locator('#releaseStudio').click();
    await desktop.waitForFunction(() => !document.querySelector('[data-led]').disabled);
    await desktop.locator('#allOn').click();
    await desktop.waitForFunction(() => document.querySelectorAll('[data-led].lit').length === 4);
    await capture(desktop, 'desktop-studio.png');
    await desktop.locator('#releaseStudio').click();
    await desktop.locator('[data-nav="connect"]').click();
    assert.equal(await desktop.locator('#qrCode svg').count(), 1);
    assert.equal(await desktop.locator('#deviceAddress').getAttribute('href'), 'http://192.0.2.10');
    await capture(desktop, 'desktop-connect.png');
    for (const view of ['home', 'play', 'studio', 'connect']) {
      await phone.goto(`http://blink.test/#${view}`);
      await fit(phone);
      await phone.setViewportSize({ width: 320, height: 760 });
      await fit(phone);
      await phone.setViewportSize({ width: 390, height: 844 });
    }
    await phone.goto('http://blink.test/#home');
    await phone.waitForFunction(
      () => document.getElementById('connection').textContent === 'Board connected'
    );
    await capture(phone, 'mobile-home.png', false);
    const setup = await page(390, '/setup');
    await setup.waitForFunction(() => !document.getElementById('networks').disabled);
    assert.equal(await setup.locator('#networks option').count(), 2);
    await setup.locator('#networks').selectOption('Home-Lab');
    await setup.locator('[name="password"]').fill('test-only-password');
    await setup.locator('#showPassword').click();
    assert.equal(await setup.locator('#password').getAttribute('type'), 'text');
    await setup.locator('#submit').click();
    await setup.waitForFunction(() => !document.getElementById('savedSteps').hidden);
    assert.equal(wifiBody.ssid, 'Home-Lab');
    await fit(setup);
    const demo = await page(1440, '/preview/');
    await demo.waitForFunction(
      () => document.getElementById('connection').textContent === 'Preview ready'
    );
    assert.equal(await demo.locator('#demoBanner').isVisible(), true);
    await demo.locator('[data-nav="play"]').click();
    await demo.locator('#start').click();
    await demo.waitForFunction(() => document.querySelectorAll('[data-virtual].lit').length === 1);
    await demo.locator('#stop').click();
    await demo.locator('[data-nav="connect"]').click();
    assert.equal(await demo.locator('#copyLink').isDisabled(), true);
    // A downloaded single HTML file must work without a server or sibling assets.
    const offlineContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(offlineContext);
    await offlineContext.route(/^https?:\/\//, (route) => {
      externalRequests.push(route.request().url());
      return route.abort();
    });
    const offline = await offlineContext.newPage();
    offline.on('pageerror', (error) => errors.push(error.message));
    await offline.goto(
      require('node:url').pathToFileURL(path.join(root, 'preview/index.html')).href
    );
    await offline.waitForFunction(
      () => document.getElementById('connection').textContent === 'Preview ready'
    );
    assert.equal(
      await offline.locator('.sidebar').evaluate((el) => getComputedStyle(el).position),
      'fixed'
    );
    await offline.locator('[data-nav="studio"]').click();
    await offline.locator('#allOn').click();
    await offline.waitForFunction(() => document.querySelectorAll('[data-led].lit').length === 4);
    await offline.locator('#releaseStudio').click();
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log(
      'PASS: desktop/mobile navigation, gameplay, keyboard, partial scoring, ownership, reconnect, one-tap studio, effects, synchronized test, QR, setup and offline demo.'
    );
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
