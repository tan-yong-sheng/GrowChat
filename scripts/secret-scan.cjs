#!/usr/bin/env node
/**
 * Secret scanning with caching - only scans changed files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SECRET_PATTERNS = [
  { name: 'AWS Secret Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Access Key', regex: /aws_secret_access_key\s*=\s*["'][^"']+["']/gi },
  { name: 'GitHub Personal Token', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub OAuth Token', regex: /gho_[a-zA-Z0-9]{36}/g },
  { name: 'Stripe Live Key', regex: /sk_live_[a-zA-Z0-9]{24,}/g },
  { name: 'Stripe Test Key', regex: /sk_test_[a-zA-Z0-9]{24,}/g },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'Database Connection', regex: /mysql:\/\/[^:]+:[^@]+@/g },
  { name: 'Password in URL', regex: /(?:password|passwd|pwd)\s*=\s*["'][^"']+["']/gi },
];

const CACHE_FILE = '.secrets.cache.json';

function loadCache() {
  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return require('crypto').createHash('md5').update(content).digest('hex');
  } catch {
    return null;
  }
}

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.zip',
  '.tar',
  '.gz',
  '.woff',
  '.woff2',
  '.ttf',
]);
const SKIP_PATH_FRAGMENTS = ['node_modules', '.git', 'coverage', 'dist', 'build'];
const SKIP_SUFFIXES = ['.test.js', '.spec.js', '.spec.ts'];

function hasSkipPathFragment(filePath) {
  return SKIP_PATH_FRAGMENTS.some((frag) => filePath.includes(frag));
}

function hasSkipSuffix(filePath) {
  return SKIP_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function shouldSkipFile(filePath) {
  if (SKIP_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  if (hasSkipPathFragment(filePath)) return true;
  return hasSkipSuffix(filePath);
}

function collectFindings(filePath, content) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex) || [];
    if (matches.length > 0) {
      findings.push({
        file: filePath,
        type: pattern.name,
        matches: matches.slice(0, 3),
      });
    }
  }
  return findings;
}

function updateFileCache(filePath, fileHash, cache) {
  if (fileHash) {
    cache[filePath] = { hash: fileHash };
  }
}

function tryScanFile(filePath, fileHash, cache) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = collectFindings(filePath, content);
    updateFileCache(filePath, fileHash, cache);
    return findings.length > 0 ? findings : null;
  } catch {
    return null;
  }
}

function isCacheHit(filePath, fileHash, cache) {
  return fileHash && cache[filePath]?.hash === fileHash;
}

function scanFile(filePath, cache) {
  if (shouldSkipFile(filePath)) return null;
  const fileHash = getFileHash(filePath);
  if (isCacheHit(filePath, fileHash, cache)) return null;
  return tryScanFile(filePath, fileHash, cache);
}

function getStagedFiles() {
  try {
    const result = execSync('git diff --cached --name-only --diff-filter=ACM').toString();
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function isCacheFile(file) {
  return file === '.secrets.baseline' || file === '.secrets.cache.json';
}

function scanFilesForSecrets(files, cache) {
  let allFindings = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  files.forEach(file => {
    if (isCacheFile(file)) return;
    const findings = scanFile(file, cache);
    if (findings) {
      allFindings = allFindings.concat(findings);
    } else if (cache[file]) {
      cacheHits++;
    } else {
      cacheMisses++;
    }
  });

  return { allFindings, cacheHits, cacheMisses };
}

function main() {
  const cache = loadCache();
  const stagedFiles = getStagedFiles();

  console.log('🔍 Secret scanning staged files...');

  if (stagedFiles.length === 0) {
    console.log('No staged files to scan.');
    process.exit(0);
  }

  const { allFindings, cacheHits, cacheMisses } = scanFilesForSecrets(stagedFiles, cache);
  saveCache(cache);

  if (allFindings.length === 0) {
    console.log(
      `✅ No secrets detected in staged files. Cache: ${cacheHits} hits, ${cacheMisses} misses.`
    );
    process.exit(0);
  }

  console.log('\n❌ Potential secrets detected in staged files:\n');

  for (const finding of allFindings) {
    console.log(`  📁 ${finding.file}`);
    console.log(`  🔑 Type: ${finding.type}`);
    console.log(`  🔍 Matches: ${finding.matches.length}`);
    console.log('');
  }

  console.log(`Found ${allFindings.length} files with potential secrets.`);
  process.exit(1);
}

main();
