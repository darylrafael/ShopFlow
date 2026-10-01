export class EmailProviderUnavailableError extends Error {
  constructor() {
    super('Transactional email is not configured');
    this.name = 'EmailProviderUnavailableError';
  }
}

type EmailMessage = { to: string; subject: string; text: string; html: string };

export function isEmailConfigured() {
  return Boolean(process.env['RESEND_API_KEY'] && process.env['SHOPFLOW_EMAIL_FROM']);
}

export async function sendTransactionalEmail(message: EmailMessage) {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['SHOPFLOW_EMAIL_FROM'];
  if (!apiKey || !from) throw new EmailProviderUnavailableError();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) throw new Error('Transactional email provider rejected the message');
}

export function appUrl() {
  return process.env['SHOPFLOW_APP_URL'] || 'http://localhost:3000';
}
