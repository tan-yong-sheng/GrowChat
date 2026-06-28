import { describe, expect, it } from 'vitest';
import { BaseEmailPlugin } from './base-plugin.js';

describe('BaseEmailPlugin', () => {
  it('stores config in constructor', () => {
    const plugin = new BaseEmailPlugin({ apiKey: 'test' });
    expect(plugin.config).toEqual({ apiKey: 'test' });
  });

  it('defaults config to empty object', () => {
    const plugin = new BaseEmailPlugin();
    expect(plugin.config).toEqual({});
  });

  it('send() throws because it must be implemented by subclass', async () => {
    const plugin = new BaseEmailPlugin();
    await expect(
      plugin.send({ to: 'a@b.com', subject: 'Test', html: '<p>Hi</p>' })
    ).rejects.toThrow('send() method must be implemented by subclass');
  });

  it('validateOptions throws if "to" is missing', () => {
    const plugin = new BaseEmailPlugin();
    expect(() => plugin.validateOptions({ subject: 'Test', html: '<p>Hi</p>' })).toThrow(
      'Email recipient (to) is required'
    );
  });

  it('validateOptions throws if "subject" is missing', () => {
    const plugin = new BaseEmailPlugin();
    expect(() => plugin.validateOptions({ to: 'a@b.com', html: '<p>Hi</p>' })).toThrow(
      'Email subject is required'
    );
  });

  it('validateOptions throws if both "html" and "text" are missing', () => {
    const plugin = new BaseEmailPlugin();
    expect(() => plugin.validateOptions({ to: 'a@b.com', subject: 'Test' })).toThrow(
      'Email body (html or text) is required'
    );
  });

  it('validateOptions passes with html body', () => {
    const plugin = new BaseEmailPlugin();
    expect(() =>
      plugin.validateOptions({ to: 'a@b.com', subject: 'Test', html: '<p>Hi</p>' })
    ).not.toThrow();
  });

  it('validateOptions passes with text body', () => {
    const plugin = new BaseEmailPlugin();
    expect(() =>
      plugin.validateOptions({ to: 'a@b.com', subject: 'Test', text: 'Hi' })
    ).not.toThrow();
  });

  it('validateOptions passes with both html and text body', () => {
    const plugin = new BaseEmailPlugin();
    expect(() =>
      plugin.validateOptions({ to: 'a@b.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' })
    ).not.toThrow();
  });

  it('send() calls validateOptions before throwing', async () => {
    const plugin = new BaseEmailPlugin();
    await expect(plugin.send({})).rejects.toThrow('Email recipient (to) is required');
  });
});
