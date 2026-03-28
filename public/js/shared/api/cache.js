import { readStoredJson, removeStoredValue, writeStoredJson } from '../utils/storage.js';

const MODEL_CACHE_KEY = 'growchat_models_cache_v1';
const CHAT_CACHE_KEY_PREFIX = 'growchat_chats_cache_v1_';
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;
const CHAT_CACHE_TTL_MS = 30 * 1000;

function readCache(storageKey, maxAgeMs) {
  const parsed = readStoredJson(localStorage, storageKey, null);
  if (!parsed || typeof parsed !== 'object') return null;
  const savedAt = Number(parsed.savedAt || 0);
  if (maxAgeMs && savedAt && Date.now() - savedAt > maxAgeMs) return null;
  return parsed;
}

function writeCache(storageKey, value) {
  writeStoredJson(localStorage, storageKey, { savedAt: Date.now(), value });
}

function getChatsCacheKey(userId) {
  const safeId = String(userId || '').trim() || 'anonymous';
  return `${CHAT_CACHE_KEY_PREFIX}${safeId}`;
}

export function readModelsCache(maxAgeMs = MODEL_CACHE_TTL_MS) {
  const entry = readCache(MODEL_CACHE_KEY, maxAgeMs);
  return entry ? entry.value : null;
}

export function writeModelsCache(payload) {
  writeCache(MODEL_CACHE_KEY, payload);
}

export function clearModelsCache() {
  removeStoredValue(localStorage, MODEL_CACHE_KEY);
}

export function readChatsCache(userId, maxAgeMs = CHAT_CACHE_TTL_MS) {
  if (!userId) return null;
  const entry = readCache(getChatsCacheKey(userId), maxAgeMs);
  return entry ? entry.value : null;
}

export function writeChatsCache(userId, payload) {
  if (!userId) return;
  writeCache(getChatsCacheKey(userId), payload);
}
