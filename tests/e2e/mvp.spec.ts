import { expect, test, type Page } from "@playwright/test";
import { waitForMagicLink } from "./helpers/mailpit";

// AC12: sign in -> search -> filter -> submit to 3 providers -> status view with
// mixed failed / responded / sent, then a language switch, at both viewports.
// Source behaviour is pinned by SIM_ADAPTER_CONFIG in playwright.config.ts.

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(page).toHaveURL(/\/sign-in\/check-email/);
  await expectNoHorizontalScroll(page);

  const magicLink = await waitForMagicLink(email);
  await page.goto(magicLink);
  // A failed verification can redirect to a non-sign-in URL with an error, so
  // prove the session exists: a protected page must load instead of bouncing.
  await expect(page).not.toHaveURL(/error=/);
  await page.goto("/requests");
  await expect(page).toHaveURL(/\/requests$/);
}

test("a signed-in user compares quotes from three sources and switches language", async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;

  await signIn(page, email);

  // Search with trade and zone filters.
  await page.goto("/search");
  await page.getByLabel("Rubro").selectOption("albanileria");
  await page.getByLabel("Departamento").selectOption("Montevideo");
  await page.getByLabel("Zona").selectOption("Centro");
  await page.getByLabel("Presupuesto mínimo (UYU)").fill("1000");
  await page.getByLabel("Presupuesto máximo (UYU)").fill("900000");
  await page.getByLabel("Plazo").selectOption("flexible");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/trade=albanileria/);
  await expect(page).toHaveURL(/zone=Centro/);
  await expectNoHorizontalScroll(page);

  // One provider from each simulated source.
  for (const sourceId of ["obrafacil", "reformasya", "casapro"]) {
    const card = page.locator(`li[data-source-id="${sourceId}"]`).first();
    await expect(card).toBeVisible();
    await card.getByRole("checkbox").check();
  }
  await page.getByRole("link", { name: "Solicitar presupuestos" }).click();

  // The quote form arrives prefilled with the providers and filters.
  await expect(page).toHaveURL(/\/requests\/new/);
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Área (m²)").fill("20");
  await page.getByRole("radio", { name: "Sí" }).check();
  await page.getByLabel("Descripción").fill("Renovación de cocina, 20 m², Montevideo");
  await page.getByLabel("Teléfono de contacto").fill("099 123 456");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();

  // Status view: the page polls until each dispatch settles.
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  const detailUrl = page.url();

  const failed = page.locator('li[data-status="failed"]');
  const responded = page.locator('li[data-status="responded"]');
  const sent = page.locator('li[data-status="sent"]');

  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("obrafacil");
  await expect(failed).toContainText("Fallido");
  await expect(failed.getByRole("alert")).toBeVisible();

  await expect(responded).toHaveCount(1);
  await expect(responded).toContainText("reformasya");
  await expect(responded).toContainText("Respondido");
  await expect(responded).toContainText(/UYU/);

  await expect(sent).toHaveCount(1);
  await expect(sent).toContainText("casapro");
  await expect(sent).toContainText("Enviado");
  await expectNoHorizontalScroll(page);

  // Switch to English on the home page; the choice persists to the status view.
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Inglés" }).click();
  await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  await page.goto(detailUrl);
  await expect(failed).toContainText("Failed");
  await expect(responded).toContainText("Responded");
  await expect(sent).toContainText("Sent");
  await expectNoHorizontalScroll(page);
});
