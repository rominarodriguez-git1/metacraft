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
    await mailer.sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify" });

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
    await mailer.sendMagicLink({ to: "user@example.com", url: "http://localhost:3000/verify" });

    expect(resendConstructorMock).toHaveBeenCalledWith("re_test_key");
    expect(resendSendMock).toHaveBeenCalled();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
