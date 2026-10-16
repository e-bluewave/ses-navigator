import { expect, test, type Page } from '@playwright/test';

const proposalPath = '/proposals/66666666-6666-4666-8666-666666666666';

async function isolate(page: Page) {
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === 'http://127.0.0.1:4179' &&
      !url.pathname.startsWith('/api/')
    )
      return route.continue();
    blocked.push(`${url.origin}${url.pathname}`);
    return route.abort();
  });
  return blocked;
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test('mobile confirmation wraps, keeps focus inside, and cancels without sending', async ({
  page,
}) => {
  const blocked = await isolate(page);
  await page.goto(proposalPath);
  const open = page.getByRole('button', { name: '承認済み本文を送信' });
  await expect(open).toBeVisible();
  await noPageOverflow(page);
  const bounds = await open.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  await open.tap();
  const dialog = page.getByRole('dialog', { name: '送信内容を確認' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'キャンセル' }),
  ).toBeFocused();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('dialog') !== null,
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  await open.tap();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).tap();
  expect(await page.evaluate(() => window.fixtureSendCount)).toBe(0);
  expect(blocked).toEqual([]);
});

test('a send needs confirmation and only invokes the in-browser fake transport once', async ({
  page,
}) => {
  const blocked = await isolate(page);
  await page.goto(proposalPath);
  await page.getByRole('button', { name: '承認済み本文を送信' }).tap();
  expect(await page.evaluate(() => window.fixtureSendCount)).toBe(0);
  await page
    .getByRole('button', { name: '内容を確認して送信', exact: true })
    .tap();
  await expect(
    page.getByRole('button', { name: '承認済み本文を送信' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureSendCount)).toBe(1);
  expect(blocked).toEqual([]);
});

test('retry confirmation lists only failed recipients and can be cancelled', async ({
  page,
}) => {
  const blocked = await isolate(page);
  await page.goto(`${proposalPath}?scenario=retry`);
  const open = page.getByRole('button', { name: '失敗した宛先だけ再送' });
  await open.tap();
  const dialog = page.getByRole('dialog', { name: '再送内容を確認' });
  await expect(dialog).toContainText(
    'long-fixture-sales-recipient@example.test',
  );
  await expect(dialog).not.toContainText('cc@example.test');
  await dialog.getByRole('button', { name: 'キャンセル' }).tap();
  expect(await page.evaluate(() => window.fixtureRetryCount)).toBe(0);
  await open.tap();
  await page.getByRole('button', { name: '内容を確認して再送' }).tap();
  await expect(open).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureRetryCount)).toBe(1);
  expect(await page.evaluate(() => window.fixtureSendCount)).toBe(0);
  expect(blocked).toEqual([]);
});

test('history errors never offer send or retry', async ({ page }) => {
  const blocked = await isolate(page);
  await page.goto(`${proposalPath}?scenario=history-error`);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '承認済み本文を送信' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '失敗した宛先だけ再送' }),
  ).toHaveCount(0);
  await noPageOverflow(page);
  expect(blocked).toEqual([]);
});

test('an uncertain send result requires a history read and never resends automatically', async ({
  page,
}) => {
  const blocked = await isolate(page);
  await page.goto(`${proposalPath}?scenario=send-error`);
  await page.getByRole('button', { name: '承認済み本文を送信' }).tap();
  await page
    .getByRole('button', { name: '内容を確認して送信', exact: true })
    .tap();
  await expect(
    page.getByText(
      '送信結果を確認できません。再送せず、配信履歴と受信状況を確認してください。',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '承認済み本文を送信' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '配信履歴を再確認' }).tap();
  await expect(
    page.getByRole('button', { name: '承認済み本文を送信' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureSendCount)).toBe(1);
  expect(await page.evaluate(() => window.fixtureRetryCount)).toBe(0);
  expect(blocked).toEqual([]);
});

test('expired auth returns to a mobile login with keyboard-accessible fields', async ({
  page,
}) => {
  const blocked = await isolate(page);
  await page.goto(`${proposalPath}?scenario=expired`);
  await expect(
    page.getByRole('button', { name: 'ログイン', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('メールアドレス')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('パスワード')).toBeFocused();
  await noPageOverflow(page);
  expect(blocked).toEqual([]);
});
