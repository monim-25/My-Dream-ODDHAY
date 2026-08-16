const fs = require('fs');
const path = require('path');
const filePath = 'f:/oddhay/client/views/admin/dashboard.ejs';
let content = fs.readFileSync(filePath, 'utf8');
const oldText = '<% - JSON.stringify';
const newText = '<%- JSON.stringify';
if (content.includes(oldText)) {
    content = content.replace(oldText, newText);
    fs.writeFileSync(filePath, content);
    console.log('Successfully replaced the text!');
} else {
    console.log('Target text not found exactly as specified.');
}
