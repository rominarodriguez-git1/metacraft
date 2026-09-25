import { afterEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn().mockResolvedValue(undefined);
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

const resendSendMock = vi.fn().mockResolvedValue(undefined);
const resendConstructorMock = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSendMock };
    constructor(apiKey: string) {
      resendConstructorMock(apiKey);
    }
  },
}));

describe("createMailer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("selects the smtp transport when EMAIL_PROVIDER=smtp, even when RESEND_API_KEY is also set", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "localhost");
    vi.stubEnv("SMTP_PORT", "1025");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { createMailer } = await import("@/modules/auth/mailer");
    const mailer = createMailer();
    await mailer.sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify", locale: "en" });

    expect(createTransportMock).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalled();
    expect(resendConstructorMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("selects the resend transport when EMAIL_PROVIDER=resend", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { createMailer } = await import("@/modules/auth/mailer");
    const mailer = createMailer();
    await mailer.sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify", locale: "en" });

    expect(resendConstructorMock).toHaveBeenCalledWith("re_test_key");
    expect(resendSendMock).toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a remote SMTP host", "smtp.example.com", true],
    ["localhost (Mailpit)", "localhost", false],
    ["127.0.0.1", "127.0.0.1", false],
  ])("requires STARTTLS for %s: requireTLS=%s", async (_label, host, requireTLS) => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", host);
    vi.stubEnv("SMTP_PORT", "587");

    const { createMailer } = await import("@/modules/auth/mailer");
    createMailer();

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host, requireTLS }));
  });

  it.each([
    ["es", "Iniciá sesión en Metacraft"],
    ["en", "Sign in to Metacraft"],
  ] as const)("the smtp mailer sends the %s subject", async (locale, subject) => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_HOST", "localhost");
    vi.stubEnv("SMTP_PORT", "1025");

    const { createMailer } = await import("@/modules/auth/mailer");
    await createMailer().sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify", locale });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject, html: expect.stringContaining(`lang="${locale}"`) }),
    );
  });

  it.each([
    ["es", "Iniciá sesión en Metacraft"],
    ["en", "Sign in to Metacraft"],
  ] as const)("the resend mailer sends the %s subject", async (locale, subject) => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const { createMailer } = await import("@/modules/auth/mailer");
    await createMailer().sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify", locale });

    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject, html: expect.stringContaining(`lang="${locale}"`) }),
    );
  });
});
