import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

const transporter = nodemailer.createTransport({
  host: ENV.smtpHost,
  port: ENV.smtpPort,
  secure: ENV.smtpPort === 465,
  auth: {
    user: ENV.smtpUser,
    pass: ENV.smtpPass,
  },
});

export interface ContactMailOptions {
  name: string;
  email: string;
  category: string;
  message: string;
}

export async function sendContactMail(opts: ContactMailOptions): Promise<void> {
  const subject = `【献立日和 お問い合わせ】${opts.category} - ${opts.name}様`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2d6a4f; border-bottom: 2px solid #2d6a4f; padding-bottom: 8px;">
        献立日和〜coto coto〜 お問い合わせ
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px 12px; background: #f0faf4; font-weight: bold; width: 140px; border: 1px solid #d1e7dd;">お名前</td>
          <td style="padding: 8px 12px; border: 1px solid #d1e7dd;">${opts.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f0faf4; font-weight: bold; border: 1px solid #d1e7dd;">メールアドレス</td>
          <td style="padding: 8px 12px; border: 1px solid #d1e7dd;"><a href="mailto:${opts.email}">${opts.email}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f0faf4; font-weight: bold; border: 1px solid #d1e7dd;">お問い合わせ種別</td>
          <td style="padding: 8px 12px; border: 1px solid #d1e7dd;">${opts.category}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f0faf4; font-weight: bold; border: 1px solid #d1e7dd; vertical-align: top;">内容</td>
          <td style="padding: 8px 12px; border: 1px solid #d1e7dd; white-space: pre-wrap;">${opts.message}</td>
        </tr>
      </table>
      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        このメールは献立日和〜coto coto〜のお問い合わせフォームから自動送信されました。
      </p>
    </div>
  `;

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"献立日和 お問い合わせ" <${ENV.smtpFrom}>`,
    to: ENV.smtpFrom, // info@self-consulting.co.jp
    bcc: ENV.contactBcc || undefined, // m.takahashi1985@gmail.com (非表示)
    replyTo: opts.email,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
}

export async function verifySmtpConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
