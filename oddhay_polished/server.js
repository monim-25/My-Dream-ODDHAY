require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');

// Import Models
const Course = require('./models/Course');
const User = require('./models/User');
const Quiz = require('./models/Quiz');
const Book = require('./models/Book');
const Question = require('./models/Question');

const app = express();
const PORT = process.env.PORT || 3000;
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ Database connection error:', err));

// Sessions
app.use(session({
    secret: 'oddhay_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.default.create({ mongoUrl: MONGODB_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Multer Configuration for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dest = 'public/uploads/';
        if (file.fieldname === 'thumbnail') dest += 'thumbnails/';
        else if (file.fieldname === 'video') dest += 'videos/';
        else if (file.fieldname === 'note') dest += 'notes/';
        else if (file.fieldname === 'book') dest += 'books/';
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Middleware to pass user data to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Auth Middleware
const protect = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const adminProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'teacher') {
        next();
    } else {
        res.status(403).send('Access Denied');
    }
};

const parentProtect = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'parent') {
        next();
    } else {
        res.redirect('/login');
    }
};

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Frontend Routes ---
app.get('/', async (req, res) => {
    try {
        const courses = await Course.find().limit(6);
        const categories = await Course.distinct('category');
        res.render('index', { courses, categories });
    } catch (err) {
        res.render('index', { courses: [], categories: [] });
    }
});

app.get('/pricing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

app.get('/login', (req, res) => {
    res.render('login');
});

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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Forgot Password Routes
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) {
        // Simulate sending email
        console.log(`[SIMULATION] Password reset link for ${email}: http://localhost:3000/reset-password/${user._id}`);
        // In real app, we would generate a secure random token and expire time
    }
    res.render('forgot-password', { message: 'যদি ইমেইলটি আমাদের সিস্টেমে থাকে, তবে একটি রিসেট লিঙ্ক পাঠানো হয়েছে।' });
});

app.get('/reset-password/:id', (req, res) => {
    res.render('reset-password', { userId: req.params.id });
});

app.post('/reset-password/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            user.password = req.body.password; // Pre-save hook will hash it
            await user.save();
            res.redirect('/login');
        } else {
            res.send('Invalid Request');
        }
    } catch (err) {
        res.status(500).send('Error resetting password');
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/dashboard', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id)
            .populate('quizResults.quiz')
            .populate('parentRequests.parent')
            .populate('enrolledCourses.course');

        // Fetch promoted courses for this user's class that they are NOT enrolled in
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

// Update Profile Logic
app.post('/profile/update', protect, async (req, res) => {
    try {
        const { name, password, classLevel } = req.body;
        const user = await User.findById(req.session.user._id);

        if (name) user.name = name;
        if (classLevel) user.classLevel = classLevel;
        if (password && password.trim() !== '') {
            user.password = password; // Will be hashed by pre-save hook
        }

        await user.save();
        req.session.user = user; // Update session
        res.redirect('/profile?success=true');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating profile');
    }
});

// Student Profile Page
app.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id).populate('quizResults.quiz');
        res.render('profile', { user, success: req.query.success });
    } catch (err) {
        res.status(500).send('Profile Error');
    }
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/contact', (req, res) => {
    res.render('contact');
});

app.post('/contact-submit', (req, res) => {
    // In a real app, send email here
    console.log('Contact Form:', req.body);
    // Simple redirect back with a query param for a toast notification (simulated)
    res.redirect('/?contact=success');
});

// Virtual Library (Reading & Notes)
app.get('/library', protect, async (req, res) => {
    try {
        const books = await Book.find();
        res.render('library', { books });
    } catch (err) {
        res.status(500).send('Library Error');
    }
});

// Self-Mock Test Selection
app.get('/create-self-quiz', protect, async (req, res) => {
    try {
        const subjects = await Question.distinct('subject');
        const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
        res.render('create-self-quiz', { subjects, classes });
    } catch (err) {
        res.status(500).send('Error loading quiz setup');
    }
});

// Generate Quiz from Bank
app.post('/api/generate-quiz', protect, async (req, res) => {
    try {
        const { subject, classLevel, count } = req.body;
        const questions = await Question.aggregate([
            { $match: { subject, classLevel } },
            { $sample: { size: parseInt(count) || 10 } }
        ]);

        if (questions.length === 0) {
            return res.status(404).json({ message: 'পর্যাপ্ত প্রশ্ন পাওয়া যায়নি।' });
        }

        // Create a temporary quiz for session
        req.session.tempQuiz = {
            title: `Custom ${subject} Quiz`,
            questions: questions.map(q => ({
                questionText: q.questionText,
                options: q.options,
                correctAnswerIndex: q.correctAnswerIndex
            }))
        };

        res.json({ success: true, redirect: '/take-temp-quiz' });
    } catch (err) {
        res.status(500).json({ message: 'Error generating quiz' });
    }
});

app.get('/take-temp-quiz', protect, (req, res) => {
    if (!req.session.tempQuiz) return res.redirect('/dashboard');
    if (!req.session.tempQuiz.duration) req.session.tempQuiz.duration = 10;
    res.render('quiz', { quiz: req.session.tempQuiz });
});

// Features: Recorded Class, Live Class, Notes
app.get('/feature/:type', protect, async (req, res) => {
    try {
        const { type } = req.params;
        const subjects = await Course.distinct('subject', { classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-subjects', { type, subjects });
    } catch (err) {
        res.status(500).send('Error loading features');
    }
});

app.get('/feature/:type/:subject', protect, async (req, res) => {
    try {
        const { type, subject } = req.params;
        const courses = await Course.find({ subject, classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-chapters', { type, subject, courses });
    } catch (err) {
        res.status(500).send('Error loading chapters');
    }
});

app.get('/ai-tutor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ai-tutor.html'));
});

// Fetch Real Courses from Database for Course Library
app.get('/courses', async (req, res) => {
    try {
        const { search, category, classLevel } = req.query;
        let query = {};
        if (search) {
            query.title = { $regex: search, $options: 'i' };
        }
        if (category && category !== 'all') {
            query.category = category;
        }
        if (classLevel && classLevel !== 'all') {
            query.classLevel = classLevel;
        }

        const courses = await Course.find(query);
        const categories = await Course.distinct('category');
        const classes = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];

        res.render('courses', {
            courses,
            categories,
            classes,
            search,
            activeCategory: category,
            activeClass: classLevel
        });
    } catch (err) {
        res.status(500).send('Error fetching courses');
    }
});

// Student: View Course Content / Video Player
app.get('/course-details/:id', protect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).send('Course not found');

        const user = await User.findById(req.session.user._id);
        let hasAccess = false;
        let trialExpired = false;
        let subscriptionExpired = false;

        // Check Access
        if (course.accessType === 'free') {
            hasAccess = true;
        } else {
            // Check Paid Enrollment
            const enrollment = user.enrolledCourses.find(e => e.course.toString() === course._id.toString());
            if (enrollment) {
                if (!enrollment.expiresAt || new Date(enrollment.expiresAt) > new Date()) {
                    hasAccess = true;
                } else {
                    subscriptionExpired = true;
                }
            }

            // Check Trial (only if not paid)
            if (!hasAccess && course.accessType === 'trial') {
                const trial = user.trialEnrollments.find(t => t.course.toString() === course._id.toString());
                if (trial) {
                    const now = new Date();
                    const diffTime = Math.abs(now - trial.startedAt);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays <= course.trialPeriod) {
                        hasAccess = true;
                    } else {
                        trialExpired = true;
                    }
                }
            }
        }

        // Flatten chapters for the player (video playlist)
        const lessons = [];
        const allNotes = [];
        if (course.chapters) {
            course.chapters.forEach(chapter => {
                if (chapter.recordedClasses) {
                    chapter.recordedClasses.forEach(cls => {
                        lessons.push({
                            _id: cls._id,
                            title: cls.title,
                            videoUrl: cls.videoPath, // Map videoPath to videoUrl
                            duration: cls.duration,
                            chapterTitle: chapter.title
                        });
                    });
                }
                if (chapter.notes) {
                    chapter.notes.forEach(note => {
                        allNotes.push({
                            title: note.title,
                            fileUrl: note.filePath
                        });
                    });
                }
            });
        }

        // Attach flattened data to a plain object copy or extend the mongoose doc
        const courseData = course.toObject();
        courseData.lessons = lessons;
        courseData.notes = allNotes;

        const similarCourses = await Course.find({ category: course.category, _id: { $ne: course._id } }).limit(3);
        res.render('lesson-player', { course: courseData, similarCourses, hasAccess, trialExpired, subscriptionExpired, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading course');
    }
});

// Track Progress
app.post('/api/progress', protect, async (req, res) => {
    try {
        const { lessonId } = req.body;
        const user = await User.findById(req.session.user._id);

        // Avoid duplicates
        if (!user.completedLessons.includes(lessonId)) {
            user.completedLessons.push(lessonId);
            await user.save();
        }

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});
// Enroll in Trial
app.post('/enroll-trial/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        const alreadyInTrial = user.trialEnrollments.find(t => t.course.toString() === req.params.id);
        if (!alreadyInTrial) {
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
        if (!course) return res.status(404).send('Course not found');
        res.render('checkout', { course });
    } catch (err) {
        res.status(500).send('Checkout Error');
    }
});
app.post('/buy-course/:id', protect, async (req, res) => {
    try {
        const { planIndex, paymentMethod, transactionId, phoneNumber } = req.body;
        const user = await User.findById(req.session.user._id);
        const course = await Course.findById(req.params.id);

        if (!course || !course.plans[planIndex]) return res.status(404).send('Plan not found');

        const plan = course.plans[planIndex];
        let expiresAt = null;
        if (plan.durationDays > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
        }

        // Check if already enrolled
        const enrollmentIndex = user.enrolledCourses.findIndex(e => e.course.toString() === req.params.id);
        if (enrollmentIndex > -1) {
            // Update existing subscription
            user.enrolledCourses[enrollmentIndex].expiresAt = expiresAt;
        } else {
            // New subscription
            user.enrolledCourses.push({ course: req.params.id, expiresAt });
        }

        await user.save();
        res.redirect(`/course-details/${req.params.id}`);
    } catch (err) {
        res.status(500).send('Error purchasing course');
    }
});

// --- Backend / Admin Routes ---

// Teacher Dashboard Overview
app.get('/admin/teacher', adminProtect, async (req, res) => {
    try {
        const courses = await Course.find();
        const users = await User.find({ role: 'student' });
        res.render('teacher-dashboard', { courses, studentCount: users.length });
    } catch (err) {
        res.status(500).send('Admin Access Error');
    }
});

// Manage specific course content
app.get('/admin/course/:id', adminProtect, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        res.render('admin-course-details', { course });
    } catch (err) {
        res.status(404).send('Course not found');
    }
});

// Route to add a new course with thumbnail upload
app.post('/admin/add-course', adminProtect, upload.single('thumbnail'), async (req, res) => {
    try {
        const { title, subject, category, classLevel, description, accessType, planNames, planDurations, planPrices, trialPeriod, featuredForClasses } = req.body;
        const thumbnail = req.file ? `/uploads/thumbnails/${req.file.filename}` : null;

        let featuredClasses = [];
        if (featuredForClasses) {
            featuredClasses = Array.isArray(featuredForClasses) ? featuredForClasses : [featuredForClasses];
        }

        let plans = [];
        if (accessType === 'paid' || accessType === 'trial') {
            if (Array.isArray(planNames)) {
                plans = planNames.map((name, i) => ({
                    name,
                    durationDays: parseInt(planDurations[i]) || 0,
                    price: parseInt(planPrices[i]) || 0
                }));
            } else if (planNames) {
                plans.push({
                    name: planNames,
                    durationDays: parseInt(planDurations) || 0,
                    price: parseInt(planPrices) || 0
                });
            }
        }

        const newCourse = new Course({
            title, subject, category, classLevel, description, thumbnail,
            accessType: accessType || 'free',
            plans,
            trialPeriod: trialPeriod || 0,
            featuredForClasses: featuredClasses
        });
        await newCourse.save();
        res.redirect('/admin/teacher');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding course');
    }
});

// Add Chapter to Course
app.post('/admin/course/:id/add-chapter', adminProtect, async (req, res) => {
    try {
        const { title } = req.body;
        await Course.findByIdAndUpdate(req.params.id, {
            $push: { chapters: { title, recordedClasses: [], liveClasses: [], notes: [], quizzes: [] } }
        });
        res.redirect(`/admin/course/${req.params.id}`);
    } catch (err) {
        res.status(500).send('Error adding chapter');
    }
});

// Add recorded lesson to chapter
app.post('/admin/course/:courseId/chapter/:chapterId/add-recorded', adminProtect, upload.single('video'), async (req, res) => {
    try {
        const { title, duration } = req.body;
        const videoPath = req.file ? `/uploads/videos/${req.file.filename}` : null;

        await Course.updateOne(
            { _id: req.params.courseId, "chapters._id": req.params.chapterId },
            { $push: { "chapters.$.recordedClasses": { title, videoPath, duration } } }
        );
        res.redirect(`/admin/course/${req.params.courseId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding recorded class');
    }
});

// Add live lesson to chapter
app.post('/admin/course/:courseId/chapter/:chapterId/add-live', adminProtect, async (req, res) => {
    try {
        const { title, meetingUrl, date } = req.body;
        await Course.updateOne(
            { _id: req.params.courseId, "chapters._id": req.params.chapterId },
            { $push: { "chapters.$.liveClasses": { title, meetingUrl, date } } }
        );
        res.redirect(`/admin/course/${req.params.courseId}`);
    } catch (err) {
        res.status(500).send('Error adding live class');
    }
});

// Add note to chapter
app.post('/admin/course/:courseId/chapter/:chapterId/add-note', adminProtect, upload.single('note'), async (req, res) => {
    try {
        const { title } = req.body;
        const filePath = req.file ? `/uploads/notes/${req.file.filename}` : null;
        await Course.updateOne(
            { _id: req.params.courseId, "chapters._id": req.params.chapterId },
            { $push: { "chapters.$.notes": { title, filePath } } }
        );
        res.redirect(`/admin/course/${req.params.courseId}`);
    } catch (err) {
        res.status(500).send('Error adding note');
    }
});

// Add Question to Bank (Admin only)
app.post('/admin/add-question', adminProtect, async (req, res) => {
    try {
        const { subject, topic, classLevel, questionText, options, correctAnswerIndex } = req.body;
        const newQuestion = new Question({
            subject, topic, classLevel, questionText,
            options: options.split(',').map(o => o.trim()),
            correctAnswerIndex
        });
        await newQuestion.save();
        res.redirect('/admin/teacher');
    } catch (err) {
        res.status(500).send('Error adding question');
    }
});

// Add Book to Library (Admin)
app.post('/admin/add-book', adminProtect, upload.single('book'), async (req, res) => {
    try {
        const { title, author, classLevel, category, type } = req.body;
        const fileUrl = req.file ? `/uploads/books/${req.file.filename}` : null;
        const newBook = new Book({ title, author, classLevel, category, type, fileUrl });
        await newBook.save();
        res.redirect('/admin/teacher');
    } catch (err) {
        res.status(500).send('Error adding book');
    }
});

// User Registration Handler
// User Registration Handler
app.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, phone, classLevel } = req.body;
        const newUser = new User({ name, email, password, role, phone, classLevel });
        await newUser.save();

        // Auto-login after registration
        req.session.user = newUser;
        if (role === 'teacher') return res.redirect('/admin/teacher');
        if (role === 'parent') return res.redirect('/parent/dashboard');

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Registration Error');
    }
});

// --- Parent Portal Routes ---
app.get('/parent/dashboard', parentProtect, async (req, res) => {
    try {
        // Find children where this parent is linked AND the student has accepted
        const parent = await User.findById(req.session.user._id);

        // Find students who have accepted this parent
        const students = await User.find({
            'parentRequests': {
                $elemMatch: { parent: parent._id, status: 'accepted' }
            }
        }).populate({
            path: 'quizResults.quiz'
        });

        res.render('parent-dashboard', { user: parent, confirmedChildren: students });
    } catch (err) {
        res.status(500).send('Dashboard Error');
    }
});

app.post('/parent/add-child', parentProtect, async (req, res) => {
    try {
        const { childEmail } = req.body;
        const student = await User.findOne({ email: childEmail, role: 'student' });
        if (!student) return res.send("এই ইমেইল দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি।");

        // Check if request already exists
        const alreadyRequested = student.parentRequests.find(r => r.parent.toString() === req.session.user._id);
        if (alreadyRequested) return res.send("আপনি ইতিমধ্যে এই শিক্ষার্থীকে রিকোয়েস্ট পাঠিয়েছেন।");

        student.parentRequests.push({ parent: req.session.user._id, status: 'pending' });
        await student.save();

        res.redirect('/parent/dashboard');
    } catch (err) {
        res.status(500).send('Error sending request');
    }
});

// Student side approval
app.post('/student/approve-parent/:parentId', protect, async (req, res) => {
    try {
        const student = await User.findById(req.session.user._id);
        const request = student.parentRequests.find(r => r.parent.toString() === req.params.parentId);
        if (request) {
            request.status = 'accepted';
            await student.save();
        }
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send('Approval Error');
    }
});

app.post('/student/reject-parent/:parentId', protect, async (req, res) => {
    try {
        const student = await User.findById(req.session.user._id);
        student.parentRequests = student.parentRequests.filter(r => r.parent.toString() !== req.params.parentId);
        await student.save();
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send('Rejection Error');
    }
});

// --- Quiz Routes ---

// Student: View Quiz Page
app.get('/quiz/:id', protect, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        res.render('quiz', { quiz });
    } catch (err) {
        res.status(404).send('Quiz not found');
    }
});

// Student: Submit Quiz
app.post('/submit-quiz/:id', protect, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        let score = 0;

        quiz.questions.forEach((q, index) => {
            const studentAns = req.body[`question_${index}`];
            if (parseInt(studentAns) === q.correctAnswerIndex) {
                score++;
            }
        });

        // Save result to the logged in student
        const student = await User.findById(req.session.user._id);
        if (student) {
            student.quizResults.push({
                quiz: quiz._id,
                score: score,
                total: quiz.questions.length
            });
            await student.save();
        }

        res.render('quiz-result', { score, total: quiz.questions.length });
    } catch (err) {
        res.status(500).send('Error submitting quiz');
    }
});

// Teacher: Quiz Overview & Add Quiz (Basic Implementation)
app.get('/admin/quizzes', async (req, res) => {
    try {
        const quizzes = await Quiz.find().populate('course');
        const courses = await Course.find();
        res.render('admin-quizzes', { quizzes, courses });
    } catch (err) {
        res.status(500).send('Error loading quizzes');
    }
});

app.post('/admin/add-quiz', async (req, res) => {
    try {
        const { title, courseId, duration } = req.body;
        // This is a simplified example with dummy questions for structure
        const newQuiz = new Quiz({
            title,
            course: courseId,
            duration,
            questions: [
                { questionText: "গণিতের জনক কে?", options: ["আর্কিমিডিস", "পিথাগোরাস", "নিউটন", "আইনস্টাইন"], correctAnswerIndex: 0 },
                { questionText: "ODDHAY কী ধরনের প্ল্যাটফর্ম?", options: ["বিনোদন", "শিক্ষা", "গেম", "সোশ্যাল মিডিয়া"], correctAnswerIndex: 1 }
            ]
        });
        await newQuiz.save();
        res.redirect('/admin/quizzes');
    } catch (err) {
        res.status(500).send('Error adding quiz');
    }
});

// --- Progress Tracking API ---
app.post('/api/progress', async (req, res) => {
    try {
        const { lessonId } = req.body;
        const student = await User.findOne({ role: 'student' });
        if (student) {
            if (!student.completedLessons.includes(lessonId)) {
                student.completedLessons.push(lessonId);
                await student.save();
            }
            res.status(200).send('Progress Recorded');
        } else {
            res.status(404).send('Student not found');
        }
    } catch (err) {
        res.status(500).send('Error recording progress');
    }
});

app.get('*', (req, res) => {
    res.status(404).render('404');
});

app.listen(PORT, () => {
    console.log(`🚀 ODDHAY server running at http://localhost:${PORT}`);
});
