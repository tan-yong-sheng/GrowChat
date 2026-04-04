import { BaseEmailPlugin } from './base-plugin.js';

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

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Resend API error: ${error.message || response.statusText}`);
    }

    return await response.json();
  }
}
