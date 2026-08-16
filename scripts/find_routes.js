const fs = require('fs');
const content = fs.readFileSync('f:/oddhay/server/routes/admin.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('superAdminProtect')) {
        console.log(`Line ${index + 1}: ${line.trim()}`);
    }
});
