import { Resend } from "resend";
import nodemailer from "nodemailer";

export interface MagicLinkEmail {
  to: string;
  url: string;
}

export interface Mailer {
  sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

function subjectAndHtml(url: string): { subject: string; html: string } {
  return {
    subject: "Sign in to Metacraft",
    html: `<p>Click the link below to sign in to Metacraft.</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
  };
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
    async sendMagicLink({ to, url }: MagicLinkEmail): Promise<void> {
      const { subject, html } = subjectAndHtml(url);
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
    async sendMagicLink({ to, url }: MagicLinkEmail): Promise<void> {
      const { subject, html } = subjectAndHtml(url);
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
