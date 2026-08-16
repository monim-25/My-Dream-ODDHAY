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
    else res.redirect('/login');
};

const adminProtect = (req, res, next) => {
    const role = req.session.user ? req.session.user.role : null;
    const email = req.session.user ? (req.session.user.email || '').toLowerCase().trim() : '';
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const isMaster = email && superEmail && email === superEmail;

    if (req.session.user && (['admin', 'superadmin', 'teacher', 'content_manager', 'support', 'moderator'].includes(role) || isMaster)) next();
    else if (!req.session.user) res.redirect('/login');
    else {
        console.warn(`Admin Access Denied: User=${email}, Role=${role}, Master=${isMaster}`);
        res.status(403).send('Access Denied');
    }
};

const superAdminProtect = (req, res, next) => {
    const role = req.session.user ? req.session.user.role : null;
    const email = req.session.user ? (req.session.user.email || '').toLowerCase().trim() : '';
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const isMaster = email && superEmail && email === superEmail;

    if (req.session.user && (role === 'superadmin' || isMaster)) next();
    else if (!req.session.user) res.redirect('/login');
    else {
        console.warn(`SuperAdmin Access Denied: User=${email}, Role=${role}, Master=${isMaster}`);
        res.status(403).send('Access Denied');
    }
};

const teacherProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'teacher') next();
    else res.status(403).send('শুধুমাত্র শিক্ষকরা এই পেজটি অ্যাক্সেস করতে পারবেন।');
};

// Content management: roles allowed to ADD/EDIT/DELETE content
const contentAdminProtect = (req, res, next) => {
    if (req.session.user && ['admin', 'superadmin', 'teacher'].includes(req.session.user.role)) next();
    else res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন, শিক্ষক এবং সুপার অ্যাডমিন কন্টেন্ট যোগ/সম্পাদনা করতে পারবেন।' });
};

const parentProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'parent') next();
    else res.redirect('/login');
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

module.exports = { connectDB, protect, adminProtect, superAdminProtect, contentAdminProtect, teacherProtect, parentProtect, ...models };
