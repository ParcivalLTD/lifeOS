const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.tsx')) results.push(file);
  });
  return results;
}
const files = walk('./src');
let updatedCount = 0;
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  // Replaces standard div grids
  let newContent = content.replace(/grid grid-cols-\[repeat\(auto-fit,minmax\((\d+px),1fr\)\)\] items-start gap-3/g, 
    "columns-[$1] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full");
  
  // Replaces grid on <main> which usually has "mx-auto grid w-full ..."
  newContent = newContent.replace(/grid w-full (max-w-\[[^\]]+\]) grid-cols-\[repeat\(auto-fit,minmax\((\d+px),1fr\)\)\] items-start gap-3/g,
    "w-full $1 columns-[$2] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full");

  // Replaces grid on finance-view.tsx which might have different gap or no items-start
  // Or review-view.tsx: grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 p-3
  newContent = newContent.replace(/grid grid-cols-\[repeat\(auto-fit,minmax\((\d+px),1fr\)\)\] gap-3/g,
    "columns-[$1] gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid [&>*]:inline-block [&>*]:w-full");

  if (content !== newContent) {
    fs.writeFileSync(f, newContent, 'utf8');
    console.log('Updated', f);
    updatedCount++;
  }
});
console.log(`Updated ${updatedCount} files.`);
