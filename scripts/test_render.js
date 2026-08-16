const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'client', 'views', 'student-dashboard.ejs');
let template = fs.readFileSync(templatePath, 'utf8');

// Mock data
const mockData = {
    user: {
        name: 'Test Student',
        email: 'test@example.com',
        phone: '01700000000',
        classLevel: 'Class 10',
        createdAt: new Date(),
        activationStatus: 'active',
        _id: '507f1f77bcf86cd799439011',
        quizResults: [],
        lastWatchedLesson: null,
        parentRequests: [],
        streak: 5
    },
    todayTasks: [],
    upcomingTasks: [],
    priorityAlert: null,
    motivationalQuote: 'Success is not final, failure is not fatal.',
    activePage: 'dashboard',
    notifications: [],
    pendingParents: [],
    locals: {
        notifications: [],
        pendingParents: [],
        priorityAlert: null,
        motivationalQuote: 'Success is not final, failure is not fatal.'
    }
};

try {
    const html = ejs.render(template, mockData, {
        filename: templatePath,
        root: path.join(__dirname, 'client', 'views') // For partials
    });
    fs.writeFileSync('f:/oddhay/test_output.html', html);
    console.log('Template rendered successfully to test_output.html!');
} catch (err) {
    console.error('Render Error:');
    console.error(err.message);
    process.exit(1);
}
