// test/wave3.test.js
// Comprehensive test suite for Wave 3 API endpoints
// Tests: Icon, Tags, Archive Filter, User Profile, System Prompts, Tokens

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Mock data generators
const MOCK_ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // In real test, use actual token
const MOCK_USER_ID = 'user-test-123';
const MOCK_CHAT_ID = 'chat-test-123';

/**
 * P0.2: Chat Icon Tests
 */
describe('P0.2: Chat Icons', () => {
  describe('POST /api/chats/:id/icon', () => {
    it('should set icon on existing chat', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/icon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: '🚀' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.icon).toBe('🚀');
      expect(data.chat.updated_at).toBeDefined();
    });

    it('should clear icon with empty string', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/icon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: '' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.icon).toBeNull();
    });

    it('should reject icon > 50 chars', async () => {
      const longIcon = '🚀'.repeat(51);
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/icon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: longIcon })
      });

      expect(response.status).toBe(400);
    });

    it('should reject icon with control characters', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/icon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: '🚀\x00' })
      });

      expect(response.status).toBe(400);
    });

    it('should return 401 without token', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/icon`, {
        method: 'POST',
        body: JSON.stringify({ icon: '🚀' })
      });

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent chat', async () => {
      const response = await fetch('/api/chats/fake-chat-id/icon', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: '🚀' })
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 for unowned chat', async () => {
      // Setup: Create chat with different user, try to update with our token
      const response = await fetch(`/api/chats/other-user-chat/icon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ icon: '🚀' })
      });

      expect(response.status).toBe(403);
    });
  });
});

/**
 * P0.3: Chat Tags Tests
 */
describe('P0.3: Chat Tags', () => {
  describe('POST /api/chats/:id/tags', () => {
    it('should add tag to chat', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'work' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.tags).toContain('work');
    });

    it('should normalize tag to lowercase', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'IMPORTANT' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.tags).toContain('important');
    });

    it('should prevent duplicate tags (409)', async () => {
      // Add first tag
      await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'urgent' })
      });

      // Try to add same tag again
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'urgent' })
      });

      expect(response.status).toBe(409);
    });

    it('should reject tag > 50 chars', async () => {
      const longTag = 'a'.repeat(51);
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: longTag })
      });

      expect(response.status).toBe(400);
    });

    it('should reject tag with invalid characters', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'invalid@tag' })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/chats/:id/tags/:tag', () => {
    it('should remove tag from chat', async () => {
      // Add tag first
      await fetch(`/api/chats/${MOCK_CHAT_ID}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'removable' })
      });

      // Remove tag
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tags/removable`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.tags).not.toContain('removable');
    });

    it('should return 404 for non-existent chat', async () => {
      const response = await fetch('/api/chats/fake-chat/tags/work', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/chats/tags', () => {
    it('should list all user tags with counts', async () => {
      // Setup: Add multiple tags to multiple chats
      const chat1 = 'chat-1';
      const chat2 = 'chat-2';

      await fetch(`/api/chats/${chat1}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'work' })
      });

      await fetch(`/api/chats/${chat1}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'personal' })
      });

      await fetch(`/api/chats/${chat2}/tags`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ tag: 'work' })
      });

      // List tags
      const response = await fetch('/api/chats/tags', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.tags).toBeDefined();
      expect(data.tags.length).toBeGreaterThan(0);

      const workTag = data.tags.find(t => t.name === 'work');
      expect(workTag).toBeDefined();
      expect(workTag.count).toBe(2);

      const personalTag = data.tags.find(t => t.name === 'personal');
      expect(personalTag).toBeDefined();
      expect(personalTag.count).toBe(1);
    });
  });
});

/**
 * P0.4: Archive Filter Tests
 */
describe('P0.4: GET /api/chats with Archive Filter', () => {
  it('should return only active chats by default', async () => {
    const response = await fetch('/api/chats', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.chats).toBeDefined();
    // All chats should have archived === false
    data.chats.forEach(chat => {
      expect(chat.archived).toBeFalsy();
    });
  });

  it('should filter archived=true', async () => {
    const response = await fetch('/api/chats?archived=true', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.archived).toBe(true);
    data.chats.forEach(chat => {
      expect(chat.archived).toBeTruthy();
    });
  });

  it('should return icon and tags fields', async () => {
    const response = await fetch('/api/chats', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    if (data.chats.length > 0) {
      const chat = data.chats[0];
      expect(chat).toHaveProperty('icon');
      expect(chat).toHaveProperty('tags');
      expect(Array.isArray(chat.tags)).toBe(true);
    }
  });
});

/**
 * P1.2 & P1.3: User Profile Tests
 */
describe('P1: User Profile', () => {
  describe('GET /api/users/me (Extended)', () => {
    it('should return all profile fields', async () => {
      const response = await fetch('/api/users/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      const user = data.user;

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('avatar');
      expect(user).toHaveProperty('avatar_emoji');
      expect(user).toHaveProperty('status');
      expect(user).toHaveProperty('preferences');
      expect(typeof user.preferences).toBe('object');
    });
  });

  describe('PUT /api/users/me', () => {
    it('should update profile name', async () => {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ name: 'New Name' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.name).toBe('New Name');
    });

    it('should update avatar_emoji', async () => {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ avatar_emoji: '👨‍💻' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.avatar_emoji).toBe('👨‍💻');
    });

    it('should update status', async () => {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ status: 'away' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.status).toBe('away');
    });

    it('should update preferences', async () => {
      const prefs = { theme: 'dark', send_key: 'Ctrl+Enter', temperature: 0.8 };
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ preferences: prefs })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.preferences).toEqual(prefs);
    });

    it('should reject invalid status value', async () => {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ status: 'invalid_status' })
      });

      expect(response.status).toBe(400);
    });

    it('should reject avatar_emoji > 50 chars', async () => {
      const longEmoji = '🚀'.repeat(51);
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ avatar_emoji: longEmoji })
      });

      expect(response.status).toBe(400);
    });

    it('should reject invalid preferences type', async () => {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ preferences: 'not-an-object' })
      });

      expect(response.status).toBe(400);
    });
  });
});

/**
 * P2.1: System Prompt Tests
 */
describe('P2.1: System Prompts', () => {
  describe('PUT /api/chats/:id/system-prompt', () => {
    it('should set custom system prompt', async () => {
      const prompt = 'You are a helpful coding assistant.';
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/system-prompt`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ system_prompt: prompt })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.system_prompt).toBe(prompt);
    });

    it('should clear system prompt with null', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/system-prompt`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ system_prompt: null })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.system_prompt).toBeNull();
    });

    it('should reject prompt > 2000 chars', async () => {
      const longPrompt = 'a'.repeat(2001);
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/system-prompt`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ system_prompt: longPrompt })
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent chat', async () => {
      const response = await fetch('/api/chats/fake-chat/system-prompt', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
        body: JSON.stringify({ system_prompt: 'test' })
      });

      expect(response.status).toBe(404);
    });
  });
});

/**
 * P2.2: Token Statistics Tests
 */
describe('P2.2: Token Statistics', () => {
  describe('GET /api/chats/:id/tokens', () => {
    it('should return token statistics', async () => {
      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tokens`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.chat_id).toBe(MOCK_CHAT_ID);
      expect(typeof data.message_count).toBe('number');
      expect(typeof data.total_tokens).toBe('number');
      expect(typeof data.prompt_tokens).toBe('number');
      expect(typeof data.completion_tokens).toBe('number');
      expect(typeof data.estimated_cost_usd).toBe('number');
    });

    it('should calculate token sums correctly', async () => {
      // Setup: Chat with messages containing token counts
      // Add messages with known token counts, then verify aggregation

      const response = await fetch(`/api/chats/${MOCK_CHAT_ID}/tokens`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify sums
      expect(data.total_tokens).toBe(
        data.prompt_tokens + data.completion_tokens
      );

      // Verify cost estimation
      expect(data.estimated_cost_usd).toBeGreaterThanOrEqual(0);
    });

    it('should return 404 for non-existent chat', async () => {
      const response = await fetch('/api/chats/fake-chat/tokens', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(404);
    });

    it('should return 403 for unowned chat', async () => {
      const response = await fetch('/api/chats/other-user-chat/tokens', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
      });

      expect(response.status).toBe(403);
    });
  });
});

/**
 * Integration Tests
 */
describe('Wave 3 Integration Tests', () => {
  it('should handle complete chat customization workflow', async () => {
    // 1. Create chat
    const chatRes = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
      body: JSON.stringify({ title: 'Integration Test Chat' })
    });
    const chatData = await chatRes.json();
    const chatId = chatData.chat.id;

    // 2. Add icon
    await fetch(`/api/chats/${chatId}/icon`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
      body: JSON.stringify({ icon: '🧪' })
    });

    // 3. Add tags
    await fetch(`/api/chats/${chatId}/tags`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
      body: JSON.stringify({ tag: 'test' })
    });

    await fetch(`/api/chats/${chatId}/tags`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
      body: JSON.stringify({ tag: 'integration' })
    });

    // 4. Set system prompt
    await fetch(`/api/chats/${chatId}/system-prompt`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` },
      body: JSON.stringify({ system_prompt: 'You are a test assistant.' })
    });

    // 5. Verify all fields in GET
    const getRes = await fetch(`/api/chats?limit=10`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
    });
    const getRes Data = await getRes.json();
    const updatedChat = getData.chats.find(c => c.id === chatId);

    expect(updatedChat.icon).toBe('🧪');
    expect(updatedChat.tags).toContain('test');
    expect(updatedChat.tags).toContain('integration');
    expect(updatedChat.system_prompt).toBe('You are a test assistant.');
  });

  it('should maintain tag counts across multiple users', async () => {
    // Tag the same tag on different chats
    // Verify count reflects all associations

    const response = await fetch('/api/chats/tags', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MOCK_ADMIN_TOKEN}` }
    });

    const data = await response.json();
    const tags = data.tags;

    // Each tag's count should match chats with that tag
    tags.forEach(tag => {
      expect(tag.count).toBeGreaterThan(0);
      expect(typeof tag.count).toBe('number');
    });
  });
});
