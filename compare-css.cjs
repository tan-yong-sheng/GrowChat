const { execSync } = require('child_process');
const oldCss = execSync('git show 788cea2:public/styles.css', { encoding: 'utf8' });
const newCss = execSync('git show HEAD:public/styles.css', { encoding: 'utf8' });
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const o = stripComments(oldCss)
  .split('\n')
  .filter((l) => l.trim());
const n = stripComments(newCss)
  .split('\n')
  .filter((l) => l.trim());
console.log('Old non-comment lines:', o.length);
console.log('New non-comment lines:', n.length);
let same = 0,
  diff = 0;
const maxLen = Math.max(o.length, n.length);
for (let i = 0; i < maxLen; i++) {
  const ol = i < o.length ? o[i].trim() : '';
  const nl = i < n.length ? n[i].trim() : '';
  if (ol === nl) same++;
  else diff++;
}
console.log('Same lines:', same, 'Different lines:', diff);
let shown = 0;
for (let i = 0; i < maxLen && shown < 30; i++) {
  const ol = i < o.length ? o[i].trim() : '(missing)';
  const nl = i < n.length ? n[i].trim() : '(missing)';
  if (ol !== nl) {
    console.log('Diff line', i);
    console.log('  OLD:', ol.substring(0, 200));
    console.log('  NEW:', nl.substring(0, 200));
    shown++;
  }
}
