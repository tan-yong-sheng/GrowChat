export class BaseEmailPlugin {
  constructor(config = {}) {
    this.config = config;
  }

  async send(options) {
    throw new Error('send() method must be implemented by subclass');
  }

  validateOptions(options) {
    if (!options.to) throw new Error('Email recipient (to) is required');
    if (!options.subject) throw new Error('Email subject is required');
    if (!options.html && !options.text) throw new Error('Email body (html or text) is required');
  }
}
