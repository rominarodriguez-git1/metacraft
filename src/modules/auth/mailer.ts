import { Resend } from "resend";
import nodemailer from "nodemailer";
import type { Locale } from "@/i18n/config";
import { renderMagicLinkEmail } from "@/modules/auth/magic-link-email";

export interface MagicLinkEmail {
  to: string;
  url: string;
  /** The reader's language, resolved from the sign-in request. */
  locale: Locale;
}

export interface Mailer {
  sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

const LOCAL_SMTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * True for a host on this machine (Mailpit in development and tests). Any other
 * SMTP server must use STARTTLS, or a network attacker could strip the upgrade
 * and read the magic links and SMTP credentials in plaintext.
 */
export function isLocalSmtpHost(host: string | undefined): boolean {
  return host !== undefined && LOCAL_SMTP_HOSTS.has(host.trim().toLowerCase());
}

function createSmtpMailer(): Mailer {
  const host = process.env.SMTP_HOST;
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    requireTLS: !isLocalSmtpHost(host),
  });

  return {
    async sendMagicLink({ to, url, locale }: MagicLinkEmail): Promise<void> {
      const { subject, html } = renderMagicLinkEmail(url, locale);
      await transport.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
      });
    },
  };
}

function createResendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey);

  return {
    async sendMagicLink({ to, url, locale }: MagicLinkEmail): Promise<void> {
      const { subject, html } = renderMagicLinkEmail(url, locale);
      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "no-reply@metacraft.example",
        to,
        subject,
        html,
      });
    },
  };
}

export function createMailer(): Mailer {
  if (process.env.EMAIL_PROVIDER === "resend") {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    return createResendMailer(resendApiKey);
  }
  return createSmtpMailer();
}
