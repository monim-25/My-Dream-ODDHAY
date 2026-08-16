const fs = require('fs');
const filePath = 'server/routes/admin.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace redirects 
content = content.replace(/res\.redirect\(['"`]\/admin\//g, (match) => {
    return match.replace(/\/admin\//, '/superadmin/');
});

// Remove duplicate /logs route at the bottom
const logsRouteCode = `router.get('/logs', superAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const SystemLog = require('../models/SystemLog');
        const logs = await SystemLog.find().populate('performedBy', 'name email role').sort({ createdAt: -1 }).limit(100).lean();

        res.render('admin/system-logs', { user: req.session.user, logs, active: 'logs' });
    } catch (err) {
        res.status(500).send('Error loading logs: ' + err.message);
    }
});`;

content = content.replace(logsRouteCode, '');

fs.writeFileSync(filePath, content);
console.log('Fixed admin.js successfully.');
