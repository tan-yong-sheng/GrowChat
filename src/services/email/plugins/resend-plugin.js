import { BaseEmailPlugin } from './base-plugin.js';

const REQUEST_TIMEOUT_MS = 10000;

export class ResendPlugin extends BaseEmailPlugin {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.apiUrl = 'https://api.resend.com/emails';
    if (!this.apiKey) {
      throw new Error('Resend API key is required');
    }
  }

  async send(options) {
    this.validateOptions(options);

    const payload = {
      from: options.from || 'noreply@growchat.app',
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.text && { text: options.text }),
      ...(options.replyTo && { reply_to: options.replyTo }),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // fallow-ignore-next-line security-sink
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const error = await response.json();
          errorMessage = error.message || response.statusText;
        } catch {
          errorMessage = (await response.text()) || response.statusText;
        }
        throw new Error(`Resend API error: ${errorMessage}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
