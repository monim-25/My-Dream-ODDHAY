require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Import Models
const Course = require('./models/Course');
const User = require('./models/User');
const Quiz = require('./models/Quiz');
const Book = require('./models/Book');
const Question = require('./models/Question');
const Note = require('./models/Note');
const QuestionBank = require('./models/QuestionBank');
const QA = require('./models/QA');
const Notification = require('./models/Notification');
const RoutineTask = require('./models/RoutineTask');

const app = express();
const PORT = process.env.PORT || 3005;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

// --- PATH RESOLUTION ---
let clientPath;
// Vercel / Production Check
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // In Vercel, paths are often flattened or at root depending on build
    // We try to find 'client/views'
    if (fs.existsSync(path.join(process.cwd(), 'client'))) {
        clientPath = path.join(process.cwd(), 'client');
    } else {
        // Fallback to standard
        clientPath = path.join(__dirname, '../client');
    }
} else {
    // Local development
    clientPath = path.join(__dirname, '../client');
}
console.log('✅ Resolved Client Path:', clientPath);

mongoose.set('strictQuery', false);

// --- DATABASE CONNECTION ---
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            return;
        }
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000 // Fail faster on serverless
        });
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ Database connection failure:', err.message);
    }
};

// --- MIDDLEWARE SETUP ---

// Session Store with Fallback
let sessionStore;
try {
    sessionStore = MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native'
    });
} catch (err) {
    console.warn('⚠️ Session Warning: Using MemoryStore due to error:', err.message);
    sessionStore = new session.MemoryStore();
}

app.use(session({
    secret: 'oddhay_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        secure: false // Set to false for local testing support
    }
}));

// Robust Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = '/tmp/uploads/'; // Always safe for serverless/Vercel

        // Try local if explicitly local dev (not Vercel)
        if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
            try {
                const localDest = path.join(clientPath, 'public/uploads/');
                if (fs.existsSync(path.join(clientPath, 'public'))) {
                    dest = localDest;
                }
            } catch (e) { /* ignore */ }
        }

        if (file.fieldname === 'thumbnail') dest += 'thumbnails/';
        else if (file.fieldname === 'video') dest += 'videos/';
        else if (file.fieldname === 'note') dest += 'notes/';
        else if (file.fieldname === 'book') dest += 'books/';

        try {
            fs.mkdirSync(dest, { recursive: true });
            cb(null, dest);
        } catch (err) {
            console.error('Multer MKDIR Error:', err);
            cb(err, '/tmp/');
        }
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- DATABASE CONNECTION ---
connectDB();


app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(clientPath, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Serve Static with explicit path and fallbacks
app.use(express.static(path.join(clientPath, 'public')));
// Also serve from standard public just in case
app.use(express.static(path.join(process.cwd(), 'public')));

// Auth Middlewares
const protect = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};
const adminProtect = (req, res, next) => {
    const roles = ['teacher', 'admin', 'superadmin'];
    if (req.session.user && roles.includes(req.session.user.role)) next();
    else res.status(403).send('Access Denied: Admin level required');
};
const superAdminProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'superadmin') next();
    else res.status(403).send('Access Denied: Super Admin level required');
};
const parentProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'parent') next();
    else res.redirect('/login');
};

// --- ROUTES ---

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        env: process.env.NODE_ENV,
        db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        clientPath: clientPath,
        cwd: process.cwd()
    });
});

app.get('/', async (req, res) => {
    try {
        const courses = await Course.find().limit(6);
        const categories = await Course.distinct('category');
        res.render('index', { courses, categories });
    } catch (err) {
        console.error('Home Render Error:', err);
        // Fallback for View Error vs DB Error
        if (err.message.includes('lookup view')) {
            res.status(500).send(`View Error: ${err.message}. Path: ${clientPath}`);
        } else {
            // Try rendering without data
            try { res.render('index', { courses: [], categories: [] }); }
            catch (e) { res.status(500).send("Critical App Error: " + e.message); }
        }
    }
});

app.get('/pricing', (req, res) => res.sendFile(path.join(clientPath, 'public', 'pricing.html')));
app.get('/ai-tutor', (req, res) => res.sendFile(path.join(clientPath, 'public', 'ai-tutor.html')));
app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));
app.post('/contact-submit', (req, res) => res.redirect('/?contact=success'));

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/login', async (req, res) => {
    try {
        const identifier = req.body.email ? req.body.email.trim() : '';
        const password = req.body.password;

        if (!identifier || !password) {
            return res.status(400).send('ইমেইল/ফোন এবং পাসওয়ার্ড প্রদান করুন।');
        }

        const searchCriteria = identifier.includes('@')
            ? { email: identifier }
            : { phone: identifier };

        const user = await User.findOne(searchCriteria);

        if (user && await user.comparePassword(password)) {
            // Super Admin Auto-Promotion
            if (process.env.SUPER_ADMIN_EMAIL && user.email === process.env.SUPER_ADMIN_EMAIL && user.role !== 'superadmin') {
                user.role = 'superadmin';
                await user.save();
            }
            const userObj = user.toObject();
            req.session.user = userObj;
            req.session.userId = userObj._id.toString();

            req.session.save(() => {
                if (user.role === 'teacher') return res.redirect('/teacher/dashboard');
                if (user.role === 'admin' || user.role === 'superadmin') return res.redirect('/admin');
                if (user.role === 'parent') return res.redirect('/parent/dashboard');
                res.redirect('/dashboard');
            });
        } else {
            res.status(401).send('ইমেইল/ফোন বা পাসওয়ার্ড ভুল।');
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).send('লগইন করার সময় একটি সমস্যা হয়েছে।');
    }
});

app.post('/register', async (req, res) => {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    try {
        const { name, identifier, password, confirmPassword, role, classLevel } = req.body;

        if (!name || !identifier || !password || !confirmPassword) {
            return res.status(400).json({ error: 'দয়া করে সবগুলো তথ্য প্রদান করুন।' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'পাসওয়ার্ড দুটি মিলছে না।' });
        }

        const cleanId = identifier.trim();
        const email = cleanId.includes('@') ? cleanId : null;
        const phone = cleanId.includes('@') ? null : cleanId;

        // Atomic check and save attempt
        const userData = {
            name: name.trim(),
            password,
            role: role || 'student',
            classLevel: classLevel || 'Class 10',
            email: email || undefined,
            phone: phone || undefined
        };

        const newUser = new User(userData);
        await newUser.save();

        console.log(`✅ Registration Successful: ${newUser.name} (${newUser._id})`);

        // Prepare session
        req.session.userId = newUser._id.toString();
        req.session.user = {
            _id: newUser._id.toString(),
            name: newUser.name,
            role: newUser.role,
            classLevel: newUser.classLevel
        };

        const redirectUrl = newUser.role === 'parent' ? '/parent/dashboard' : (['admin', 'superadmin', 'teacher'].includes(newUser.role) ? '/admin' : '/dashboard');

        req.session.save(() => {
            return res.json({ success: true, redirect: redirectUrl });
        });

    } catch (err) {
        console.error('🔥 Registration FAIL:', err);

        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0];
            const msg = field === 'phone' ? 'এই ফোন নম্বরটি ইতিমধ্যে ব্যবহৃত হয়েছে।' : 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হয়েছে।';
            return res.status(400).json({ error: msg });
        }

        return res.status(500).json({ error: `সার্ভার ত্রুটি: ${err.message}` });
    }
});

// Unified Safe Dashboard
// Unified Safe Dashboard
app.get('/dashboard', protect, async (req, res) => {
    try {
        const userId = req.session.userId;
        const dbUser = await User.findById(userId).populate('enrolledCourses.course').populate('lastWatchedLesson.course').lean();

        if (!dbUser) return res.redirect('/login');
        if (dbUser.role === 'parent') return res.redirect('/parent/dashboard');

        // Parallel Data Fetching with Failure Handling
        const [recommendations, pendingParents, leaderboard, notifications, routineTasks] = await Promise.all([
            // Recommendations
            require('./models/Course').find({
                classLevel: dbUser.classLevel,
                _id: { $nin: (dbUser.enrolledCourses || []).map(e => e.course ? e.course._id : null) }
            }).limit(3).lean().catch(e => { console.error('Rec Error:', e); return []; }),

            // Pending Parents (fetch users)
            (async () => {
                const pRequests = (dbUser.parentRequests || []).filter(r => r.status === 'pending');
                if (pRequests.length === 0) return [];
                return User.find({ _id: { $in: pRequests.map(p => p.parent) } }).select('name email phone').lean();
            })().catch(e => { console.error('Parent Req Error:', e); return []; }),

            // Leaderboard
            User.find({ role: 'student' }).limit(5).select('name classLevel quizResults').lean()
                .then(users => users.map(l => ({
                    ...l,
                    totalScore: (l.quizResults || []).reduce((acc, curr) => acc + (curr.score || 0), 0)
                })).sort((a, b) => b.totalScore - a.totalScore))
                .catch(e => { console.error('Leaderboard Error:', e); return []; }),

            // Notifications
            Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean()
                .catch(e => { console.error('Notif Error:', e); return []; }),

            // Routine Tasks
            RoutineTask.find({ user: userId, isCompleted: false }).sort({ date: 1 }).limit(5).lean()
                .catch(e => { console.error('Routine Error:', e); return []; })
        ]);

        res.render('dashboard-unified', {
            user: dbUser,
            recommendations,
            parentRequests: pendingParents,
            leaderboard,
            notifications,
            routineTasks
        });
    } catch (err) {
        console.error('Dashboard Critical Crash:', err);
        // Fallback simple render if everything fails? 
        // Better to show error but maybe user session is corrupted?
        res.status(500).send('ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে। অনুগ্রহ করে লগআউট করে আবার চেষ্টা করুন।');
    }
});

app.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('quizResults.quiz');
        if (!user) return res.redirect('/login');

        if (user.role === 'parent') {
            res.render('parent-profile', { user, success: req.query.success });
        } else {
            res.render('profile', { user, success: req.query.success });
        }
    } catch (err) {
        console.error('Profile Route Error:', err);
        res.status(500).send('Profile Error');
    }
});

// Routine Routes
app.get('/routine', protect, async (req, res) => {
    try {
        const tasks = await RoutineTask.find({ user: req.session.userId }).sort({ date: 1 }).lean();
        res.render('routine', { tasks });
    } catch (err) {
        console.error('Routine Error:', err);
        res.status(500).send('রুটিন লোড করতে সমস্যা হয়েছে।');
    }
});

app.post('/routine/add', protect, async (req, res) => {
    try {
        const { title, date, time, type } = req.body;
        const newTask = new RoutineTask({
            user: req.session.userId,
            title,
            date: date || new Date(),
            time,
            type: type || 'task'
        });
        await newTask.save();
        res.redirect('/routine');
    } catch (err) {
        console.error('Add Task Error:', err);
        res.redirect('/routine');
    }
});

app.post('/routine/toggle/:id', protect, async (req, res) => {
    try {
        const task = await RoutineTask.findOne({ _id: req.params.id, user: req.session.userId });
        if (task) {
            task.isCompleted = !task.isCompleted;
            await task.save();
        }
        res.redirect('/routine');
    } catch (err) {
        res.redirect('/routine');
    }
});

app.post('/routine/delete/:id', protect, async (req, res) => {
    try {
        await RoutineTask.findOneAndDelete({ _id: req.params.id, user: req.session.userId });
        res.redirect('/routine');
    } catch (err) {
        res.redirect('/routine');
    }
});

// Profile Edit Page
app.get('/profile/edit', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('profile-edit', { user, success: req.query.success, error: req.query.error });
    } catch (err) {
        res.status(500).send('Error loading edit page');
    }
});

// Update Profile
app.post('/profile/update', protect, async (req, res) => {
    try {
        const { name, phone, classLevel } = req.body;
        await User.findByIdAndUpdate(req.session.userId, { name, phone, classLevel });
        res.redirect('/profile/edit?success=true');
    } catch (err) {
        res.redirect('/profile/edit?error=Update failed');
    }
});

// Change Password
app.post('/profile/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const user = await User.findById(req.session.userId);

        if (newPassword !== confirmPassword) {
            return res.redirect('/profile/edit?error=Passwords do not match');
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.redirect('/profile/edit?error=Invalid current password');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.redirect('/profile/edit?success=Password changed successfully');
    } catch (err) {
        res.redirect('/profile/edit?error=Change password failed');
    }
});

// Guardian Info
app.get('/profile/guardian', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const parents = await User.find({
            role: 'parent',
            children: user._id
        }).select('name email phone');
        res.render('guardian', { parents });
    } catch (err) {
        res.status(500).send('Error loading guardian info');
    }
});

// Student ID Card
app.get('/profile/id-card', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('id-card', { user });
    } catch (err) {
        res.status(500).send('Error loading ID card');
    }
});

// My Courses
app.get('/my-courses', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('enrolledCourses.course');

        const courses = user.enrolledCourses.map(enrollment => {
            if (!enrollment.course) return null;

            // Calculate progress (this logic might need adjustment based on your data model)
            const totalLessons = enrollment.course.lessons ? enrollment.course.lessons.length : 0; // Assuming course has lessons array, or needs population
            const completedForCourse = user.completedLessons.filter(cl =>
                cl.course && cl.course.toString() === enrollment.course._id.toString()
            ).length;

            let progress = 0;
            // Since we didn't populate lessons deep here, let's assume 0 or handle it if lessons are count
            // For now, let's just default to what's in enrollment if stored, or 0.
            // If you want accurate progress, you'd need to count lessons in the course.
            // Let's assume we can get it or just show 0 if simple.
            // A better way if lessons are not in course object directly (referenced):
            // const lessonCount = await Lesson.countDocuments({ course: enrollment.course._id });
            // For now, let's use a placeholder or enrollment.progress if you store it.
            // Let's assume enrollment.progress exists or 0.

            return {
                ...enrollment,
                progress: enrollment.progress || 0 // Use stored progress or calculate
            };
        }).filter(c => c !== null);

        const completedCount = courses.filter(c => c.progress === 100).length;
        const inProgressCount = courses.filter(c => c.progress < 100 && c.progress > 0).length;

        res.render('my-courses', {
            courses,
            completedCount,
            inProgressCount
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading courses');
    }
});

app.get('/profile/report-card/:studentId?', protect, async (req, res) => {
    try {
        let studentId = req.params.studentId || req.session.userId;

        // If parent, verify they have access to this student
        if (req.session.user.role === 'parent') {
            const parent = await User.findById(req.session.userId);
            if (!parent.children.includes(studentId)) {
                return res.status(403).send('আপনার এই শিক্ষার্থীর তথ্যে প্রবেশাধিকার নেই।');
            }
        }

        const user = await User.findById(studentId).populate('enrolledCourses.course').populate('quizResults.quiz');
        if (!user) return res.redirect('/login');

        // Calculate stats
        const totalQuizzes = user.quizResults.length;
        const avgScore = totalQuizzes > 0
            ? (user.quizResults.reduce((acc, curr) => acc + (curr.score / curr.total), 0) / totalQuizzes * 100).toFixed(1)
            : 0;

        const completedCourses = (user.enrolledCourses || []).filter(c => {
            return user.completedLessons.length > 0;
        }).length;

        res.render('report-card', {
            user,
            stats: {
                totalQuizzes,
                avgScore,
                completedCourses,
                learningHours: (user.completedLessons.length * 0.5).toFixed(1)
            }
        });
    } catch (err) {
        console.error('Report Card Error:', err);
        res.status(500).send('রিপোর্ট কার্ড লোড করতে সমস্যা হয়েছে।');
    }
});

// --- Q&A Forum Routes ---
app.get('/qa-forum', protect, async (req, res) => {
    try {
        const filter = req.query.filter;
        let query = {};

        if (filter === 'my') {
            query.askedBy = req.session.userId;
        } else if (filter === 'solved') {
            query.status = 'resolved';
        }

        const questions = await QA.find(query).sort({ createdAt: -1 }).limit(50).lean();
        res.render('qa-forum', { questions });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Q&A');
    }
});

app.post('/qa-forum/ask', protect, async (req, res) => {
    try {
        const { question } = req.body;
        const user = await User.findById(req.session.userId);

        const newQA = new QA({
            question,
            askedBy: user._id,
            askedByName: user.name
        });

        await newQA.save();
        res.redirect('/qa-forum');
    } catch (err) {
        console.error(err);
        res.redirect('/qa-forum?error=Failed to post');
    }
});

// --- Question Bank Routes ---
app.get('/question-bank', protect, async (req, res) => {
    try {
        const questions = await QuestionBank.find().sort({ year: -1 }).limit(20).lean();
        res.render('question-bank', { questions });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Question Bank');
    }
});

// --- Exam Routes ---
app.get('/exams', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        // Find quizzes that match user's class level or course
        // For simplicity, fetching all for now or filtering by class if possible
        // Assuming quizzes might not have class level directly but courses do.
        // Let's fetch quizzes linked to courses the user is enrolled in OR generic ones.

        // Fetch all quizzes for now to populate the page
        const allQuizzes = await Quiz.find().populate('course').lean();

        const liveExams = allQuizzes.filter(q => q.duration > 0); // Placeholder logic for live
        const practiceExams = allQuizzes;

        res.render('exams', { liveExams, practiceExams });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Exams');
    }
});

app.post('/profile/update', protect, async (req, res) => {
    try {
        const { name, oldPassword, password, email, phone } = req.body;
        const user = await User.findById(req.session.userId);

        if (name) user.name = name;

        // Handle Email/Phone update if they were missing
        if (email && !user.email) user.email = email;
        if (phone && !user.phone) user.phone = phone;

        // Password change logic
        if (password && password.trim() !== '') {
            if (!oldPassword) return res.redirect('/profile/edit?error=old_password_required');
            const isMatch = await user.comparePassword(oldPassword);
            if (!isMatch) return res.redirect('/profile/edit?error=wrong_old_password');
            user.password = password;
        }

        await user.save();
        req.session.user.name = user.name; // Keep session synced
        res.redirect('/profile?success=true');
    } catch (err) {
        console.error('Update Error:', err);
        res.redirect('/profile/edit?error=update_failed');
    }
});

app.get('/courses', async (req, res) => {
    try {
        const { search, category, classLevel } = req.query;
        let query = {};
        if (search) query.title = { $regex: search, $options: 'i' };
        if (category && category !== 'all') query.category = category;
        if (classLevel && classLevel !== 'all') query.classLevel = classLevel;

        const courses = await Course.find(query);
        const categories = await Course.distinct('category');
        const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
        res.render('courses', { courses, categories, classes, search, activeCategory: category, activeClass: classLevel, user: req.session.userId ? await User.findById(req.session.userId) : null });
    } catch (err) {
        // Graceful fallback: show empty courses page
        const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
        res.render('courses', { courses: [], categories: [], classes, search: '', activeCategory: 'all', activeClass: 'all', user: null });
    }
});

// --- New Service Routes ---

app.get('/note/:id', async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);
        if (!note) return res.status(404).render('404');
        res.render('note-viewer', { note, user: req.session.user || null });
    } catch (err) {
        res.status(500).send('Error loading note');
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) return res.json({ courses: [], notes: [] });

        const searchRegex = new RegExp(query, 'i');
        const courses = await Course.find({
            $or: [{ title: searchRegex }, { subject: searchRegex }]
        }).limit(5).select('title thumbnail subject').lean();

        const notes = await Note.find({
            title: searchRegex
        }).limit(5).select('title').lean();

        res.json({ courses, notes });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/notes', async (req, res) => {
    try {
        const { search, subject, classLevel } = req.query;
        let query = {};
        if (search) query.title = { $regex: search, $options: 'i' };
        if (subject && subject !== 'all') query.subject = subject;
        if (classLevel && classLevel !== 'all') query.classLevel = classLevel;

        const notes = await Note.find(query).sort({ createdAt: -1 });
        const subjects = await Note.distinct('subject');
        const classes = ['Class 9', 'Class 10', 'Class 11', 'Class 12', 'HSC'];
        res.render('notes', { notes, subjects, classes, search, activeSubject: subject, activeClass: classLevel, user: req.session.user || null });
    } catch (err) {
        res.render('notes', { notes: [], subjects: [], classes: [], search: '', activeSubject: 'all', activeClass: 'all', user: null });
    }
});

app.get('/question-bank', async (req, res) => {
    try {
        const { search, board, subject } = req.query;
        let query = {};
        if (search) query.subject = { $regex: search, $options: 'i' };
        if (board && board !== 'all') query.board = board;
        if (subject && subject !== 'all') query.subject = subject;

        const questions = await QuestionBank.find(query).sort({ year: -1 });
        const boards = await QuestionBank.distinct('board');
        const subjects = await QuestionBank.distinct('subject');
        res.render('question-bank', { questions, boards, subjects, search, activeBoard: board, activeSubject: subject, user: req.session.user || null });
    } catch (err) {
        res.render('question-bank', { questions: [], boards: [], subjects: [], search: '', activeBoard: 'all', activeSubject: 'all', user: null });
    }
});

app.get('/qa', async (req, res) => {
    try {
        const qas = await QA.find().populate('askedBy answeredBy').sort({ createdAt: -1 });
        res.render('qa', { qas, user: req.session.user || null });
    } catch (err) {
        res.render('qa', { qas: [], user: null });
    }
});

app.get('/mock-tests', async (req, res) => {
    res.render('mock-tests', { user: req.session.user });
});

app.get('/analytics', async (req, res) => {
    res.render('analytics', { user: req.session.user });
});

app.get('/messages', protect, (req, res) => {
    res.render('messages', { user: req.session.user });
});

app.get('/notifications', protect, (req, res) => {
    res.render('notifications', { user: req.session.user });
});

app.get('/settings', protect, (req, res) => {
    res.render('profile', { user: req.session.user, success: null }); // Reuse profile for settings
});


app.post('/qa-ask', async (req, res) => {
    try {
        if (!req.session.user) return res.redirect('/login');
        const { question } = req.body;
        const newQA = new QA({
            question,
            askedBy: req.session.user._id,
            status: 'open'
        });
        await newQA.save();
        res.redirect('/qa');
    } catch (err) {
        res.redirect('/qa');
    }
});


app.get('/course-details/:id', protect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).send('Course not found');
        const user = await User.findById(req.session.user._id);
        let hasAccess = false, trialExpired = false, subscriptionExpired = false;

        if (course.accessType === 'free') hasAccess = true;
        else {
            const enrollment = user.enrolledCourses.find(e => e.course.toString() === course._id.toString());
            if (enrollment) {
                if (!enrollment.expiresAt || new Date(enrollment.expiresAt) > new Date()) hasAccess = true;
                else subscriptionExpired = true;
            }
            if (!hasAccess && course.accessType === 'trial') {
                const trial = user.trialEnrollments.find(t => t.course.toString() === course._id.toString());
                if (trial) {
                    const diffDays = Math.ceil(Math.abs(new Date() - trial.startedAt) / (1000 * 60 * 60 * 24));
                    if (diffDays <= course.trialPeriod) hasAccess = true;
                    else trialExpired = true;
                }
            }
        }
        res.render('lesson-player', { course: course.toObject(), similarCourses: [], hasAccess, trialExpired, subscriptionExpired, user });
    } catch (err) {
        res.status(500).send('Error loading course');
    }
});


app.post('/api/progress', protect, async (req, res) => {
    try {
        const { lessonId, courseId, lessonTitle } = req.body;
        const user = await User.findById(req.session.user._id);

        // Mark lesson as completed
        if (!user.completedLessons.includes(lessonId)) {
            user.completedLessons.push(lessonId);
        }

        // Update last watched lesson
        user.lastWatchedLesson = {
            course: courseId,
            lessonId: lessonId,
            lessonTitle: lessonTitle,
            watchedAt: new Date()
        };

        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/enroll-trial/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user.trialEnrollments.find(t => t.course.toString() === req.params.id)) {
            user.trialEnrollments.push({ course: req.params.id, startedAt: new Date() });
            await user.save();
        }
        res.redirect(`/course-details/${req.params.id}`);
    } catch (err) {
        res.status(500).send('Error starting trial');
    }
});

app.get('/checkout/:id', protect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        res.render('checkout', { course });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/buy-course/:id', protect, async (req, res) => {
    try {
        const { planIndex } = req.body;
        const user = await User.findById(req.session.user._id);
        const course = await Course.findById(req.params.id);
        const plan = course.plans[planIndex];
        let expiresAt = null;
        if (plan.durationDays > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
        }
        const existing = user.enrolledCourses.find(e => e.course.toString() === req.params.id);
        if (existing) existing.expiresAt = expiresAt;
        else user.enrolledCourses.push({ course: req.params.id, expiresAt });
        await user.save();
        res.redirect(`/course-details/${req.params.id}`);
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/library', protect, async (req, res) => {
    try {
        const books = await Book.find();
        res.render('library', { books });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/feature/:type', protect, async (req, res) => {
    try {
        const subjects = await Course.distinct('subject', { classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-subjects', { type: req.params.type, subjects });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/feature/:type/:subject', protect, async (req, res) => {
    try {
        const courses = await Course.find({ subject: req.params.subject, classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-chapters', { type: req.params.type, subject: req.params.subject, courses });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/create-self-quiz', protect, async (req, res) => {
    try {
        const subjects = await Question.distinct('subject');
        const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
        res.render('create-self-quiz', { subjects, classes });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/api/generate-quiz', protect, async (req, res) => {
    try {
        const { subject, classLevel, count } = req.body;
        const questions = await Question.aggregate([{ $match: { subject, classLevel } }, { $sample: { size: parseInt(count) || 10 } }]);
        if (!questions.length) return res.status(404).json({ message: 'No questions' });
        req.session.tempQuiz = { title: `Custom ${subject} Quiz`, questions: questions.map(q => ({ questionText: q.questionText, options: q.options, correctAnswerIndex: q.correctAnswerIndex })), duration: 10 };
        res.json({ success: true, redirect: '/take-temp-quiz' });
    } catch (err) {
        res.status(500).json({ message: 'Error' });
    }
});

app.get('/take-temp-quiz', protect, (req, res) => {
    if (!req.session.tempQuiz) return res.redirect('/dashboard');
    res.render('quiz', { quiz: req.session.tempQuiz });
});

app.get('/quiz/:id', protect, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        res.render('quiz', { quiz });
    } catch (err) {
        res.status(404).send('Quiz not found');
    }
});

app.post('/submit-quiz/:id', protect, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        let score = 0;
        quiz.questions.forEach((q, index) => { if (parseInt(req.body[`question_${index}`]) === q.correctAnswerIndex) score++; });
        const student = await User.findById(req.session.user._id);
        student.quizResults.push({ quiz: quiz._id, score, total: quiz.questions.length });
        await student.save();
        res.render('quiz-result', { score, total: quiz.questions.length });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/parent/dashboard', parentProtect, async (req, res) => {
    try {
        if (!req.session.userId) return res.redirect('/login');

        const parent = await User.findById(req.session.userId);
        if (!parent) {
            console.warn('⚠️ Parent not found in DB');
            return res.redirect('/login');
        }

        const students = await User.find({
            'parentRequests': {
                $elemMatch: { parent: parent._id, status: 'accepted' }
            }
        }).populate({
            path: 'quizResults.quiz',
            populate: { path: 'course' }
        })
            .populate('enrolledCourses.course')
            .populate('lastWatchedLesson.course');

        // Fetch QA (Messages) for each child
        const childIds = students.map(s => s._id);
        const childMessages = await require('./models/QA').find({ askedBy: { $in: childIds } })
            .populate('answeredBy', 'name')
            .sort({ createdAt: -1 });

        // Mock events for Shared Calendar (since we don't have an Event model yet)
        const mockEvents = [
            { title: 'সাপ্তাহিক মূল্যায়ন পরীক্ষা', date: new Date(Date.now() + 86400000 * 2), type: 'exam' },
            { title: 'লাইভ ক্লাস: গণিত', date: new Date(Date.now() + 86400000 * 1), type: 'class' },
            { title: 'ফলাফল প্রকাশ', date: new Date(Date.now() - 86400000 * 1), type: 'result' }
        ];

        res.render('parent-dashboard', {
            user: parent,
            confirmedChildren: students || [],
            messages: childMessages || [],
            events: mockEvents
        });
    } catch (err) {
        console.error('Parent Dashboard Error:', err);
        res.status(500).send('প্যারেন্ট ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে।');
    }
});

app.post('/parent/add-child', parentProtect, async (req, res) => {
    try {
        const identifier = req.body.childIdentifier.trim();
        const student = await User.findOne({
            $or: [{ email: identifier }, { phone: identifier }],
            role: 'student'
        });

        if (!student) return res.send("এই ইমেইল বা ফোন নম্বর দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি।");

        // Check if already connected or requested
        const alreadyRequested = student.parentRequests.some(r => r.parent.toString() === req.session.userId);
        if (alreadyRequested) return res.send("ইতিমধ্যে একটি অনুরোধ পাঠানো হয়েছে।");

        student.parentRequests.push({ parent: req.session.userId, status: 'pending' });
        await student.save();
        res.redirect('/parent/dashboard?success=requested');
    } catch (err) {
        res.status(500).send('Error connecting child');
    }
});

app.post('/student/approve-parent/:parentId', protect, async (req, res) => {
    try {
        const userId = req.session.userId;
        const student = await User.findById(userId);
        if (!student) return res.redirect('/login');

        const request = student.parentRequests.find(r => r.parent.toString() === req.params.parentId);
        if (request) {
            request.status = 'accepted';
            await student.save();
        }
        res.redirect('/dashboard?success=parent_approved');
    } catch (err) {
        console.error('Approve Parent Error:', err);
        res.status(500).send('অনুরোধটি গ্রহণ করা সম্ভব হয়নি।');
    }
});

app.post('/student/reject-parent/:parentId', protect, async (req, res) => {
    try {
        const userId = req.session.userId;
        const student = await User.findById(userId);
        if (!student) return res.redirect('/login');

        // Remove the request instead of just changing status to 'rejected' for cleaner data
        student.parentRequests = student.parentRequests.filter(r => r.parent.toString() !== req.params.parentId);
        await student.save();

        res.redirect('/dashboard?success=parent_rejected');
    } catch (err) {
        console.error('Reject Parent Error:', err);
        res.status(500).send('অনুরোধটি বাতিল করা সম্ভব হয়নি।');
    }
});

app.get('/teacher/dashboard', adminProtect, async (req, res) => {
    try {
        const teacherId = req.session.userId;
        const myCourses = await Course.find({ instructor: teacherId }).lean();

        // Fetch students enrolled in teacher's courses
        const totalStudents = await User.countDocuments({
            'enrolledCourses.course': { $in: myCourses.map(c => c._id) }
        });

        const openQas = await QA.find({
            status: 'open',
            // In a real app, we'd filter by subject or course here
        }).limit(5).populate('user').lean();

        res.render('teacher-dashboard', {
            user: req.session.user,
            courses: myCourses,
            stats: {
                totalStudents,
                totalCourses: myCourses.length,
                pendingQuestions: openQas.length
            },
            recentQuestions: openQas
        });
    } catch (err) {
        console.error('Teacher Dashboard Error:', err);
        res.status(500).send('টিচার ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে।');
    }
});

app.get('/admin', adminProtect, async (req, res) => {
    try {
        const studentCount = await User.countDocuments({ role: 'student' });
        const courseCount = await Course.countDocuments();
        const openQas = await QA.countDocuments({ status: 'open' });
        const allUsersCount = await User.countDocuments();
        res.render('admin/dashboard', {
            studentCount,
            courseCount,
            openQas,
            allUsersCount,
            user: req.session.user || { role: 'admin', name: 'এডমিন' }
        });
    } catch (err) {
        console.error('Admin Dashboard Error:', err);
        res.status(500).send('এডমিন ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে।');
    }
});

// --- Super Admin: User Management ---
app.get('/admin/users', superAdminProtect, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.render('admin/users', { users, user: req.session.user });
    } catch (err) {
        res.status(500).send('Error loading users');
    }
});

app.post('/admin/update-role/:id', superAdminProtect, async (req, res) => {
    try {
        const { role } = req.body;
        if (role === 'superadmin' && req.session.user.role !== 'superadmin') return res.status(403).send('Unauthorized');
        await User.findByIdAndUpdate(req.params.id, { role });
        res.redirect('/admin/users');
    } catch (err) {
        res.status(500).send('Error updating role');
    }
});

app.get('/admin/teacher', adminProtect, async (req, res) => {
    try {
        const courses = await Course.find();
        const studentCount = await User.countDocuments({ role: 'student' });
        res.render('teacher-dashboard', { courses, studentCount });
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/admin/course/:id', adminProtect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        res.render('admin-course-details', { course });
    } catch (err) { res.status(404).send('Not Found'); }
});

app.post('/admin/add-course', adminProtect, upload.single('thumbnail'), async (req, res) => {
    try {
        const { title, subject, category, classLevel, description, accessType, planNames, planDurations, planPrices, trialPeriod, featuredForClasses } = req.body;
        const thumbnail = req.file ? `/uploads/thumbnails/${req.file.filename}` : null;
        let plans = [];
        if (accessType === 'paid' || accessType === 'trial') {
            const names = Array.isArray(planNames) ? planNames : [planNames];
            const durations = Array.isArray(planDurations) ? planDurations : [planDurations];
            const prices = Array.isArray(planPrices) ? planPrices : [planPrices];
            plans = names.map((name, i) => ({ name, durationDays: parseInt(durations[i]) || 0, price: parseInt(prices[i]) || 0 })).filter(p => p.name);
        }
        await new Course({ title, subject, category, classLevel, description, thumbnail, accessType: accessType || 'free', plans, trialPeriod: trialPeriod || 0, featuredForClasses: Array.isArray(featuredForClasses) ? featuredForClasses : (featuredForClasses ? [featuredForClasses] : []) }).save();
        res.redirect('/admin/teacher');
    } catch (err) { res.status(500).send('Error'); }
});

app.post('/admin/course/:id/add-chapter', adminProtect, async (req, res) => {
    await Course.findByIdAndUpdate(req.params.id, { $push: { chapters: { title: req.body.title, recordedClasses: [], liveClasses: [], notes: [] } } });
    res.redirect(`/admin/course/${req.params.id}`);
});
app.post('/admin/course/:cid/chapter/:chid/add-recorded', adminProtect, upload.single('video'), async (req, res) => {
    const videoPath = req.file ? `/uploads/videos/${req.file.filename}` : null;
    await Course.updateOne({ _id: req.params.cid, "chapters._id": req.params.chid }, { $push: { "chapters.$.recordedClasses": { title: req.body.title, videoPath, duration: req.body.duration } } });
    res.redirect(`/admin/course/${req.params.cid}`);
});
app.post('/admin/course/:cid/chapter/:chid/add-note', adminProtect, upload.single('note'), async (req, res) => {
    const filePath = req.file ? `/uploads/notes/${req.file.filename}` : null;
    await Course.updateOne({ _id: req.params.cid, "chapters._id": req.params.chid }, { $push: { "chapters.$.notes": { title: req.body.title, filePath } } });
    res.redirect(`/admin/course/${req.params.cid}`);
});
app.get('/admin/quizzes', adminProtect, async (req, res) => {
    const quizzes = await Quiz.find().populate('course');
    const courses = await Course.find();
    res.render('admin-quizzes', { quizzes, courses });
});
app.post('/admin/add-quiz', adminProtect, async (req, res) => {
    await new Quiz({ title: req.body.title, course: req.body.courseId, duration: req.body.duration, questions: [] }).save();
    res.redirect('/admin/quizzes');
});

// --- Admin Notes Management ---
app.get('/admin/notes', adminProtect, async (req, res) => {
    const notes = await Note.find();
    res.render('admin-notes', { notes });
});
app.post('/admin/add-note', adminProtect, upload.single('note'), async (req, res) => {
    const { title, subject, classLevel, description } = req.body;
    const fileUrl = req.file ? `/uploads/notes/${req.file.filename}` : null;
    await new Note({ title, subject, classLevel, description, fileUrl }).save();
    res.redirect('/admin/notes');
});

// --- Admin QuestionBank Management ---
app.get('/admin/question-bank', adminProtect, async (req, res) => {
    const questions = await QuestionBank.find();
    res.render('admin-question-bank', { questions });
});
app.post('/admin/add-question-bank', adminProtect, upload.single('question'), async (req, res) => {
    const { year, board, subject, classLevel } = req.body;
    const fileUrl = req.file ? `/uploads/questions/${req.file.filename}` : null;
    await new QuestionBank({ year, board, subject, classLevel, fileUrl }).save();
    res.redirect('/admin/question-bank');
});

// --- Admin QA Management ---
app.get('/admin/qas', adminProtect, async (req, res) => {
    const qas = await QA.find().populate('askedBy');
    res.render('admin-qas', { qas });
});
app.post('/admin/qa-answer/:id', adminProtect, async (req, res) => {
    const { answer } = req.body;
    await QA.findByIdAndUpdate(req.params.id, { answer, status: 'resolved', answeredBy: req.session.userId });
    res.redirect('/admin/qas');
});

app.get('*', (req, res) => res.status(404).render('404'));

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}
module.exports = app;
