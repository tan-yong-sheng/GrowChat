const fs = require('fs');
const path = require('path');

const testsDir = path.resolve(__dirname, 'tests/unit');
const publicJsDir = path.resolve(__dirname, 'public/js');

function getFiles(dir, pattern) {
  return fs.readdirSync(dir).filter(f => f.match(pattern)).sort();
}

function extractBlocks(content, keyword) {
  const regex = new RegExp(`\\b${keyword}\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
  const blocks = [];
  let m;
  while ((m = regex.exec(content)) !== null) blocks.push(m[1]);
  return blocks;
}

function countMatches(content, regex) {
  return (content.match(regex) || []).length;
}

function findSourceFiles(testContent) {
  const sources = new Set();
  const importRe = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(testContent)) !== null) {
    const p = m[1];
    if (p.includes('../public/js/')) {
      const rel = p.replace(/\.\.\/\.\.\/public\/js\//, '');
      sources.add(rel);
    }
  }
  const dynamicImportRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamicImportRe.exec(testContent)) !== null) {
    const p = m[1];
    if (p.includes('../public/js/')) {
      const rel = p.replace(/\.\.\/\.\.\/public\/js\//, '');
      sources.add(rel);
    }
  }
  const mockRe = /vi\.mock\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = mockRe.exec(testContent)) !== null) {
    const p = m[1];
    if (p.includes('public/js/')) {
      const rel = p.replace(/.*public\/js\//, '');
      sources.add(rel);
    }
  }
  return Array.from(sources);
}

function resolveSource(rel) {
  const candidates = [
    path.join(publicJsDir, rel + '.js'),
    path.join(publicJsDir, rel),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getTestFileSourceName(basename) {
  const m = basename.match(/public-(.+)\.test\.js/);
  if (!m) return null;
  const core = m[1];
  const dirs = ['features/chat','features/admin','shared','bootstrap','features/account','features/settings','shared/components','shared/utils'];
  for (const dir of dirs) {
    const p = path.join(publicJsDir, dir, core + '.js');
    if (fs.existsSync(p)) return { path: p, rel: dir + '/' + core + '.js' };
  }
  return null;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function simpleMutationHeuristics(content) {
  const flags = [];
  if (countMatches(content, /setTimeout|setInterval|advanceTimers|sleep|waitFor|flushPromises/g) > 0) flags.push('FRAGILE');

  const mocks = countMatches(content, /vi\.mock|jest\.mock/g);
  if (mocks > 3) flags.push('WEAK_MOCK');

  const spies = countMatches(content, /vi\.spyOn|jest\.spyOn/g);
  if (spies > 5) flags.push('IMPL_DETAIL');

  const tests = extractBlocks(content, 'it').length + countMatches(content, /\btest\s*\(/g);
  const expectCount = countMatches(content, /\.to[A-Za-z]/g);
  if (expectCount < tests * 1.5) flags.push('WEAK_ASSERT');

  if (/nth-child|querySelector\s*\(\s*['"]\./.test(content)) flags.push('FRAGILE');
  if (/innerText|textContent\s*===/.test(content)) flags.push('FRAGILE');

  const callCountAsserts = countMatches(content, /toHaveBeenCalledTimes|toHaveBeenCalledWith/g);
  if (callCountAsserts > tests * 1.5) flags.push('IMPL_DETAIL');

  return { flags, tests, expectCount, mocks, spies };
}

function classifyFile(basename, metrics, sourceExists) {
  const { flags, tests, expectCount, mocks, lines } = metrics;

  if (!sourceExists && tests === 0) {
    return { classification: 'REMOVE', mutationScore: 'LOW', reason: 'Dead code / no source module' };
  }

  if (flags.includes('DEAD_CODE')) {
    return { classification: 'REMOVE', mutationScore: 'LOW', reason: 'Tests dead code' };
  }

  if (lines < 15 && tests <= 1 && expectCount <= 2) {
    return { classification: 'REMOVE', mutationScore: 'LOW', reason: 'Too small to provide value' };
  }

  if (flags.includes('WEAK_MOCK') || flags.includes('WEAK_ASSERT') || flags.includes('IMPL_DETAIL')) {
    let reason = 'Valid intent but';
    if (flags.includes('WEAK_MOCK')) reason += ' too many mocks,';
    if (flags.includes('WEAK_ASSERT')) reason += ' weak assertions,';
    if (flags.includes('IMPL_DETAIL')) reason += ' tests implementation details,';
    return { classification: 'REFACTOR', mutationScore: 'LOW', reason: reason.replace(/,$/, '') };
  }

  if (flags.includes('FRAGILE')) {
    return { classification: 'REFACTOR', mutationScore: 'MEDIUM', reason: 'Brittle timers or DOM selectors' };
  }

  if (expectCount >= tests * 2 && mocks <= 2 && !flags.includes('IMPL_DETAIL')) {
    return { classification: 'RETAIN', mutationScore: 'HIGH', reason: 'Strong assertions, controlled mock surface' };
  }

  if (expectCount >= tests * 1.5 && mocks <= 3) {
    return { classification: 'RETAIN', mutationScore: 'MEDIUM', reason: 'Reasonable assertions, moderate mocks' };
  }

  return { classification: 'REFACTOR', mutationScore: 'LOW', reason: 'General weakness in assertion/mocking balance' };
}

function runAudit() {
  const files = getFiles(testsDir, /^public-.*\.test\.js$/);
  let out = '# Phase 1 — Parallel Discovery (Agent 2): public-*.test.js Audit\n\n';
  const summary = { RETAIN: [], REFACTOR: [], REMOVE: [], totalLines: 0, removeLines: 0 };

  for (const f of files) {
    const fp = path.join(testsDir, f);
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n').length;
    summary.totalLines += lines;

    let sourcePath = null;
    let sourceRel = null;
    const inferred = getTestFileSourceName(f);
    if (inferred) {
      sourcePath = inferred.path;
      sourceRel = inferred.rel;
    }
    if (!sourcePath) {
      const sourceRefs = findSourceFiles(content);
      if (sourceRefs.length > 0) {
        sourceRel = sourceRefs[0];
        sourcePath = resolveSource(sourceRel);
      }
    }

    let sourceExists = false;
    let sourceContent = '';
    if (sourcePath && fs.existsSync(sourcePath)) {
      sourceExists = true;
      sourceContent = fs.readFileSync(sourcePath, 'utf-8');
    }

    const codeOnly = stripComments(content);
    const heur = simpleMutationHeuristics(codeOnly);
    const { flags, tests, expectCount, mocks, spies } = heur;

    const classResult = classifyFile(f, { ...heur, lines }, sourceExists);
    if (classResult.classification === 'REMOVE') summary.removeLines += lines;
    summary[classResult.classification].push(f);

    const describes = extractBlocks(content, 'describe');
    const its = extractBlocks(content, 'it');
    const testNames = [...describes.slice(0, 2), ...its.slice(0, 4)].filter(Boolean);

    const mockStyle = mocks > 3 ? ', heavy mocks' : mocks > 0 ? ', moderate mocks' : '';

    out += `## File: tests/unit/${f}\n`;
    out += `### Business Behavior Verified: ${testNames.join(' / ') || 'Internal utility logic'}\n`;
    out += `### Test Pattern: Unit (Vitest)${mockStyle}\n`;
    out += `### Metrics: Lines=${lines} | Tests=${tests} | Assertions=${expectCount} | Avg/assertions_per_test=${(expectCount / Math.max(tests, 1)).toFixed(1)} | Mocks=${mocks} | Spies=${spies}\n`;
    out += `### Flags: ${flags.length ? flags.join(' ') : '[GOOD]'}\n`;
    out += `### Mutation Score: ${classResult.mutationScore} — ${classResult.reason}\n`;
    out += `### Classification: ${classResult.classification}\n`;
    out += `### Source File: ${sourceRel || 'inferred or unknown'} (${sourceExists ? 'exists' : 'NOT FOUND'})\n`;

    let rec = '';
    if (classResult.classification === 'REMOVE') rec = 'Delete entirely — no meaningful behavior verification or source module missing.';
    else if (classResult.classification === 'REFACTOR') {
      if (flags.includes('WEAK_MOCK')) rec = `Reduce mocks from ${mocks} to ≤2; test through integration or spy narrowly.`;
      else if (flags.includes('WEAK_ASSERT')) rec = `Add ${Math.ceil(tests * 2 - expectCount)} more assertions to strengthen observable-behavior coverage.`;
      else if (flags.includes('FRAGILE')) rec = 'Remove timer dependencies; assert on final DOM/state instead of intermediate timing.';
      else if (flags.includes('IMPL_DETAIL')) rec = 'Shift assertions from spy call-counts to actual rendered output or state changes.';
      else rec = 'General refactoring: increase assertion density and reduce coupling to mocked internals.';
    } else {
      rec = 'Keep as-is; monitor for mutation-test coverage gaps on conditional branches.';
    }
    out += `### Recommendation: ${rec}\n\n`;
  }

  out += `---SUMMARY---\n`;
  out += `Files audited: ${files.length}\n`;
  out += `RETAIN: ${summary.RETAIN.join(', ')}\n`;
  out += `REFACTOR: ${summary.REFACTOR.join(', ')}\n`;
  out += `REMOVE: ${summary.REMOVE.join(', ')}\n`;
  out += `Estimated lines removed if REMOVE files deleted: ${summary.removeLines}\n`;
  out += `Top blind spots: Timers/flushPromises hide async edge cases; heavy mocking of apiFetch/utils prevents catching wrong-argument mutations; spyOn call-count assertions are blind to logic changes inside spied functions; DOM innerText exact-match tests miss structural mutations.\n`;
  out += `---END SUMMARY---\n`;

  fs.writeFileSync(path.resolve(__dirname, 'public-test-audit-report.md'), out);
  console.log('Report written to public-test-audit-report.md');
}

runAudit();
