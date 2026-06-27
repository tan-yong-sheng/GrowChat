import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isValidHttpUrl: vi.fn(),
  mergeToolServer: vi.fn(),
}));

vi.mock('./tool-servers-utils.js', () => ({
  isValidHttpUrl: (...args) => mocks.isValidHttpUrl(...args),
  mergeToolServer: (...args) => mocks.mergeToolServer(...args),
}));

import {
  loadUserToolServers,
  getUserToolServer,
  createUserToolServer,
  updateUserToolServer,
  deleteUserToolServer,
} from './tool-servers-user.js';

describe('loadUserToolServers', () => {
  let db;

  beforeEach(() => {
    db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      all: vi.fn(),
      first: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('returns empty array when db is null', async () => {
    expect(await loadUserToolServers(null, 'u1')).toEqual([]);
  });

  it('returns empty array when userId is null', async () => {
    expect(await loadUserToolServers(db, null)).toEqual([]);
  });

  it('returns empty array when no rows found', async () => {
    db.all.mockResolvedValueOnce([]);
    const result = await loadUserToolServers(db, 'u1');
    expect(result).toEqual([]);
  });

  it('returns normalized servers from database rows', async () => {
    const serverData = { name: 'MyMCP', url: 'https://mcp.example.com' };
    db.all.mockResolvedValueOnce([
      {
        id: 's1',
        user_id: 'u1',
        server_json: JSON.stringify(serverData),
        created_at: 1000,
        updated_at: 2000,
      },
    ]);
    mocks.mergeToolServer.mockReturnValueOnce({ ...serverData, url: 'https://mcp.example.com' });

    const result = await loadUserToolServers(db, 'u1');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('user');
    expect(result[0].personal).toBe(true);
    expect(result[0].owner_user_id).toBe('u1');
  });

  it('filters out records without url', async () => {
    db.all.mockResolvedValueOnce([
      {
        id: 's1',
        user_id: 'u1',
        server_json: JSON.stringify({ name: 'NoUrl' }),
        created_at: 1,
        updated_at: 2,
      },
    ]);
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'NoUrl', url: '' });

    const result = await loadUserToolServers(db, 'u1');
    expect(result).toHaveLength(0);
  });

  it('handles non-array db.all result', async () => {
    db.all.mockResolvedValueOnce(null);
    const result = await loadUserToolServers(db, 'u1');
    expect(result).toEqual([]);
  });

  it('handles invalid JSON in server_json', async () => {
    db.all.mockResolvedValueOnce([
      { id: 's1', user_id: 'u1', server_json: 'not-json', created_at: 1, updated_at: 2 },
    ]);
    mocks.mergeToolServer.mockReturnValueOnce({ url: '' });
    const result = await loadUserToolServers(db, 'u1');
    expect(result).toEqual([]);
  });
});

describe('getUserToolServer', () => {
  let db;

  beforeEach(() => {
    db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('returns null when db is null', async () => {
    expect(await getUserToolServer(null, 'u1', 's1')).toBeNull();
  });

  it('returns null when userId is null', async () => {
    expect(await getUserToolServer(db, null, 's1')).toBeNull();
  });

  it('returns null when serverId is null', async () => {
    expect(await getUserToolServer(db, 'u1', null)).toBeNull();
  });

  it('returns null when server not found', async () => {
    db.first.mockResolvedValueOnce(null);
    expect(await getUserToolServer(db, 'u1', 'nonexistent')).toBeNull();
  });

  it('returns normalized server when found', async () => {
    const serverData = { name: 'MyMCP', url: 'https://mcp.example.com' };
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(serverData),
      created_at: 1,
      updated_at: 2,
    });
    mocks.mergeToolServer.mockReturnValueOnce({ ...serverData, url: 'https://mcp.example.com' });

    const result = await getUserToolServer(db, 'u1', 's1');
    expect(result).not.toBeNull();
    expect(result.source).toBe('user');
    expect(result.owner_user_id).toBe('u1');
  });
});

describe('createUserToolServer', () => {
  let db;

  beforeEach(() => {
    db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('throws when db is null', async () => {
    await expect(createUserToolServer(null, 'u1', {})).rejects.toThrow('User id is required');
  });

  it('throws when userId is null', async () => {
    await expect(createUserToolServer(db, null, {})).rejects.toThrow('User id is required');
  });

  it('throws when name is missing', async () => {
    mocks.mergeToolServer.mockReturnValueOnce({ url: 'https://mcp.example.com', name: '' });
    await expect(
      createUserToolServer(db, 'u1', { url: 'https://mcp.example.com' })
    ).rejects.toThrow('name and url are required');
  });

  it('throws when url is missing', async () => {
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'MyMCP', url: '' });
    await expect(createUserToolServer(db, 'u1', { name: 'MyMCP' })).rejects.toThrow(
      'name and url are required'
    );
  });

  it('throws when url is not valid HTTP', async () => {
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'MyMCP', url: 'ftp://mcp.example.com' });
    mocks.isValidHttpUrl.mockReturnValueOnce(false);
    await expect(
      createUserToolServer(db, 'u1', { name: 'MyMCP', url: 'ftp://mcp.example.com' })
    ).rejects.toThrow('url must start with http:// or https://');
  });

  it('creates server and returns the new record', async () => {
    const server = { name: 'MyMCP', url: 'https://mcp.example.com' };
    mocks.mergeToolServer.mockReturnValueOnce({ ...server, id: 'new-id' });
    mocks.isValidHttpUrl.mockReturnValueOnce(true);
    // Mock getUserToolServer call after insert
    db.first.mockResolvedValueOnce({
      id: 'new-id',
      user_id: 'u1',
      server_json: JSON.stringify({ ...server, id: 'new-id', source: 'user' }),
    });
    mocks.mergeToolServer.mockReturnValueOnce({
      ...server,
      id: 'new-id',
      url: 'https://mcp.example.com',
    });

    const result = await createUserToolServer(db, 'u1', server);
    expect(result).toMatchObject({
      id: 'new-id',
      name: 'MyMCP',
      url: 'https://mcp.example.com',
      source: 'user',
      owner_user_id: 'u1',
      personal: true,
    });
    const insertCall = db.run.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO user_tool_servers')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toEqual(expect.arrayContaining(['new-id', 'u1', expect.any(String)]));
    const insertedJson = JSON.parse(insertCall[1][2]);
    expect(insertedJson).toMatchObject({
      id: 'new-id',
      name: 'MyMCP',
      url: 'https://mcp.example.com',
      source: 'user',
      owner_user_id: 'u1',
      personal: true,
    });
  });

  it('uses provided id or generates UUID', async () => {
    const server = { name: 'MyMCP', url: 'https://mcp.example.com', id: 'custom-id' };
    mocks.mergeToolServer.mockReturnValueOnce({ ...server });
    mocks.isValidHttpUrl.mockReturnValueOnce(true);
    db.first.mockResolvedValueOnce({
      id: 'custom-id',
      user_id: 'u1',
      server_json: JSON.stringify(server),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ ...server, url: 'https://mcp.example.com' });

    await createUserToolServer(db, 'u1', server);
    expect(db.run).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['custom-id']));
  });
});

describe('updateUserToolServer', () => {
  let db;

  beforeEach(() => {
    db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('throws when db is null', async () => {
    await expect(updateUserToolServer(null, 'u1', 's1', {})).rejects.toThrow(
      'Server id is required'
    );
  });

  it('throws when userId is null', async () => {
    await expect(updateUserToolServer(db, null, 's1', {})).rejects.toThrow('Server id is required');
  });

  it('throws when serverId is null', async () => {
    await expect(updateUserToolServer(db, 'u1', null, {})).rejects.toThrow('Server id is required');
  });

  it('returns null when existing server not found', async () => {
    db.first.mockResolvedValueOnce(null); // getUserToolServer returns null
    const result = await updateUserToolServer(db, 'u1', 'nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('throws when merged result has no name', async () => {
    const existing = { name: 'Old', url: 'https://old.com' };
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(existing),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'Old', url: 'https://old.com' });
    mocks.mergeToolServer.mockReturnValueOnce({ name: '', url: 'https://new.com' });

    await expect(updateUserToolServer(db, 'u1', 's1', { name: '' })).rejects.toThrow(
      'name and url are required'
    );
  });

  it('throws when merged url is invalid', async () => {
    const existing = { name: 'Old', url: 'https://old.com' };
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(existing),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'Old', url: 'https://old.com' });
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'Updated', url: 'ftp://bad.com' });
    mocks.isValidHttpUrl.mockReturnValueOnce(false);

    await expect(updateUserToolServer(db, 'u1', 's1', { url: 'ftp://bad.com' })).rejects.toThrow(
      'url must start with http:// or https://'
    );
  });

  it('updates and returns the updated record', async () => {
    const existing = { name: 'Old', url: 'https://old.com' };
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(existing),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ name: 'Old', url: 'https://old.com' });
    const updated = { name: 'Updated', url: 'https://updated.com' };
    mocks.mergeToolServer.mockReturnValueOnce(updated);
    mocks.isValidHttpUrl.mockReturnValueOnce(true);

    // Mock getUserToolServer after update
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(updated),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ ...updated, url: 'https://updated.com' });

    const result = await updateUserToolServer(db, 'u1', 's1', updated);
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE user_tool_servers'),
      expect.any(Array)
    );
  });
});

describe('deleteUserToolServer', () => {
  let db;

  beforeEach(() => {
    db = {
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('throws when db is null', async () => {
    await expect(deleteUserToolServer(null, 'u1', 's1')).rejects.toThrow('Server id is required');
  });

  it('throws when userId is null', async () => {
    await expect(deleteUserToolServer(db, null, 's1')).rejects.toThrow('Server id is required');
  });

  it('throws when serverId is null', async () => {
    await expect(deleteUserToolServer(db, 'u1', null)).rejects.toThrow('Server id is required');
  });

  it('returns false when server not found', async () => {
    db.first.mockResolvedValueOnce(null);
    const result = await deleteUserToolServer(db, 'u1', 'nonexistent');
    expect(result).toBe(false);
  });

  it('deletes and returns true when server exists', async () => {
    const serverData = { name: 'MyMCP', url: 'https://mcp.example.com' };
    db.first.mockResolvedValueOnce({
      id: 's1',
      user_id: 'u1',
      server_json: JSON.stringify(serverData),
    });
    mocks.mergeToolServer.mockReturnValueOnce({ ...serverData, url: 'https://mcp.example.com' });

    const result = await deleteUserToolServer(db, 'u1', 's1');
    expect(result).toBe(true);
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM user_tool_servers'), [
      'u1',
      's1',
    ]);
  });
});
