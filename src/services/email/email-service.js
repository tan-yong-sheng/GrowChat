import { ResendPlugin } from './plugins/resend-plugin.js';

export function createEmailService(env = {}) {
  const provider = (env.EMAIL_PROVIDER || 'resend').toLowerCase();

  let plugin;

  if (provider === 'resend') {
    plugin = new ResendPlugin({
      apiKey: env.RESEND_API_KEY,
    });
  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }

  return {
    async send(options) {
      return plugin.send(options);
    },
  };
}
