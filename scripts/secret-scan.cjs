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

function scanFile(filePath, cache) {
  const ext = path.extname(filePath).toLowerCase();

  const skipExtensions = [
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
  ];
  if (skipExtensions.includes(ext)) return null;

  if (filePath.includes('node_modules') || filePath.includes('.git')) return null;
  if (filePath.includes('coverage') || filePath.includes('dist') || filePath.includes('build'))
    return null;
  if (
    filePath.endsWith('.test.js') ||
    filePath.endsWith('.spec.js') ||
    filePath.endsWith('.spec.ts')
  )
    return null;

  // Check cache first
  const fileHash = getFileHash(filePath);
  if (fileHash && cache[filePath] && cache[filePath].hash === fileHash) {
    return null; // Cache hit, no new secrets
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
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

    // Update cache
    if (fileHash) {
      cache[filePath] = { hash: fileHash };
    }

    return findings.length > 0 ? findings : null;
  } catch {
    return null;
  }
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

function main() {
  const cache = loadCache();
  const stagedFiles = getStagedFiles();

  console.log('🔍 Secret scanning staged files...');

  if (stagedFiles.length === 0) {
    console.log('No staged files to scan.');
    process.exit(0);
  }

  let allFindings = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const file of stagedFiles) {
    if (isCacheFile(file)) continue;

    const findings = scanFile(file, cache);
    if (findings) {
      allFindings = allFindings.concat(findings);
    } else if (cache[file]) {
      cacheHits++;
    } else {
      cacheMisses++;
    }
  }

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
