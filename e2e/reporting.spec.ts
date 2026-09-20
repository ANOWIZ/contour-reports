import { stat } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

const password = "demo-report";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

test.describe("Разделение ролей и отчетность", () => {
  test("лид видит только свой отчет и скачивает полный PowerPoint", async ({
    page,
  }) => {
    await signIn(page, "lead@contour.local");

    await expect(page).toHaveURL(/\/my-report/);
    await expect(page.getByText("Лид продукта", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Мой отчет" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Портфель продуктов" }),
    ).toHaveCount(0);

    await page.goto("/portfolio");
    await expect(page).toHaveURL(/\/my-report/);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Скачать PowerPoint" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pptx$/i);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    expect((await stat(downloadPath!)).size).toBeGreaterThan(50_000);
    expect(await download.failure()).toBeNull();
  });

  test("руководство видит весь портфель и не получает редактор лида", async ({
    page,
  }) => {
    await signIn(page, "management@contour.local");

    await expect(page).toHaveURL(/\/portfolio/);
    await expect(page.getByText("Руководство", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Портфель продуктов" }),
    ).toBeVisible();
    await expect(
      page.getByRole("form", { name: "Фильтры отчетов" }),
    ).toBeVisible();
    await expect(page.getByLabel("Период")).toBeVisible();
    await expect(page.getByLabel("Статус отчета")).toBeVisible();

    const reportLink = page.locator('a[href^="/portfolio/"]').first();
    await expect(reportLink).toBeVisible();
    await reportLink.click();
    await expect(
      page.getByRole("link", { name: "Скачать PowerPoint" }),
    ).toBeVisible();

    await page.goto("/my-report");
    await expect(page).toHaveURL(/\/portfolio/);
  });
});

test("основные экраны не создают горизонтальный скролл", async ({ page }) => {
  await signIn(page, "management@contour.local");
  await expect(page).toHaveURL(/\/portfolio/);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  }
});

test("форма входа доступна с клавиатуры и имеет связанные подписи", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Электронная почта")).toHaveAttribute(
    "type",
    "email",
  );
  await expect(page.getByLabel("Пароль")).toHaveAttribute("type", "password");

  await expect(page.getByRole("button", { name: "Войти" })).toBeEnabled();
  await page.getByLabel("Электронная почта").focus();
  await expect(page.getByLabel("Электронная почта")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Пароль")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Войти" })).toBeFocused();
});
