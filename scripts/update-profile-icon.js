const fs = require('fs');
const files = ['student-dashboard.ejs', 'routine.ejs', 'profile.ejs', 'notes.ejs', 'messages.ejs', 'library.ejs', 'courses.ejs', 'analytics.ejs'];

files.forEach(f => {
    let p = 'client/views/' + f;
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');

        const pattern = /<div\s+class="w-9 h-9 ml-2 rounded-full overflow-hidden shrink-0 cursor-pointer border-2 border-slate-100 dark:border-slate-700">([\s\S]*?)<\/div>/;
        const replacement = '<a href="/profile" class="w-9 h-9 ml-2 rounded-full overflow-hidden shrink-0 cursor-pointer border-2 border-slate-100 dark:border-slate-700 block">$1</a>';

        if (pattern.test(content)) {
            content = content.replace(pattern, replacement);
            fs.writeFileSync(p, content);
            console.log('Updated ' + f);
        } else {
            console.log('No match found in ' + f);
        }
    } else {
        console.log('File not found: ' + p);
    }
});
