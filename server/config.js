// Shared config - DB connection, middlewares, models
const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

// ---- Cached DB connection (serverless-safe) ----
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

const connectDB = async () => {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4,
            maxPoolSize: 10
        }).then(m => { console.log('✅ MongoDB Connected'); return m; })
            .catch(err => { console.error('❌ MongoDB Error:', err); throw err; });
    }
    try { cached.conn = await cached.promise; }
    catch (e) { cached.promise = null; throw e; }
    return cached.conn;
};

// ---- Auth Middlewares ----
const protect = (req, res, next) => {
    const userId = req.session.userId || (req.session.user ? req.session.user._id : null);
    if (userId) { if (!req.session.userId) req.session.userId = userId; next(); }
    else {
        if (req.path.startsWith('/api') || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        res.redirect('/login');
    }
};

// Strict Super Admin verification helper: ONLY monimmdmonim41@gmail.com is superadmin
const SUPER_ADMIN_EMAIL_DEFAULT = 'monimmdmonim41@gmail.com';
if (!process.env.SUPER_ADMIN_EMAIL) {
    process.env.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL_DEFAULT;
}

const isSuperAdmin = (user) => {
    if (!user) return false;
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || SUPER_ADMIN_EMAIL_DEFAULT).toLowerCase().trim();
    const userEmail = (user.email || '').toLowerCase().trim();
    // Primary: email match is the strongest authority
    if (superEmail && userEmail === superEmail) return true;
    // Fallback: role is superadmin
    if (user.role === 'superadmin') return true;
    return false;
};

const adminProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    const user = req.session.user;
    const role = user.role;
    const isSuper = isSuperAdmin(user);

    // Administrative staff only (teachers have their own /teacher panel)
    if (isSuper || ['admin', 'content_manager', 'support', 'moderator'].includes(role)) {
        return next();
    }

    console.warn(`Admin Access Denied: User=${user.email}, Role=${role}`);
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: Administrative staff only.' });
    }
    if (role === 'teacher') return res.redirect('/teacher');
    if (role === 'parent') return res.redirect('/parent/dashboard');
    res.redirect('/dashboard');
};

// Strict Admin Only (Admin & Superadmin only - excludes support/moderator/content_manager)
const adminOnlyProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    const user = req.session.user;
    if (isSuperAdmin(user) || user.role === 'admin') {
        return next();
    }

    console.warn(`[SECURITY] AdminOnly Access Denied: User=${user.email}, Role=${user.role}`);
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: Admin authority required.' });
    }
    res.status(403).send('Access Denied: Administrator authority required.');
};

// Strict Financial Protection: Only Super Admin and Admin can view payments, refunds, revenue
const financeProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    const user = req.session.user;
    if (isSuperAdmin(user) || user.role === 'admin') {
        return next();
    }

    console.warn(`[SECURITY] Financial Access Denied: User=${user.email}, Role=${user.role}`);
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: Financial records are restricted.' });
    }
    res.status(403).send('Access Denied: Financial records are restricted.');
};

// Strict User Management Protection: Only Super Admin and Admin can view/edit/delete users or reset passwords
const userManagementProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    const user = req.session.user;
    if (isSuperAdmin(user) || user.role === 'admin') {
        return next();
    }

    console.warn(`[SECURITY] User Management Denied: User=${user.email}, Role=${user.role}`);
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: User management is restricted.' });
    }
    res.status(403).send('Access Denied: User management is restricted.');
};

const superAdminProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }

    const user = req.session.user;
    if (isSuperAdmin(user)) {
        return next();
    }

    console.warn(`[SECURITY] SuperAdmin Access Denied: User=${user.email}, Role=${user.role}. Required SUPER_ADMIN_EMAIL: ${process.env.SUPER_ADMIN_EMAIL}`);

    // If API/AJAX call
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: Super Admin only.' });
    }

    // Admins have their own panel — redirect them to /admin!
    if (user.role === 'admin' || user.role === 'content_manager' || user.role === 'support' || user.role === 'moderator') {
        return res.redirect('/admin');
    }

    if (user.role === 'teacher') {
        return res.redirect('/teacher');
    }

    res.redirect('/dashboard');
};

const teacherProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
    const user = req.session.user;
    if (user.role === 'teacher' || isSuperAdmin(user) || user.role === 'admin') {
        return next();
    }
    if ((req.path && req.path.startsWith('/api')) || req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access Denied: Teachers only.' });
    }
    res.status(403).send('শুধুমাত্র শিক্ষকরা এই পেজটি অ্যাক্সেস করতে পারবেন।');
};

// Content management: roles allowed to ADD/EDIT/DELETE content
const contentAdminProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = req.session.user;
    if (['admin', 'superadmin', 'teacher', 'content_manager'].includes(user.role) || isSuperAdmin(user)) {
        return next();
    }
    res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন, কন্টেন্ট ম্যানেজার এবং শিক্ষক কন্টেন্ট যোগ/সম্পাদনা করতে পারবেন।' });
};

const parentProtect = (req, res, next) => {
    if (req.session && req.session.user && (req.session.user.role === 'parent' || req.session.user.role === 'guardian' || isSuperAdmin(req.session.user))) {
        return next();
    }
    res.redirect('/login');
};

const studentProtect = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login');
    }
    const user = req.session.user;
    if (user.role === 'student' || isSuperAdmin(user) || user.role === 'admin') {
        return next();
    }
    if (user.role === 'teacher') return res.redirect('/teacher');
    if (user.role === 'parent') return res.redirect('/parent/dashboard');
    return res.redirect('/login');
};

// ---- Models ----
const models = {
    Course: require('./models/Course'),
    User: require('./models/User'),
    Quiz: require('./models/Quiz'),
    Question: require('./models/Question'),
    Note: require('./models/Note'),
    QuestionBank: require('./models/QuestionBank'),
    QA: require('./models/QA'),
    Notification: require('./models/Notification'),
    PushSubscription: require('./models/PushSubscription'),
    NotificationLog: require('./models/NotificationLog'),
    Message: require('./models/Message'),
    Payment: require('./models/Payment'),
    Coupon: require('./models/Coupon'),
    SystemLog: require('./models/SystemLog'),
    Setting: require('./models/Setting'),
    VideoAsset: require('./models/VideoAsset'),
    CourseProgress: require('./models/CourseProgress'),
    Book: require('./models/Book'),
    Announcement: require('./models/Announcement'),
    RoutineTask: require('./models/RoutineTask'),
    Folder: require('./models/Folder'),
};

module.exports = { 
    connectDB, 
    isSuperAdmin, 
    protect, 
    adminProtect, 
    adminOnlyProtect, 
    financeProtect, 
    userManagementProtect, 
    superAdminProtect, 
    contentAdminProtect, 
    teacherProtect, 
    parentProtect, 
    studentProtect, 
    ...models 
};
