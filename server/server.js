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

const app = express();
const PORT = process.env.PORT || 3005;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

// --- DATABASE CONNECTION (Optimized for Serverless) ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        isConnected = true;
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
    }
};

// --- MIDDLEWARES ---

// Sessions setup
app.use(session({
    secret: 'oddhay_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// File Upload Config (Handling Vercel /tmp)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = '/tmp/uploads/';
        if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
            dest = path.join(__dirname, '../client/public/uploads/');
        }

        if (file.fieldname === 'thumbnail') dest += 'thumbnails/';
        else if (file.fieldname === 'video') dest += 'videos/';
        else if (file.fieldname === 'note') dest += 'notes/';
        else if (file.fieldname === 'book') dest += 'books/';

        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Database Connection Middleware
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// User Local Variables
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.set('view engine', 'ejs');
// Debugging paths for Vercel
console.log('__dirname:', __dirname);
console.log('Views path:', path.join(__dirname, '../client/views'));
app.set('views', path.join(__dirname, '../client/views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Serve static files
app.use(express.static(path.join(__dirname, '../client/public')));

// Auth Middlewares
const protect = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

const adminProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'teacher') next();
    else res.status(403).send('Access Denied');
};

const parentProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'parent') next();
    else res.redirect('/login');
};

// --- ROUTES ---

app.get('/', async (req, res) => {
    try {
        const courses = await Course.find().limit(6);
        const categories = await Course.distinct('category');
        res.render('index', { courses, categories });
    } catch (err) {
        res.render('index', { courses: [], categories: [] });
    }
});

app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, '../client/public', 'pricing.html')));
app.get('/ai-tutor', (req, res) => res.sendFile(path.join(__dirname, '../client/public', 'ai-tutor.html')));
app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));
app.post('/contact-submit', (req, res) => res.redirect('/?contact=success'));

// Auth Routes
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && await user.comparePassword(password)) {
            req.session.user = user;
            if (user.role === 'teacher') return res.redirect('/admin/teacher');
            if (user.role === 'parent') return res.redirect('/parent/dashboard');
            res.redirect('/dashboard');
        } else {
            res.status(401).send('ইমেইল বা পাসওয়ার্ড ভুল।');
        }
    } catch (err) {
        res.status(500).send('Login Error');
    }
});

app.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, phone, classLevel } = req.body;
        const newUser = new User({ name, email, password, role, phone, classLevel });
        await newUser.save();
        req.session.user = newUser;
        if (role === 'teacher') return res.redirect('/admin/teacher');
        if (role === 'parent') return res.redirect('/parent/dashboard');
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send('Registration Error');
    }
});

// Dashboard & Profile
app.get('/dashboard', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id)
            .populate('quizResults.quiz')
            .populate('parentRequests.parent')
            .populate('enrolledCourses.course');
        const enrolledIds = user.enrolledCourses.map(e => e.course._id);
        const promotedCourses = await Course.find({
            featuredForClasses: user.classLevel,
            _id: { $nin: enrolledIds }
        }).limit(3);
        res.render('student-dashboard', { user, promotedCourses });
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

// Features
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
        res.render('courses', { courses, categories, classes, search, activeCategory: category, activeClass: classLevel });
    } catch (err) {
        res.status(500).send('Error fetching courses');
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

        const lessons = [];
        const allNotes = [];
        if (course.chapters) {
            course.chapters.forEach(chapter => {
                if (chapter.recordedClasses) chapter.recordedClasses.forEach(cls => lessons.push({ ...cls.toObject(), chapterTitle: chapter.title, videoUrl: cls.videoPath }));
                if (chapter.notes) chapter.notes.forEach(note => allNotes.push({ title: note.title, fileUrl: note.filePath }));
            });
        }

        res.render('lesson-player', { course: { ...course.toObject(), lessons, notes: allNotes }, similarCourses: [], hasAccess, trialExpired, subscriptionExpired, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading course');
    }
});

app.post('/api/progress', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user.completedLessons.includes(req.body.lessonId)) {
            user.completedLessons.push(req.body.lessonId);
            await user.save();
        }
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
        res.status(500).send('Checkout Error');
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
        res.status(500).send('Error purchasing course');
    }
});

app.get('/library', protect, async (req, res) => {
    try {
        const books = await Book.find();
        res.render('library', { books });
    } catch (err) {
        res.status(500).send('Library Error');
    }
});

app.get('/feature/:type', protect, async (req, res) => {
    try {
        const subjects = await Course.distinct('subject', { classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-subjects', { type: req.params.type, subjects });
    } catch (err) {
        res.status(500).send('Error loading features');
    }
});

app.get('/feature/:type/:subject', protect, async (req, res) => {
    try {
        const courses = await Course.find({ subject: req.params.subject, classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-chapters', { type: req.params.type, subject: req.params.subject, courses });
    } catch (err) {
        res.status(500).send('Error loading chapters');
    }
});

// Quiz System
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
        const questions = await Question.aggregate([
            { $match: { subject, classLevel } },
            { $sample: { size: parseInt(count) || 10 } }
        ]);
        if (!questions.length) return res.status(404).json({ message: 'No questions found' });
        req.session.tempQuiz = {
            title: `Custom ${subject} Quiz`,
            questions: questions.map(q => ({ questionText: q.questionText, options: q.options, correctAnswerIndex: q.correctAnswerIndex })),
            duration: 10
        };
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
        quiz.questions.forEach((q, index) => {
            if (parseInt(req.body[`question_${index}`]) === q.correctAnswerIndex) score++;
        });
        const student = await User.findById(req.session.user._id);
        student.quizResults.push({ quiz: quiz._id, score, total: quiz.questions.length });
        await student.save();
        res.render('quiz-result', { score, total: quiz.questions.length });
    } catch (err) {
        res.status(500).send('Error');
    }
});

// --- PARENT PORTAL ---
app.get('/parent/dashboard', parentProtect, async (req, res) => {
    try {
        const parent = await User.findById(req.session.user._id);
        const students = await User.find({ 'parentRequests': { $elemMatch: { parent: parent._id, status: 'accepted' } } }).populate('quizResults.quiz');
        res.render('parent-dashboard', { user: parent, confirmedChildren: students });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/parent/add-child', parentProtect, async (req, res) => {
    try {
        const student = await User.findOne({ email: req.body.childEmail, role: 'student' });
        if (!student) return res.send("শিক্ষার্থী পাওয়া যায়নি।");
        if (student.parentRequests.find(r => r.parent.toString() === req.session.user._id)) return res.send("রিকোয়েস্ট ইতিমধ্যে পাঠানো হয়েছে।");
        student.parentRequests.push({ parent: req.session.user._id, status: 'pending' });
        await student.save();
        res.redirect('/parent/dashboard');
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/student/approve-parent/:parentId', protect, async (req, res) => {
    try {
        const student = await User.findById(req.session.user._id);
        const reqs = student.parentRequests.find(r => r.parent.toString() === req.params.parentId);
        if (reqs) { reqs.status = 'accepted'; await student.save(); }
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send('Error');
    }
});

// --- ADMIN ROUTES ---
app.get('/admin/teacher', adminProtect, async (req, res) => {
    try {
        const courses = await Course.find();
        const studentCount = await User.countDocuments({ role: 'student' });
        res.render('teacher-dashboard', { courses, studentCount });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/admin/course/:id', adminProtect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        res.render('admin-course-details', { course });
    } catch (err) {
        res.status(404).send('Course not found');
    }
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

        const newCourse = new Course({
            title, subject, category, classLevel, description, thumbnail,
            accessType: accessType || 'free',
            plans,
            trialPeriod: trialPeriod || 0,
            featuredForClasses: Array.isArray(featuredForClasses) ? featuredForClasses : (featuredForClasses ? [featuredForClasses] : [])
        });
        await newCourse.save();
        res.redirect('/admin/teacher');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding course');
    }
});

app.post('/admin/course/:id/add-chapter', adminProtect, async (req, res) => {
    await Course.findByIdAndUpdate(req.params.id, { $push: { chapters: { title: req.body.title, recordedClasses: [], liveClasses: [], notes: [] } } });
    res.redirect(`/admin/course/${req.params.id}`);
});

app.post('/admin/course/:courseId/chapter/:chapterId/add-recorded', adminProtect, upload.single('video'), async (req, res) => {
    const videoPath = req.file ? `/uploads/videos/${req.file.filename}` : null;
    await Course.updateOne({ _id: req.params.courseId, "chapters._id": req.params.chapterId }, { $push: { "chapters.$.recordedClasses": { title: req.body.title, videoPath, duration: req.body.duration } } });
    res.redirect(`/admin/course/${req.params.courseId}`);
});

app.post('/admin/course/:courseId/chapter/:chapterId/add-note', adminProtect, upload.single('note'), async (req, res) => {
    const filePath = req.file ? `/uploads/notes/${req.file.filename}` : null;
    await Course.updateOne({ _id: req.params.courseId, "chapters._id": req.params.chapterId }, { $push: { "chapters.$.notes": { title: req.body.title, filePath } } });
    res.redirect(`/admin/course/${req.params.courseId}`);
});

app.get('/admin/quizzes', async (req, res) => {
    const quizzes = await Quiz.find().populate('course');
    const courses = await Course.find();
    res.render('admin-quizzes', { quizzes, courses });
});

app.post('/admin/add-quiz', async (req, res) => {
    await new Quiz({ title: req.body.title, course: req.body.courseId, duration: req.body.duration, questions: [] }).save();
    res.redirect('/admin/quizzes');
});

app.get('*', (req, res) => res.status(404).render('404'));

// LOCAL DEVELOPMENT: Start server
if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`🚀 ODDHAY server running at http://localhost:${PORT}`);
        await connectDB();
    });
}

// VERCEL: Export the app
module.exports = app;
