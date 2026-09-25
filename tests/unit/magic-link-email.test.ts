import { describe, expect, it } from "vitest";
import { renderMagicLinkEmail } from "@/modules/auth/magic-link-email";

const URL = "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2Fsearch";

describe("renderMagicLinkEmail", () => {
  it("renders the Spanish email", () => {
    const { subject, html } = renderMagicLinkEmail(URL, "es");

    expect(subject).toBe("Iniciá sesión en Metacraft");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("Hacé clic en el enlace para iniciar sesión en Metacraft.");
    expect(html).toContain("El enlace vence en 15 minutos y solo se puede usar una vez.");
    expect(html).not.toContain("Sign in");
  });

  it("renders the English email", () => {
    const { subject, html } = renderMagicLinkEmail(URL, "en");

    expect(subject).toBe("Sign in to Metacraft");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Click the link below to sign in to Metacraft.");
    expect(html).toContain("This link expires in 15 minutes and can only be used once.");
  });

  it.each(["es", "en"] as const)("carries the sign-in link in the %s email, HTML-escaped", (locale) => {
    const { html } = renderMagicLinkEmail(URL, locale);

    const escaped = URL.replace(/&/g, "&amp;");
    expect(html).toContain(`<a href="${escaped}">${escaped}</a>`);
  });

  it("cannot be broken out of by a quote in the link", () => {
    const { html } = renderMagicLinkEmail('http://localhost:3000/x"><script>alert(1)</script>', "en");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
