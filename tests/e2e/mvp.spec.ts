import { expect, test, type Page } from "@playwright/test";
import { waitForMagicLink } from "./helpers/mailpit";

// AC12: sign in -> search -> filter -> submit to 3 providers -> status view with
// mixed failed / responded / sent, then a language switch, at both viewports.
// Source behaviour is pinned by SIM_ADAPTER_CONFIG in playwright.config.ts.
//
// Every page is reached by clicking from `/` (plan ui-navigation AC5), so a
// screen the UI cannot reach fails the suite. page.goto is used only for `/`,
// the magic link, and the post-sign-out check that /search is protected.

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
}

async function expectOneLocaleSwitcher(page: Page): Promise<void> {
  await expect(page.getByRole("group", { name: /Seleccionar idioma|Select language/ })).toHaveCount(1);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await expectOneLocaleSwitcher(page);
  // Signed out, the header offers only the home link and the language switcher.
  await expect(page.getByRole("banner").getByRole("link", { name: "Mis solicitudes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: "Iniciar sesión" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expectNoHorizontalScroll(page);
  await expectOneLocaleSwitcher(page);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(page).toHaveURL(/\/sign-in\/check-email/);
  await expectNoHorizontalScroll(page);
  // A user whose link doesn't arrive can go back and try another address.
  await expect(page.getByRole("link", { name: "Usar otro correo" })).toHaveAttribute("href", "/sign-in");

  const magicLink = await waitForMagicLink(email);
  await page.goto(magicLink);
  // A failed verification can redirect to a non-sign-in URL with an error, so
  // prove the session exists: a protected page must load instead of bouncing.
  await expect(page).not.toHaveURL(/error=/);
  await expect(page).toHaveURL(/\/search$/);
  await page.getByRole("banner").getByRole("link", { name: "Mis solicitudes" }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expectOneLocaleSwitcher(page);
}

test("a signed-in user compares quotes from three sources and switches language", async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;

  await signIn(page, email);

  // Search with trade and zone filters.
  await page.getByRole("banner").getByRole("link", { name: "Buscar proveedores" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expectOneLocaleSwitcher(page);
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
  await expectOneLocaleSwitcher(page);

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

  // Back to the status view through the header and the request list.
  await page.getByRole("banner").getByRole("link", { name: "My requests" }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await page.getByRole("link", { name: "View details" }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(failed).toContainText("Failed");
  await expect(responded).toContainText("Responded");
  await expect(sent).toContainText("Sent");
  await expectNoHorizontalScroll(page);

  // Sign out from the header; the session is gone, so /search bounces to sign-in.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/search");
  await expect(page).toHaveURL(/\/sign-in$/);
});
