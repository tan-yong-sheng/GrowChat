import fs from 'fs';
const d = JSON.parse(fs.readFileSync('lint-tmp.json', 'utf8'));
const errors = [];
const warnings = [];
d.filter((f) => f.messages.length > 0).forEach((f) => {
  const p = f.filePath
    .split('GrowChat')
    .pop()
    .replace(/^[/\\]/, '');
  f.messages.forEach((m) => {
    if (m.severity === 2) errors.push(`${p}:${m.line} ${m.ruleId}`);
    else if (m.severity === 1) warnings.push(`${p}:${m.line} ${m.ruleId}`);
  });
});
console.log('=== ERRORS (' + errors.length + ') ===');
errors.forEach((e) => console.log(e));
console.log('\n=== WARNINGS (' + warnings.length + ') ===');
warnings.forEach((e) => console.log(e));
