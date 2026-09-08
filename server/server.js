// Forced restart at 2026-08-31T20:14:50
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
// ODDHAY Command Center - Force Design Sync
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo').MongoStore || require('connect-mongo');
const { isSuperAdmin, superAdminProtect } = require('./config');

const app = express();
const http = require('http').createServer(app);
const { Server: SocketIO } = require('socket.io');
const io = new SocketIO(http, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
});

app.set('io', io); // Expose io for routes to use

const PORT = process.env.PORT || 3005;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

// ---- PATH RESOLUTION ----
let clientPath;
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    clientPath = fs.existsSync(path.join(process.cwd(), 'client'))
        ? path.join(process.cwd(), 'client')
        : path.join(__dirname, '../client');
} else {
    clientPath = path.join(__dirname, '../client');
}
console.log('✅ Resolved Client Path:', clientPath);

// ---- DATABASE ----
mongoose.set('strictQuery', false);
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

const connectDB = async () => {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false, serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000, family: 4, maxPoolSize: 10
        }).then(m => { console.log('✅ MongoDB Connected'); return m; })
            .catch(err => { console.error('❌ MongoDB Error:', err); throw err; });
    }
    try { cached.conn = await cached.promise; }
    catch (e) { cached.promise = null; throw e; }
    return cached.conn;
};

// ---- SESSION ----
const sessionStore = MongoStore.create({ mongoUrl: MONGODB_URI, ttl: 14 * 24 * 60 * 60, autoRemove: 'native', touchAfter: 24 * 3600 });
sessionStore.on('error', (err) => console.warn('⚠️ MongoStore error:', err.message));

app.use(session({
    secret: 'oddhay_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
}));

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ---- MULTER (file uploads) ----
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = '/tmp/uploads/';
        if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
            try {
                const localDest = path.join(clientPath, 'public/uploads/');
                if (fs.existsSync(path.join(clientPath, 'public'))) dest = localDest;
            } catch (e) { /* ignore */ }
        }
        if (file.fieldname === 'thumbnail') dest += 'thumbnails/';
        else if (file.fieldname === 'video') dest += 'videos/';
        else if (file.fieldname === 'note') dest += 'notes/';
        else if (file.fieldname === 'book') dest += 'books/';
        else if (file.fieldname === 'routineImage') dest += 'routines/';
        else if (file.fieldname === 'file') dest += 'questions/';
        try { fs.mkdirSync(dest, { recursive: true }); cb(null, dest); }
        catch (err) { cb(err, '/tmp/'); }
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ---- MIDDLEWARE ----
app.set('view engine', 'ejs');
app.set('views', path.join(clientPath, 'views'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(clientPath, 'public')));
app.use(express.static(path.join(process.cwd(), 'public')));

// Smart fallback for uploads stored in category subfolders (thumbnails, avatars, routines, videos, notes)
app.use('/uploads', (req, res, next) => {
    const rawPath = req.path.replace(/^\//, '');
    if (!rawPath || rawPath.includes('..')) return next();
    
    const uploadsDir = path.join(clientPath, 'public/uploads');
    const directFile = path.join(uploadsDir, rawPath);
    if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
        return res.sendFile(directFile);
    }
    
    // Check inside subfolders if not found directly
    const subfolders = ['thumbnails', 'avatars', 'videos', 'notes', 'routines', 'questions', 'messages', 'evaluations', 'user-notes'];
    for (const sub of subfolders) {
        const candidate = path.join(uploadsDir, sub, rawPath);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return res.sendFile(candidate);
        }
    }
    next();
});

let cachedAcademicClasses = null;
let lastAcademicCacheTime = 0;
const ACADEMIC_CACHE_TTL = 10 * 60 * 1000;

app.use(async (req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL; // Also provide the email if needed
    res.locals.unreadNotificationCount = 0;

    const uid = req.session && (req.session.userId || (req.session.user ? (req.session.user._id || req.session.user.id) : null));
    if (uid && mongoose.connection.readyState === 1) {
        try {
            if (!res.locals.user) {
                const User = require('./models/User');
                const dbUser = await User.findById(uid).lean();
                if (dbUser) {
                    res.locals.user = dbUser;
                    req.session.user = dbUser;
                }
            }
            const Notification = require('./models/Notification');
            res.locals.unreadNotificationCount = await Notification.countDocuments({
                user: uid,
                isRead: false
            });
        } catch (e) {}
    }

    // Role Enforcement: ONLY monimmdmonim41@gmail.com can be superadmin
    if (req.session && req.session.user) {
        const superEmail = (process.env.SUPER_ADMIN_EMAIL || 'monimmdmonim41@gmail.com').toLowerCase().trim();
        const userEmail = (req.session.user.email || '').toLowerCase().trim();
        if (userEmail === superEmail) {
            req.session.user.role = 'superadmin';
            if (res.locals.user) res.locals.user.role = 'superadmin';
        } else if (req.session.user.role === 'superadmin') {
            // Without this exact email no one else can be superadmin!
            req.session.user.role = 'admin';
            if (res.locals.user) res.locals.user.role = 'admin';
        }
    }

    res.locals.isSuperAdmin = isSuperAdmin(req.session ? req.session.user : null);
    
    // Add helpers to locals
    res.locals.formatText = (str) => {
        if (!str) return '';
        if (Array.isArray(str)) str = str[0] || '';
        if (typeof str !== 'string') str = String(str);
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    try {
        if (mongoose.connection.readyState === 1) {
            const Setting = require('./models/Setting');
            const settings = await Setting.findOne().lean();
            res.locals.siteSettings = settings || {};

            // Maintenance Mode Logic
            if (settings && settings.isMaintenanceMode && req.path !== '/maintenance') {
                const bypassPaths = ['/login', '/register', '/logout', '/api/auth/login', '/superadmin'];
                const isSuperAdmin = req.session.user && req.session.user.role === 'superadmin';
                const isBypassPath = bypassPaths.some(p => req.path.startsWith(p));

                if (!isSuperAdmin && !isBypassPath) {
                    return res.render('maintenance', { siteSettings: settings });
                }
            }
            
            // Academic Classes Cache & Injection
            if (!cachedAcademicClasses || (Date.now() - lastAcademicCacheTime > ACADEMIC_CACHE_TTL)) {
                const AcademicClass = require('./models/AcademicClass');
                cachedAcademicClasses = await AcademicClass.find().sort({ order: 1 }).lean();
                
                // Auto-seed if empty
                if (cachedAcademicClasses.length === 0) {
                    const defaultClasses = [
                        { name: 'Class 6', subjects: ['Bangla', 'English', 'Math', 'Science', 'Religion', 'ICT'], order: 1 },
                        { name: 'Class 7', subjects: ['Bangla', 'English', 'Math', 'Science', 'Religion', 'ICT'], order: 2 },
                        { name: 'Class 8', subjects: ['Bangla', 'English', 'Math', 'Science', 'Religion', 'ICT'], order: 3 },
                        { name: 'Class 9', subjects: ['Bangla', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'Bangladesh & Global Studies', 'Religion', 'ICT'], order: 4 },
                        { name: 'Class 10', subjects: ['Bangla', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'Bangladesh & Global Studies', 'Religion', 'ICT'], order: 5 },
                        { name: 'Class 11', subjects: ['Bangla', 'English', 'Physics', 'Chemistry', 'Biology', 'Higher Math', 'Logic', 'ICT', 'Economics', 'Accounting', 'Business Organization', 'Finance & Banking', 'Management', 'Marketing'], order: 6 },
                        { name: 'Class 12', subjects: ['Bangla', 'English', 'Physics', 'Chemistry', 'Biology', 'Higher Math', 'Logic', 'ICT', 'Economics', 'Accounting', 'Business Organization', 'Finance & Banking', 'Management', 'Marketing'], order: 7 },
                        { name: 'Admission', subjects: ['Bangla', 'English', 'General Knowledge', 'Physics', 'Chemistry', 'Math', 'Biology'], order: 8 },
                        { name: 'Skill Development', subjects: ['Spoken English', 'Freelancing', 'Graphic Design', 'Web Development'], order: 9 }
                    ];
                    await AcademicClass.insertMany(defaultClasses);
                    cachedAcademicClasses = await AcademicClass.find().sort({ order: 1 }).lean();
                }
                lastAcademicCacheTime = Date.now();
            }
            res.locals.globalAcademicClasses = cachedAcademicClasses;
            
        } else {
            res.locals.siteSettings = {};
            res.locals.globalAcademicClasses = [];
        }
        res.locals.getImg = (p) => {
            if (!p) return '';
            if (p.startsWith('http://') || p.startsWith('https://')) return p;
            let normalized = String(p).replace(/\\/g, '/');
            if (!normalized.startsWith('/')) normalized = '/' + normalized;
            return normalized;
        };
    } catch (err) {
        console.warn('Error fetching global settings/classes:', err.message);
        res.locals.siteSettings = {};
        res.locals.globalAcademicClasses = cachedAcademicClasses || [];
        res.locals.getImg = (p) => {
            if (!p) return '';
            if (p.startsWith('http://') || p.startsWith('https://')) return p;
            let normalized = String(p).replace(/\\/g, '/');
            if (!normalized.startsWith('/')) normalized = '/' + normalized;
            return normalized;
        };
    }
    next();
});

// Provide a way to bust cache from routes
app.set('clearAcademicCache', () => { lastAcademicCacheTime = 0; });


// ---- ROUTES ----
app.get('/health', (req, res) => res.json({ status: 'ok', env: process.env.NODE_ENV, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', clientPath }));
app.get('/', async (req, res) => {
    try {
        await connectDB();
        console.time('Homepage_Data_Fetch');
        const Course = require('./models/Course');
        const User = require('./models/User');

        const [courses, categories, totalStudents, totalCourses] = await Promise.all([
            Course.find().limit(6).select('title thumbnail accessType plans').lean().catch(() => []),
            Course.distinct('category').catch(() => []),
            User.countDocuments({ role: 'student' }).catch(() => 0),
            Course.countDocuments().catch(() => 0)
        ]);

        // Faster aggregation for chapter contents
        const stats = await Course.aggregate([
            {
                $project: {
                    classes: { $reduce: { input: "$chapters", initialValue: 0, in: { $add: ["$$value", { $size: { $ifNull: ["$$this.recordedClasses", []] } }] } } },
                    notes: { $reduce: { input: "$chapters", initialValue: 0, in: { $add: ["$$value", { $size: { $ifNull: ["$$this.notes", []] } }] } } },
                    quizzes: { $reduce: { input: "$chapters", initialValue: 0, in: { $add: ["$$value", { $size: { $ifNull: ["$$this.quizzes", []] } }] } } }
                }
            },
            {
                $group: {
                    _id: null,
                    totalClasses: { $sum: "$classes" },
                    totalNotes: { $sum: "$notes" },
                    totalQuizzes: { $sum: "$quizzes" }
                }
            }
        ]).catch(() => []);

        let totalClasses = 0, totalNotes = 0, totalQuizzes = 0;
        if (stats && stats.length > 0) {
            totalClasses = stats[0].totalClasses || 0;
            totalNotes = stats[0].totalNotes || 0;
            totalQuizzes = stats[0].totalQuizzes || 0;
        }
        console.timeEnd('Homepage_Data_Fetch');

        res.render('index', { courses, categories, totalStudents, totalCourses, totalClasses, totalNotes, totalQuizzes });
    } catch (err) {
        try { res.render('index', { courses: [], categories: [], totalStudents: 0, totalCourses: 0, totalClasses: 0, totalNotes: 0, totalQuizzes: 0 }); }
        catch (e) { res.status(500).send('Critical Error: ' + e.message); }
    }
});
app.get('/pricing', (req, res) => res.sendFile(path.join(clientPath, 'public', 'pricing.html')));
app.get('/ai-tutor', (req, res) => res.sendFile(path.join(clientPath, 'public', 'ai-tutor.html')));
app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));
app.get('/privacy-policy', (req, res) => res.render('privacy-policy'));
app.get('/terms', (req, res) => res.render('terms'));
app.get('/faq', (req, res) => res.render('faq'));
app.post('/contact-submit', (req, res) => res.redirect('/?contact=success'));

// Inject upload middleware into admin routes that need it
const superadminRouter = require('./routes/superadmin');
superadminRouter.upload = upload; // make upload accessible inside superadmin router

const adminRouter = require('./routes/admin');
adminRouter.upload = upload; // make upload accessible inside admin router

const mainRouter = require('./routes/main');
mainRouter.post('/profile/upload-picture', upload.single('profilePicture'));

const teacherRouter = require('./routes/teacher');
teacherRouter.upload = upload;

// Mount routers
app.use('/', require('./routes/auth'));
app.use('/', mainRouter);
app.use('/superadmin', superAdminProtect, superadminRouter);
app.use('/admin', adminRouter);
app.use('/teacher', teacherRouter);
app.use('/payment', require('./routes/payment'));
app.use('/my-payments', (req, res) => res.redirect('/payment/history'));
app.use('/admin/payments', (req, res) => res.redirect('/payment/admin'));
app.use('/api', require('./routes/api'));
app.use('/api/notifications', require('./routes/notification'));
app.use('/admin/coupons', require('./routes/coupons'));
app.use('/superadmin/coupons', superAdminProtect, require('./routes/coupons'));
// Legacy VAPID route
app.get('/messages/vapid-public-key', (req, res) => {
    const pushNotificationService = require('./services/pushNotificationService');
    pushNotificationService.setIo(io); // Ensure IO is set
    res.json({ publicKey: pushNotificationService.getPublicKey() });
});

// Pass IO to service globally
require('./services/pushNotificationService').setIo(io);

// ---- SCHEDULED NOTIFICATIONS CRON ----
// Check every 60 seconds for scheduled notifications that are due
setInterval(async () => {
    try {
        const { connectDB, User } = require('./config');
        const NotificationLog = require('./models/NotificationLog');
        const pushNotificationService = require('./services/pushNotificationService');
        const mongoose = require('mongoose');

        // Only try to connect if not already connected
        if (mongoose.connection.readyState !== 1) {
            try {
                await connectDB();
            } catch (connErr) {
                // Silently fail or log sparingly if DB is down during cron
                return; 
            }
        }
        const now = new Date();

        const scheduledNotifications = await NotificationLog.find({
            status: 'scheduled',
            scheduledAt: { $lte: now }
        });

        if (scheduledNotifications.length === 0) return;

        console.log(`⏰ Processing ${scheduledNotifications.length} scheduled notification(s)...`);

        for (const log of scheduledNotifications) {
            try {
                const notificationPayload = {
                    title: log.title,
                    body: log.body,
                    url: log.url || '/',
                    type: log.type || 'announcement',
                    priority: log.priority || 'normal',
                    language: log.language || 'en',
                    icon: '/images/icon-192.png',
                    broadcastId: log._id
                };

                let result;
                if (log.target === 'all') {
                    result = await pushNotificationService.sendToAll(notificationPayload);
                } else if (['student', 'teacher', 'admin', 'guardian'].includes(log.target)) {
                    result = await pushNotificationService.sendToRole(log.target, notificationPayload);
                } else if (log.target === 'class') {
                    result = await pushNotificationService.sendToClassLevel(log.classLevel, notificationPayload);
                } else if (log.target === 'course') {
                    const users = await (await connectDB()).model('User').find({ 'enrolledCourses.course': log.courseId }).select('_id');
                    const userIds = users.map(u => u._id);
                    result = await pushNotificationService.sendToMultipleUsers(userIds, notificationPayload);
                } else if (log.user) {
                    const sendRes = await pushNotificationService.sendToUser(log.user, notificationPayload);
                    result = { sent: sendRes && sendRes.success ? 1 : 0, total: 1 };
                } else {
                    continue;
                }

                await NotificationLog.findByIdAndUpdate(log._id, {
                    status: result.sent > 0 ? 'sent' : 'failed',
                    sent: result.sent || 0,
                    failed: (result.total || 0) - (result.sent || 0),
                    total: result.total || 0
                });

                console.log(`✅ Scheduled notification sent: ${log.title} (Sent: ${result.sent})`);
            } catch (err) {
                await NotificationLog.findByIdAndUpdate(log._id, {
                    status: 'failed',
                    error: err.message
                });
                console.error(`❌ Failed to process scheduled notification: ${log.title}`, err.message);
            }
        }
    } catch (err) {
        console.error('❌ Error in scheduled notifications cron:', err.message);
    }
}, 60000); // Check every 60 seconds

// ---- SOCKET.IO ----
const onlineUsers = new Map();
const lockedRooms = new Set();
const Message = require('./models/Message');
const raisedHandsByRoom = new Map();
const roomParticipants = new Map();

io.on('connection', (socket) => {
    socket.on('user:join', ({ userId, name, role }) => {
        onlineUsers.set(socket.id, { userId, name, role, socketId: socket.id });
        socket.userId = userId; socket.userName = name; socket.userRole = role;
        socket.join('global');
        socket.join(`user_${userId}`);
        io.emit('users:online', Array.from(onlineUsers.values()));
    });

    function updateRoomParticipantsCount(roomId) {
        if (!roomId) return;
        const room = io.sockets.adapter.rooms.get(roomId);
        if (!room) return;
        const uniqueUsers = new Set();
        for (const socketId of room) {
            const u = onlineUsers.get(socketId);
            if (u && u.userId) {
                uniqueUsers.add(u.userId);
            }
        }
        const count = uniqueUsers.size > 0 ? uniqueUsers.size : room.size;
        io.to(roomId).emit('room:participants_count', { roomId, count });
    }

    function broadcastParticipantsList(roomId) {
        if (!roomId) return;
        const pMap = roomParticipants.get(roomId);
        const list = pMap ? Array.from(pMap.values()) : [];
        io.to(roomId).emit('room:participants_list', { roomId, list });
    }

    socket.on('room:join', (roomId) => {
        socket.join(roomId);
        socket.currentRoom = roomId;

        if (!roomParticipants.has(roomId)) {
            roomParticipants.set(roomId, new Map());
        }
        const pMap = roomParticipants.get(roomId);
        pMap.set(socket.id, {
            socketId: socket.id,
            userId: socket.userId,
            userName: socket.userName,
            userRole: socket.userRole,
            isMuted: socket.isMuted || false
        });

        // Inform user if room is locked
        if (lockedRooms.has(roomId)) {
            socket.emit('room:lock_status', { roomId, isLocked: true });
        }
        updateRoomParticipantsCount(roomId);
        broadcastParticipantsList(roomId);
    });

    socket.on('course:join', (courseId) => {
        if (courseId) {
            socket.join(`course_${courseId}`);
        }
    });

    socket.on('room:toggle_lock', ({ roomId, lock }) => {
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin' && socket.userRole !== 'superadmin') return;
        if (lock) lockedRooms.add(roomId);
        else lockedRooms.delete(roomId);
        io.to(roomId).emit('room:lock_status', { roomId, isLocked: !!lock });
    });

    socket.on('message:send', async ({ room, text, receiverId, highlighted }) => {
        try {
            if (!socket.userId || !text?.trim()) return;
            const isModerator = (socket.userRole === 'teacher' || socket.userRole === 'admin' || socket.userRole === 'superadmin');
            if (!isModerator && lockedRooms.has(room)) {
                return socket.emit('message:error', { error: 'Comments are currently disabled for this class.' });
            }
            const msg = await Message.create({ sender: socket.userId, senderName: socket.userName, senderRole: socket.userRole, receiver: receiverId || null, room: room || 'global', text: text.trim().substring(0, 1000), highlighted: !!highlighted });
            const msgData = { _id: msg._id, sender: socket.userId, senderName: socket.userName, senderRole: socket.userRole, text: msg.text, room: msg.room, createdAt: msg.createdAt, highlighted: msg.highlighted };
            io.to(room || 'global').emit('message:new', msgData);
            if (receiverId) {
                const receiverSocket = Array.from(onlineUsers.values()).find(u => u.userId === receiverId);
                if (receiverSocket) io.to(receiverSocket.socketId).emit('message:new', msgData);
            }
        } catch (err) { socket.emit('message:error', { error: 'বার্তা পাঠাতে সমস্যা।' }); }
    });

    socket.on('typing:start', ({ room }) => socket.to(room).emit('typing:show', { name: socket.userName, room }));
    socket.on('typing:stop', ({ room }) => socket.to(room).emit('typing:hide', { name: socket.userName, room }));

    socket.on('hand:raise', ({ room }) => {
        if (!socket.userId) return;
        if (!raisedHandsByRoom.has(room)) {
            raisedHandsByRoom.set(room, new Map());
        }
        const roomHands = raisedHandsByRoom.get(room);
        roomHands.set(socket.userId, { userId: socket.userId, userName: socket.userName, socketId: socket.id });
        io.to(room).emit('hand:list_updated', { room, list: Array.from(roomHands.values()) });
    });

    socket.on('hand:lower', ({ room, userId }) => {
        const targetId = userId || socket.userId;
        if (!targetId) return;
        const roomHands = raisedHandsByRoom.get(room);
        if (roomHands) {
            roomHands.delete(targetId);
            io.to(room).emit('hand:list_updated', { room, list: Array.from(roomHands.values()) });
        }
    });

    socket.on('hand:lower_all', ({ room }) => {
        raisedHandsByRoom.delete(room);
        io.to(room).emit('hand:list_updated', { room, list: [] });
    });

    socket.on('student:mic_status', ({ room, isMuted }) => {
        socket.isMuted = isMuted;
        const pMap = roomParticipants.get(room);
        if (pMap && pMap.has(socket.id)) {
            pMap.get(socket.id).isMuted = isMuted;
        }
        broadcastParticipantsList(room);
    });

    socket.on('user:set_agora_uid', ({ room, agoraUid }) => {
        const pMap = roomParticipants.get(room);
        if (pMap && pMap.has(socket.id)) {
            pMap.get(socket.id).agoraUid = agoraUid;
        }
        broadcastParticipantsList(room);
    });

    socket.on('host:mute_student', ({ room, targetSocketId, mute }) => {
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin' && socket.userRole !== 'superadmin') return;
        io.to(targetSocketId).emit('room:mute_student', { mute });
    });

    socket.on('host:video_student', ({ room, targetSocketId, videoOn }) => {
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin' && socket.userRole !== 'superadmin') return;
        io.to(targetSocketId).emit('room:video_student', { videoOn });
    });

    socket.on('host:toggle_recording', (payload) => {
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin' && socket.userRole !== 'superadmin') return;
        io.to(payload.room).emit('room:recording_status', payload);
    });

    socket.on('host:mute_all', ({ room, mute }) => {
        if (socket.userRole !== 'teacher' && socket.userRole !== 'admin' && socket.userRole !== 'superadmin') return;
        const pMap = roomParticipants.get(room);
        if (pMap) {
            for (const [sId, p] of pMap.entries()) {
                if (p.userRole !== 'teacher' && p.userRole !== 'admin' && p.userRole !== 'superadmin') {
                    io.to(sId).emit('room:mute_student', { mute });
                }
            }
        }
    });

    socket.on('reaction:send', ({ room, emoji }) => {
        if (!socket.userId) return;
        io.to(room).emit('reaction:new', { userName: socket.userName, emoji });
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoom;
        onlineUsers.delete(socket.id);
        io.emit('users:online', Array.from(onlineUsers.values()));
        if (roomId) {
            updateRoomParticipantsCount(roomId);
            const pMap = roomParticipants.get(roomId);
            if (pMap) {
                pMap.delete(socket.id);
                broadcastParticipantsList(roomId);
            }
            const roomHands = raisedHandsByRoom.get(roomId);
            if (roomHands && socket.userId) {
                if (roomHands.has(socket.userId)) {
                    roomHands.delete(socket.userId);
                    io.to(roomId).emit('hand:list_updated', { room: roomId, list: Array.from(roomHands.values()) });
                }
            }
        }
    });
});

// ---- 404 & START ----
app.get('*', (req, res) => res.status(404).render('404'));

if (require.main === module) {
    console.log(`🔧 Attempting to bind to port ${PORT}...`);
    const server = http.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log(`📊 Server PID: ${process.pid}`);
    });
    server.on('error', (err) => {
        console.error('❌ Server error:', err.message);
        console.error('Stack:', err.stack);
        process.exit(1);
    });
    server.on('listening', () => {
        console.log('✅ Server is listening on port', PORT);
    });
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - just log
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

module.exports = app;
module.exports.app = app;
module.exports.http = http;
module.exports.io = io;
