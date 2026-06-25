const { execSync } = require('child_process');
const oldCss = execSync('git show 788cea2:public/styles.css', { encoding: 'utf8' });
const newCss = execSync('git show HEAD:public/styles.css', { encoding: 'utf8' });
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (s) => s.replace(/\s+/g, ' ').trim(); // collapse all whitespace
const o = normalize(stripComments(oldCss));
const n = normalize(stripComments(newCss));

if (o === n) {
  console.log('CSS is functionally identical');
  process.exit(0);
}

// Split by rules: find where a selector starts (a word then {)
// Simpler: split by }
const oRules = o
  .split('}')
  .filter(Boolean)
  .map((r) => r.trim() + '}');
const nRules = n
  .split('}')
  .filter(Boolean)
  .map((r) => r.trim() + '}');

console.log('Old rules:', oRules.length, 'New rules:', nRules.length);

// Normalize each rule by stripping the selector order differences
// and formatting differences
const ruleKey = (r) => {
  // Replace all whitespace runs with single space
  return r.replace(/\s+/g, ' ');
};

const oKeys = oRules.map(ruleKey);
const nKeys = nRules.map(ruleKey);

let same = 0,
  diff = 0;
const maxLen = Math.max(oKeys.length, nKeys.length);
for (let i = 0; i < maxLen; i++) {
  const ok = i < oKeys.length ? oKeys[i] : '';
  const nk = i < nKeys.length ? nKeys[i] : '';
  if (ok === nk) {
    same++;
    continue;
  }
  diff++;
  if (diff <= 15) {
    console.log('\n=== Rule', i, '=== DIFFERENT');
    console.log('OLD:', ok.substring(0, 300));
    console.log('NEW:', nk.substring(0, 300));
  }
}
console.log('\nSame rules:', same, 'Diff rules:', diff);
