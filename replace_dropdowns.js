const fs = require('fs');
const path = require('path');

const viewDir = path.join(__dirname, 'client/views');

const regexMap = [
    {
        pattern: /<option value="6">Class 6<\/option>[\s\S]*?<option value="11-12">Class 11-12 \(HSC\)<\/option>/g,
        replacement: `<% (globalAcademicClasses || []).forEach(cls => { 
                                        let val = cls.name.replace('Class ', '');
                                    %>
                                        <option value="<%= val %>"><%= cls.name %></option>
                                    <% }) %>`
    }
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ejs')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            for (const {pattern, replacement} of regexMap) {
                if (pattern.test(content)) {
                    content = content.replace(pattern, replacement);
                    modified = true;
                }
            }

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Modified:', fullPath);
            }
        }
    }
}

processDirectory(viewDir);
console.log('Done dropdowns part 4.');
