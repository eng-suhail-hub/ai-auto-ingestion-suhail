import { test, expect } from '@playwright/test';

test('Test Pollinations Connection (V2 Final)', async ({ page }) => {
  await page.goto('http://localhost:8000');

  // Select Pollinations
  await page.click('button[data-prov="pollinations"]');

  // Click Test Connection
  await page.click('text=اختبار الاتصال');

  // Wait for notification or log
  // Pollinations is free so it should likely succeed if the network allows
  await page.waitForTimeout(10000); // Give it time

  await page.screenshot({ path: '/home/jules/verification/screenshots/v2_final_pollinations.png' });
});

test('Test Gemini Connection (V2 Final Error Handling)', async ({ page }) => {
  await page.goto('http://localhost:8000');

  // Select Gemini
  await page.click('button[data-prov="gemini"]');

  // Ensure API key is empty to trigger our specific error
  await page.evaluate(() => {
    localStorage.removeItem('fv8_key_gemini');
    const el = document.getElementById('cfg_gem_key') as HTMLInputElement;
    if (el) el.value = '';
  });

  // Click Test Connection
  await page.click('text=اختبار الاتصال');

  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/home/jules/verification/screenshots/v2_final_gemini_error.png' });

  // The log should contain "Gemini API Key is required"
  const logs = await page.innerText('#log-area');
  console.log('Logs:', logs);
});
