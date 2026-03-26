const fs = require('fs');
const list = JSON.parse(fs.readFileSync('research/sites_structured.json'));
const urls = list.map(x => x.url).join('\n');
fs.writeFileSync('research/sites.txt', urls);
console.log('Created sites.txt');
