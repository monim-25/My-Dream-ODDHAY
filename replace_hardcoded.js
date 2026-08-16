const fs = require('fs');
const path = require('path');

const viewDir = path.join(__dirname, 'client/views');

const classPatterns = [
    /\[\s*'Class 6'\s*,\s*'Class 7'\s*,\s*'Class 8'\s*,\s*'Class 9'\s*,\s*'Class 10'\s*,\s*'Class 11'\s*,\s*'Class 12'\s*\]/g,
    /\[\s*'Class 6'\s*,\s*'Class 7'\s*,\s*'Class 8'\s*,\s*'Class 9'\s*,\s*'Class 10'\s*,\s*'HSC 1st Year'\s*,\s*'HSC 2nd Year'\s*,\s*'Admission'\s*,\s*'Skill Development'\s*\]/g,
    /\[\s*'Class 6'\s*,\s*'Class 7'\s*,\s*'Class 8'\s*,\s*'Class 9'\s*,\s*'Class 10'\s*,\s*'Class 11'\s*,\s*'Class 12'\s*,\s*'SSC'\s*,\s*'HSC'\s*,\s*'Admission'\s*,\s*'Skill Development'\s*\]/g,
    /\[\s*'Class 6'\s*,\s*'Class 7'\s*,\s*'Class 8'\s*,\s*'Class 9'\s*,\s*'Class 10'\s*,\s*'HSC 1st Year'\s*,\s*'HSC 2nd Year'\s*,\s*'Admission'\s*,\s*'Skill Development'\s*\]/g
];

const subjectPattern = /\[\s*'Physics',\s*'Chemistry',\s*'Biology',\s*'Higher Mathematics',\s*'General Mathematics',\s*'Bangla',\s*'English',\s*'ICT',\s*'Accounting',\s*'Business Organization',\s*'Finance & Banking',\s*'Economics',\s*'Logic',\s*'Social Science',\s*'Religious Studies'\s*\]/g;

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ejs')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // Replace class arrays
            for (const pattern of classPatterns) {
                if (pattern.test(content)) {
                    content = content.replace(pattern, "((typeof globalAcademicClasses !== 'undefined' ? globalAcademicClasses : []).map(c => c.name))");
                    modified = true;
                }
            }

            // Replace subject arrays
            if (subjectPattern.test(content)) {
                content = content.replace(subjectPattern, "([...new Set((typeof globalAcademicClasses !== 'undefined' ? globalAcademicClasses : []).flatMap(c => c.subjects || []))])");
                modified = true;
            }
            
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Modified:', fullPath);
            }
        }
    }
}

processDirectory(viewDir);
console.log('Done.');
