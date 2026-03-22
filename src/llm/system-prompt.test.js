import { describe, expect, it } from 'vitest';
import { buildMetadataSystemPrompt } from './system-prompt.js';

describe('buildMetadataSystemPrompt', () => {
  it('includes the current model and environment metadata', () => {
    const prompt = buildMetadataSystemPrompt({
      appName: 'GrowChat',
      model: 'openai/env-openai-0:gpt-oss-20b',
      providerFamily: 'openai',
      timeZone: 'Asia/Kuala_Lumpur',
      platform: 'linux',
      now: new Date('2025-03-20T12:00:00.000Z'),
    });

    expect(prompt).toContain('You are powered by the model named openai/env-openai-0:gpt-oss-20b.');
    expect(prompt).toContain('Application: GrowChat');
    expect(prompt).toContain('Provider family: openai');
    expect(prompt).toContain('Platform: linux');
    expect(prompt).toContain('Timezone: Asia/Kuala_Lumpur');
    expect(prompt).toContain('Current timestamp: 2025-03-20T12:00:00.000Z');
    expect(prompt).toContain("Today's date: Thu Mar 20 2025");
    expect(prompt).toContain("Yesterday's date: Wed Mar 19 2025");
    expect(prompt).toContain("Tomorrow's date: Fri Mar 21 2025");
  });
});
