const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.css') || file.endsWith('.md')) results.push(file);
  });
  return results;
}
const files = walk('./src');
files.push('./CLAUDE.md');
let updatedCount = 0;
files.forEach(f => {
  if (!fs.existsSync(f)) return;
  let content = fs.readFileSync(f, 'utf8');
  let newContent = content.replace(/LIFEOS/g, 'HELM')
                          .replace(/LifeOS/g, 'Helm')
                          .replace(/lifeos/g, 'helm');
  if (content !== newContent) {
    fs.writeFileSync(f, newContent, 'utf8');
    console.log('Updated', f);
    updatedCount++;
  }
});
console.log(`Updated ${updatedCount} files.`);
