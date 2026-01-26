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

const app = express();
const PORT = process.env.PORT || 3005;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

// --- PATH RESOLUTION (SIMPLIFIED) ---
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
        mongoose.connection.on('connecting', () => console.log('⏳ Connecting to MongoDB...'));
        mongoose.connection.on('connected', () => console.log('✅ MongoDB Connected'));
        mongoose.connection.on('error', (err) => console.error('❌ MongoDB Error:', err.message));

        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 20000,
            socketTimeoutMS: 45000,
            heartbeatFrequencyMS: 10000
        });
    } catch (err) {
        console.error('❌ Database connection failure:', err.message);
        console.log('💡 IMPORTANT: Please check if your IP address is whitelisted in MongoDB Atlas (Network Access). This is the most common cause of timeouts.');
    }
};

// --- MIDDLEWARE SETUP ---

// Session Store with Fallback
let sessionStore;
try {
    // Only attempt MongoStore if URI looks valid (not localhost in production)
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalDB = MONGODB_URI.includes('localhost');

    if (isProduction && isLocalDB) {
        throw new Error("Production environment but Localhost DB URI detected.");
    }

    sessionStore = MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native'
    });
} catch (err) {
    console.warn('⚠️ Session Warning: Using MemoryStore.', err.message);
    sessionStore = new session.MemoryStore();
}

app.use(session({
    secret: 'oddhay_secret_key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Robust Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = '/tmp/uploads/'; // Always safe for serverless
        // Try local if explicitly local dev
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

        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- DATABASE CONNECTION ---
// Call connectDB immediately for serverless/Vercel support
connectDB();

app.use(async (req, res, next) => {
    // If not connected, try to connect again
    if (mongoose.connection.readyState === 0) {
        await connectDB();
    }
    next();
});

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

            if (user.role === 'teacher' || user.role === 'admin' || user.role === 'superadmin') return res.redirect('/admin');
            if (user.role === 'parent') return res.redirect('/parent/dashboard');
            res.redirect('/dashboard');
        } else {
            res.status(401).send('ইমেইল/ফোন বা পাসওয়ার্ড ভুল।');
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).send('লগইন করার সময় একটি সমস্যা হয়েছে।');
    }
});

app.post('/register', async (req, res) => {
    try {
        const { name, identifier, password, confirmPassword, role, classLevel } = req.body;

        // 1. Basic Field Validation
        if (!name || !identifier || !password || !confirmPassword) {
            return res.status(400).send('দয়া করে নাম, ইমেইল/ফোন এবং পাসওয়ার্ড প্রদান করুন।');
        }

        if (password !== confirmPassword) {
            return res.status(400).send('পাসওয়ার্ড দুটি মিলছে না।');
        }

        let email = null;
        let phone = null;

        // identifier parsing
        if (identifier.includes('@')) {
            email = identifier.trim();
        } else {
            phone = identifier.trim();
        }

        // 2. Pre-check for existing users (Concurrency safety)
        if (email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) return res.status(400).send(`এই ইমেইলটি ( ${email} ) ইতিপূর্বে ব্যবহৃত হয়েছে।`);
        }
        if (phone) {
            const existingPhone = await User.findOne({ phone });
            if (existingPhone) return res.status(400).send(`এই ফোন নম্বরটি ( ${phone} ) ইতিপূর্বে ব্যবহৃত হয়েছে।`);
        }

        const isSuperAdminEmail = email && process.env.SUPER_ADMIN_EMAIL && email === process.env.SUPER_ADMIN_EMAIL;

        const userData = {
            name,
            password,
            role: isSuperAdminEmail ? 'superadmin' : (role || 'student'),
            classLevel: role === 'parent' ? undefined : classLevel
        };

        if (email) userData.email = email;
        if (phone) userData.phone = phone;

        // 3. Create instance and trigger manual validation before hitting DB
        const newUser = new User(userData);

        // validate() is a Mongoose built-in that checks schema constraints without saving
        await newUser.validate();

        // 4. Save to DB (Actual storage only happens here)
        await newUser.save();

        const userObj = newUser.toObject();
        req.session.user = userObj;
        req.session.userId = userObj._id.toString();

        const currentRole = userObj.role;
        if (currentRole === 'superadmin' || currentRole === 'admin' || currentRole === 'teacher') {
            return res.redirect('/admin');
        }
        if (currentRole === 'parent') return res.redirect('/parent/dashboard');
        res.redirect('/dashboard');

    } catch (err) {
        console.error('Registration Critical Error:', err);

        // Detailed error reporting back to user
        if (err.name === 'ValidationError') {
            return res.status(400).send(`ভুল তথ্য প্রদান করা হয়েছে: ${Object.values(err.errors).map(e => e.message).join(', ')}`);
        }
        if (err.code === 11000) {
            return res.status(400).send('এই ইমেইল বা ফোন নম্বরটি ইতিপূর্বে ব্যবহৃত হয়েছে।');
        }

        res.status(500).send(`নিবন্ধন সম্পন্ন করা সম্ভব হয়নি: ${err.message}`);
    }
});

app.get('/dashboard', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id)
            .populate('quizResults.quiz')
            .populate('parentRequests.parent')
            .populate('enrolledCourses.course');
        const enrolledIds = user.enrolledCourses.map(e => e.course ? e.course._id : null).filter(id => id);
        const promotedCourses = await Course.find({
            featuredForClasses: user.classLevel,
            _id: { $nin: enrolledIds }
        }).limit(3);

        // Calculate Leaderboard
        const leaderboard = await User.aggregate([
            { $match: { role: 'student' } },
            { $unwind: { path: '$quizResults', preserveNullAndEmptyArrays: false } },
            {
                $group: {
                    _id: '$_id',
                    name: { $first: '$name' },
                    classLevel: { $first: '$classLevel' },
                    totalScore: { $sum: '$quizResults.score' }
                }
            },
            { $sort: { totalScore: -1 } },
            { $limit: 5 }
        ]);

        res.render('student-dashboard', { user, promotedCourses, leaderboard });
    } catch (err) {
        res.status(500).send('Dashboard Error');
    }
});

app.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id).populate('quizResults.quiz');
        res.render('profile', { user, success: req.query.success });
    } catch (err) {
        res.status(500).send('Profile Error');
    }
});

app.post('/profile/update', protect, async (req, res) => {
    try {
        const { name, password, classLevel } = req.body;
        const user = await User.findById(req.session.user._id);
        if (name) user.name = name;
        if (classLevel) user.classLevel = classLevel;
        if (password && password.trim() !== '') user.password = password;
        await user.save();
        req.session.user = user;
        res.redirect('/profile?success=true');
    } catch (err) {
        res.status(500).send('Error updating profile');
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
        const parent = await User.findById(req.session.user._id);
        const students = await User.find({ 'parentRequests': { $elemMatch: { parent: parent._id, status: 'accepted' } } })
            .populate({
                path: 'quizResults.quiz',
                populate: { path: 'course' }
            });
        res.render('parent-dashboard', { user: parent, confirmedChildren: students });
    } catch (err) {
        res.status(500).send('Error');
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
        const student = await User.findById(req.session.user._id);
        const reqs = student.parentRequests.find(r => r.parent.toString() === req.params.parentId);
        if (reqs) { reqs.status = 'accepted'; await student.save(); }
        res.redirect('/dashboard');
    } catch (err) { res.status(500).send('Error'); }
});

app.get('/admin', adminProtect, async (req, res) => {
    try {
        const studentCount = await User.countDocuments({ role: 'student' });
        const courseCount = await Course.countDocuments();
        const openQas = await QA.countDocuments({ status: 'open' });
        const allUsersCount = await User.countDocuments();
        res.render('admin/dashboard', { studentCount, courseCount, openQas, allUsersCount, user: req.session.user });
    } catch (err) {
        res.status(500).send('Error');
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
