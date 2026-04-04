/**
 * Email service factory for plugin-based email delivery
 * Supports multiple email providers through plugin architecture
 */

class BaseEmailService {
  constructor(config = {}) {
    this.config = config;
  }

  async send(options) {
    throw new Error('send() must be implemented by plugin');
  }
}

class ResendEmailService extends BaseEmailService {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }

  async send(options) {
    const { to, subject, html, text } = options;

    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    if (!to || !subject) {
      throw new Error('Email requires "to" and "subject" fields');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@growchat.app',
        to,
        subject,
        html: html || text,
        text: text || html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${error.message || response.statusText}`);
    }

    return await response.json();
  }
}

class MockEmailService extends BaseEmailService {
  async send(options) {
    console.log('[MockEmailService] Email would be sent:', options);
    return { id: `mock-${Date.now()}`, success: true };
  }
}

export function createEmailService(env) {
  const apiKey = env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured, using mock email service');
    return new MockEmailService();
  }

  return new ResendEmailService(apiKey);
}
