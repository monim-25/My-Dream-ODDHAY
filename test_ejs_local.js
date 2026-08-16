const ejs = require('ejs');
const fs = require('fs');

const path = process.argv[2];
const content = fs.readFileSync(path, 'utf8');

try {
    ejs.compile(content);
    console.log('Compile successful!');
} catch (e) {
    console.error('Compile failed:', e);
}
