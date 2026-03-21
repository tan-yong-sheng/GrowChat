import { describe, expect, it } from 'vitest';
import { createAssistantRunner } from './assistant-runner.js';

describe('assistant runner', () => {
  it('exposes a factory for the stream assistant runner', () => {
    expect(typeof createAssistantRunner).toBe('function');
  });
});
