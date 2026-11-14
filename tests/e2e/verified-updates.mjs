/** Browser regression adapted from the reference; no live WordPress/account writes. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const cache = join(homedir(), '.cache/ms-playwright');
const chrome = readdirSync(cache)
  .filter((name) => /^chromium-\d+$/.test(name))
  .sort()
  .pop();
const browser = await chromium.launch({
  executablePath:
    process.env.SWS_CHROMIUM_PATH ||
    [join(cache, chrome, 'chrome-linux/chrome'), join(cache, chrome, 'chrome-linux64/chrome')].find(
      existsSync,
    ),
  args: ['--no-sandbox'],
});
try {
  for (const due of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('https://sws.test/**', async (route) => {
      if (route.request().method() === 'POST') {
        requests.push(Object.fromEntries(new URLSearchParams(route.request().postData())));
        await gate;
        await route.fulfill({
          json: { success: true, data: { message: 'Signed metadata checked' } },
        });
      } else {
        await route.fulfill({
          contentType: 'text/html',
          body: `
          <a href="/wp-admin/plugins.php">Plugins</a>
          <table class="wp-list-table plugins"><tr data-slug="sw-sliderman"><td>SW Sliderman <button id="sws-verified-updates-check">Check updates</button>
          <p id="sws-verified-updates-result" role="status" hidden></p><a id="sws-verified-updates-reload" href="/wp-admin/plugins.php" hidden>Reload</a><span id="sws-verified-updates-status">Cached</span></td></tr></table>
          <script>window.swsVerifiedUpdates=${JSON.stringify({
            url: 'https://sws.test/wp-admin/admin-ajax.php',
            nonce: 'test-nonce',
            ready: true,
            due,
            checking: 'Checking',
            completed: 'Done',
            failed: 'Failed',
          })};</script>
          <script>${readFileSync(new URL('../../build/admin/updates.js', import.meta.url), 'utf8')}</script>`,
        });
      }
    });
    await page.goto('https://sws.test/wp-admin/plugins.php');
    if (!due) {
      assert.equal(requests.length, 0);
      await page.locator('#sws-verified-updates-check').click();
      assert.equal(await page.locator('#sws-verified-updates-check').isDisabled(), true);
      assert.equal(await page.locator('#sws-verified-updates-result').isVisible(), true);
    }
    await page.waitForFunction(
      () => document.getElementById('sws-verified-updates-check').disabled,
    );
    release();
    await page.waitForFunction(
      () => !document.getElementById('sws-verified-updates-check').disabled,
    );
    assert.deepEqual(requests, [
      {
        action: 'sws_check_github_updates',
        nonce: 'test-nonce',
        manual: due ? '0' : '1',
      },
    ]);
    assert.equal(await page.locator('a').first().getAttribute('href'), '/wp-admin/plugins.php');
    assert.equal(await page.locator('#sws-verified-updates-result').isVisible(), !due);
    if (!due) {
      assert.equal(await page.locator('#sws-verified-updates-reload').isVisible(), true);
      assert.equal(await page.locator('#sws-verified-updates-status').isVisible(), false);
      assert.match(
        await page.locator('#sws-verified-updates-result').textContent(),
        /Signed metadata/,
      );
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Verified update browser checks passed (manual, deferred, single-flight, native navigation).',
  );
} finally {
  await browser.close();
}
