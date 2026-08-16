const fs = require('fs');
const files = [
    'client/views/teacher-dashboard.ejs',
    'client/views/admin-quizzes.ejs',
    'client/views/admin-question-bank.ejs',
    'client/views/admin-notes.ejs',
    'client/views/admin-qas.ejs',
    'client/views/admin-course-details.ejs'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    // Replace href="/admin/..." and action="/admin/..." and href='/admin/...'
    content = content.replace(/(href|action)=["']\/admin\//g, '$1="/superadmin/');
    // Replace window.location.href='/admin/...'
    content = content.replace(/window\.location\.href=['"]\/admin\//g, 'window.location.href=\'/superadmin/');
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
});
