const fs = require('fs');
const filePath = 'f:/oddhay/server/routes/admin.js';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const superAdminRoutes = [
    '/settings',
    '/system-reset',
    '/create-role',
    '/verify-password'
];

let modified = false;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Skip line 5 (the require statement)
    if (i === 4) continue;

    if (line.includes('superAdminProtect')) {
        let isSuperOnly = false;
        for (const route of superAdminRoutes) {
            if (line.includes(`'${route}'`) || line.includes(`"${route}"`)) {
                isSuperOnly = true;
                break;
            }
        }
        
        if (!isSuperOnly) {
            lines[i] = line.replace(/superAdminProtect/g, 'adminProtect');
            modified = true;
        }
    }
}

if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('Successfully updated admin.js');
} else {
    console.log('No changes made');
}
