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

function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
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
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    return createResendMailer(resendApiKey);
  }
  return createSmtpMailer();
}
