const fs = require('fs');
const files = ['manifest.json', 'package.json'];

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const versionParts = data.version.split('.');
  versionParts[2] = parseInt(versionParts[2], 10) + 1;
  data.version = versionParts.join('.');
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${file} to version ${data.version}`);
});
