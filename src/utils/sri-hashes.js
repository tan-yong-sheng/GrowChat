const SRI_RESOURCES = {
  'bootstrap-icons': {
    url: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  },
  'katex-css': {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  },
  'marked': {
    url: 'https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js',
  },
  'katex-js': {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  },
  'mermaid': {
    url: 'https://cdn.jsdelivr.net/npm/mermaid@11.0.2/dist/mermaid.min.js',
  },
  'graphviz': {
    url: 'https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@1.12.8/dist/index.js',
  },
  'dompurify': {
    url: 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs',
  },
};

const sriCache = new Map();

const SRI_CACHE_KEY = 'sri-hashes:v2';
const SRI_CACHE_TTL_SECONDS = 86400;
const SRI_PARTIAL_CACHE_TTL_SECONDS = 60;
const SRI_FETCH_TIMEOUT_MS = 10000;

const SRI_INJECT_PATTERNS = new Map([
  ['bootstrap-icons', /data-sri-key="bootstrap-icons"/g],
  ['katex-css', /data-sri-key="katex-css"/g],
  ['marked', /data-sri-key="marked"/g],
  ['katex-js', /data-sri-key="katex-js"/g],
  ['mermaid', /data-sri-key="mermaid"/g],
  ['graphviz', /data-sri-key="graphviz"/g],
  ['dompurify', /data-sri-key="dompurify"/g],
]);

const sriHashesState = { value: null, expiresAt: 0 };

const sriWarningState = {
  fetchFailures: new Set(),
  missingHashes: new Set(),
};

let sriHashesPromise = null;

async function computeSriHash(buffer) {
  const digest = await crypto.subtle.digest('SHA-384', buffer);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
}

async function fetchSriHash(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SRI_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return computeSriHash(await response.arrayBuffer());
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readPersistedSriHashes(env) {
  if (!env?.CACHE) return null;
  try {
    const cached = await env.CACHE.get(SRI_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.warn('Failed to read cached SRI hashes:', err?.message || err);
    return null;
  }
}

async function persistSriHashes(env, hashes) {
  if (!env?.CACHE) return;
  try {
    await env.CACHE.put(SRI_CACHE_KEY, JSON.stringify(hashes), {
      expirationTtl: SRI_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    console.warn('Failed to cache SRI hashes:', err?.message || err);
  }
}

async function refreshMissingSriHashesInBackground(env, missingEntries = [], baseHashes = {}) {
  if (!Array.isArray(missingEntries) || missingEntries.length === 0) return;

  const entries = await Promise.all(
    missingEntries.map(async ([key, resource]) => {
      try {
        const hash = await fetchSriHash(resource.url);
        sriCache.set(key, { url: resource.url, hash });
        return [key, hash];
      } catch (err) {
        if (!sriWarningState.fetchFailures.has(key)) {
          sriWarningState.fetchFailures.add(key);
          console.warn(`Failed to fetch SRI hash for ${key}:`, err?.message || err);
        }
        return [key, null];
      }
    })
  );

  const nextHashes = { ...baseHashes };
  let changed = false;
  for (const [key, hash] of entries) {
    if (!hash) continue;
    nextHashes[key] = hash;
    changed = true;
  }

  if (!changed) return;

  sriHashesState.value = nextHashes;
  sriHashesState.expiresAt = Date.now() + SRI_CACHE_TTL_SECONDS * 1000;

  await persistSriHashes(env, nextHashes);
}

async function loadSriHashes(env) {
  if (sriHashesState.value && Date.now() < sriHashesState.expiresAt) return sriHashesState.value;

  if (sriHashesPromise) return sriHashesPromise;

  sriHashesPromise = (async () => {
    const persistedHashes = await readPersistedSriHashes(env);
    const hashes = {};
    const missingEntries = [];

    for (const [key, resource] of Object.entries(SRI_RESOURCES)) {
      const cached = sriCache.get(key);
      if (cached?.url === resource.url && cached.hash) {
        hashes[key] = cached.hash;
        continue;
      }
      if (persistedHashes?.[key]) {
        sriCache.set(key, { url: resource.url, hash: persistedHashes[key] });
        hashes[key] = persistedHashes[key];
        continue;
      }
      hashes[key] = null;
      missingEntries.push([key, resource]);
    }

    const hasMissing = missingEntries.length > 0;
    sriHashesState.value = hashes;
    sriHashesState.expiresAt =
      Date.now() + (hasMissing ? SRI_PARTIAL_CACHE_TTL_SECONDS : SRI_CACHE_TTL_SECONDS) * 1000;

    if (hasMissing) {
      void refreshMissingSriHashesInBackground(env, missingEntries, hashes);
    } else {
      await persistSriHashes(env, hashes);
    }

    return hashes;
  })().finally(() => {
    sriHashesPromise = null;
  });

  return sriHashesPromise;
}

function injectSriHashes(html, hashes) {
  let modified = html;

  for (const [key, hashValue] of Object.entries(hashes)) {
    if (!hashValue) {
      if (!sriWarningState.missingHashes.has(key)) {
        sriWarningState.missingHashes.add(key);
        console.warn(`SRI hash missing for ${key} — resource will load without integrity check`);
      }
      continue;
    }

    const pattern = SRI_INJECT_PATTERNS.get(key);
    if (!pattern) continue;

    modified = modified.replace(pattern, `integrity="${hashValue}" crossorigin="anonymous"`);
  }

  return modified;
}

async function getSriHashes(env) {
  return loadSriHashes(env);
}

export { getSriHashes, injectSriHashes, SRI_RESOURCES, SRI_INJECT_PATTERNS };
