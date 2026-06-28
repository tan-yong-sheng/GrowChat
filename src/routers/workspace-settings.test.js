import { describe, expect, it, vi } from 'vitest';

// workspace-settings.js just re-exports from services/workspace-settings.js
vi.mock('../services/workspace-settings.js', () => ({
  buildWorkspaceSettingsPayload: vi.fn(),
  resolveWorkspaceCapabilities: vi.fn(),
  toAccessibleConnectionSummary: vi.fn(),
  toAccessibleToolServerSummary: vi.fn(),
  toPersonalConnectionSummary: vi.fn(),
  toPersonalToolServerSummary: vi.fn(),
}));

import {
  buildWorkspaceSettingsPayload,
  resolveWorkspaceCapabilities,
  toAccessibleConnectionSummary,
  toAccessibleToolServerSummary,
  toPersonalConnectionSummary,
  toPersonalToolServerSummary,
} from './workspace-settings.js';

describe('workspace-settings re-exports', () => {
  it('exports buildWorkspaceSettingsPayload', () => {
    expect(typeof buildWorkspaceSettingsPayload).toBe('function');
  });

  it('exports resolveWorkspaceCapabilities', () => {
    expect(typeof resolveWorkspaceCapabilities).toBe('function');
  });

  it('exports toAccessibleConnectionSummary', () => {
    expect(typeof toAccessibleConnectionSummary).toBe('function');
  });

  it('exports toAccessibleToolServerSummary', () => {
    expect(typeof toAccessibleToolServerSummary).toBe('function');
  });

  it('exports toPersonalConnectionSummary', () => {
    expect(typeof toPersonalConnectionSummary).toBe('function');
  });

  it('exports toPersonalToolServerSummary', () => {
    expect(typeof toPersonalToolServerSummary).toBe('function');
  });
});
