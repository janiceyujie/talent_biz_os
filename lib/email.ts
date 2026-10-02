import "server-only";
import nodemailer from "nodemailer";

// Plain SMTP so any provider works: Mailpit locally, Resend (or anyone) in production.
const transport = nodemailer.createTransport(process.env.SMTP_URL!);

export async function sendEmail(message: { to: string; subject: string; text: string }) {
  await transport.sendMail({ from: process.env.EMAIL_FROM, ...message });
}
