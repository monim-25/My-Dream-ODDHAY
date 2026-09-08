const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { connectDB, protect, User } = require('../config');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // Limit each IP to 30 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const msg = 'অনেকবার চেষ্টা করেছেন, দয়া করে ৫ মিনিট পর আবার চেষ্টা করুন।';
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(429).json({ error: msg });
        }
        res.status(429).render('login', { error: msg });
    }
});

const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'অনেকবার চেষ্টা করেছেন, দয়া করে ১৫ মিনিট পর আবার চেষ্টা করুন।'
});

// Helper to normalize phone / email
function normalizeIdentifier(rawId) {
    let clean = (rawId || '').trim();
    if (!clean) return { email: null, phone: null };

    if (clean.includes('@')) {
        return { email: clean.toLowerCase(), phone: null };
    }

    // Convert Bengali digits (০-৯) to English digits (0-9)
    const bengaliDigits = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
    clean = clean.replace(/[০-৯]/g, d => bengaliDigits[d]);

    // Clean phone number: remove spaces, hyphens, plus, parentheses
    let phone = clean.replace(/[\s\-\+\(\)]/g, '');
    if (phone.startsWith('880')) {
        phone = '0' + phone.substring(3);
    }
    return { email: null, phone };
}

async function getAcademicClasses() {
    const defaultClasses = [
        { name: 'Class 6' }, { name: 'Class 7' }, { name: 'Class 8' },
        { name: 'Class 9' }, { name: 'Class 10' }, { name: 'Class 11' },
        { name: 'Class 12' }, { name: 'Admission' }, { name: 'Skill Development' }
    ];
    try {
        const AcademicClass = require('../models/AcademicClass');
        await connectDB();
        const classes = await AcademicClass.find().sort({ order: 1 }).lean();
        return (classes && classes.length > 0) ? classes : defaultClasses;
    } catch (e) {
        return defaultClasses;
    }
}

// GET Login/Register pages
router.get('/login', async (req, res) => {
    const academicClasses = await getAcademicClasses();
    res.render('login', { academicClasses, activeTab: 'login', error: null });
});
router.get('/register', async (req, res) => {
    const academicClasses = await getAcademicClasses();
    res.render('register', { academicClasses, activeTab: 'register' });
});
router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
router.get('/forgot-password', (req, res) => res.render('forgot-password', { message: null, error: null }));

// GET Force Change Password page
router.get('/change-password', protect, (req, res) => {
    res.render('change-password', { user: req.session.user, error: null });
});

// POST Force Change Password
router.post('/change-password', protect, async (req, res) => {
    try {
        await connectDB();
        const { newPassword, confirmPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return res.render('change-password', { user: req.session.user, error: 'Password must be at least 6 characters.' });
        if (newPassword !== confirmPassword) return res.render('change-password', { user: req.session.user, error: 'Passwords do not match.' });

        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(newPassword, 10);

        req.session.user.passwordResetRequired = false;
        await User.findByIdAndUpdate(req.session.userId, {
            password: hashed,
            passwordResetRequired: false
        });

        // Update session user
        req.session.user.passwordResetRequired = false;

        // Dynamic Redirection based on role
        const user = req.session.user;
        let redirectUrl = '/dashboard';
        if (user.role === 'superadmin') redirectUrl = '/superadmin';
        else if (user.role === 'admin') redirectUrl = '/admin';
        else if (user.role === 'teacher') redirectUrl = '/teacher';
        else if (user.role === 'parent') redirectUrl = '/parent/dashboard';

        res.redirect(redirectUrl);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// GET Reset password page
router.get('/reset-password/:token', async (req, res) => {
    try {
        await connectDB();
        const user = await User.findOne({
            passwordResetToken: req.params.token,
            passwordResetExpires: { $gt: Date.now() }
        });
        if (!user) return res.render('forgot-password', { message: null, error: 'রিসেট লিঙ্কটি মেয়াদ শেষ বা অবৈধ। আবার চেষ্টা করুন।' });
        res.render('reset-password', { token: req.params.token, error: null });
    } catch (err) {
        res.status(500).send('সার্ভার ত্রুটি');
    }
});

// POST Forgot password - send email
router.post('/forgot-password', forgotLimiter, async (req, res) => {
    try {
        await connectDB();
        const { email } = req.body;
        if (!email) return res.render('forgot-password', { message: null, error: 'ইমেইল দিন।' });
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        const successMsg = 'যদি এই ইমেইলে কোনো অ্যাকাউন্ট থাকে, তাহলে একটি রিসেট লিঙ্ক পাঠানো হয়েছে।';
        if (!user) return res.render('forgot-password', { message: successMsg, error: null });

        const token = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = token;
        user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
        await user.save();

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3005}`;
        await sendPasswordResetEmail(user.email, user.name, `${baseUrl}/reset-password/${token}`);
        res.render('forgot-password', { message: successMsg, error: null });
    } catch (err) {
        res.render('forgot-password', { message: null, error: `ইমেইল পাঠাতে সমস্যা: ${err.message}` });
    }
});

// POST Reset password
router.post('/reset-password/:token', async (req, res) => {
    try {
        await connectDB();
        const { password, confirmPassword } = req.body;
        if (!password || password.length < 6)
            return res.render('reset-password', { token: req.params.token, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
        if (password !== confirmPassword)
            return res.render('reset-password', { token: req.params.token, error: 'পাসওয়ার্ড দুটি মিলছে না।' });

        const user = await User.findOne({ passwordResetToken: req.params.token, passwordResetExpires: { $gt: Date.now() } });
        if (!user) return res.render('forgot-password', { message: null, error: 'রিসেট লিঙ্কটি মেয়াদ শেষ।' });

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        res.redirect('/login?reset=success');
    } catch (err) {
        res.render('reset-password', { token: req.params.token, error: 'সার্ভার ত্রুটি।' });
    }
});

// POST Login
router.post('/login', authLimiter, async (req, res) => {
    try {
        await connectDB();
        const rawIdentifier = (req.body.email || '').trim();
        const password = req.body.password;
        if (!rawIdentifier || !password) return res.render('login', { error: 'ইমেইল/ফোন এবং পাসওয়ার্ড প্রদান করুন।' });

        const { email, phone } = normalizeIdentifier(rawIdentifier);
        const query = email ? { email } : { phone };
        const user = await User.findOne(query);
        if (!user) return res.render('login', { error: 'ইমেইল/ফোন বা পাসওয়ার্ড ভুল।' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.render('login', { error: 'ইমেইল/ফোন বা পাসওয়ার্ড ভুল।' });

        // Super Admin auto-promotion & role normalization
        const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
        const userEmail = (user.email || '').toLowerCase().trim();
        if (superEmail && userEmail === superEmail) {
            if (user.role !== 'superadmin') {
                user.role = 'superadmin';
                await user.save();
            }
        } else if (superEmail && user.role === 'superadmin') {
            // Without the email no one else is superadmin!
            user.role = 'admin';
            await user.save();
        }

        delete req.session.tempQuiz;
        req.session.user = user.toObject();
        req.session.userId = user._id.toString();
        req.session.isFirstLogin = true;

        req.session.save((err) => {
            if (err) return res.render('login', { error: `Session Error: ${err.message}` });
            // Force password change if admin reset it
            if (user.passwordResetRequired) return res.redirect('/change-password');
            
            if (superEmail && userEmail === superEmail) return res.redirect('/superadmin');
            if (user.role === 'admin' || user.role === 'superadmin') return res.redirect('/admin');
            if (user.role === 'content_manager' || user.role === 'support' || user.role === 'moderator') return res.redirect('/admin');
            if (user.role === 'teacher') return res.redirect('/teacher');
            if (user.role === 'parent') return res.redirect('/parent/dashboard');
            res.redirect('/dashboard');
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.render('login', { error: `লগইন ব্যর্থ হয়েছে: ${err.message}` });
    }
});

// POST Register
router.post('/register', authLimiter, async (req, res) => {
    try {
        await connectDB();
        const { name, identifier, password, confirmPassword, role, classLevel } = req.body;
        if (!name || !identifier || !password || !confirmPassword) {
            return res.status(400).json({ error: 'দয়া করে সবগুলো প্রয়োজনীয় তথ্য প্রদান করুন।' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'পাসওয়ার্ড দুটি মিলছে না।' });
        }

        const { email, phone } = normalizeIdentifier(identifier);

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ error: 'দয়া করে একটি সঠিক ইমেইল এড্রেস দিন।' });
            }
        } else if (phone) {
            if (!/^01[3-9]\d{8}$/.test(phone)) {
                return res.status(400).json({ error: 'দয়া করে একটি সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।' });
            }
        } else {
            return res.status(400).json({ error: 'দয়া করে একটি সঠিক ইমেইল অথবা মোবাইল নম্বর দিন।' });
        }

        // Check if user already exists
        const existingQuery = email ? { email } : { phone };
        const existingUser = await User.findOne(existingQuery).lean();
        if (existingUser) {
            return res.status(400).json({
                error: email
                    ? 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হয়েছে। দয়া করে লগইন করুন।'
                    : 'এই ফোন নম্বরটি ইতিমধ্যে ব্যবহৃত হয়েছে। দয়া করে লগইন করুন।'
            });
        }

        // Determine Role
        let assignedRole = role === 'parent' ? 'parent' : 'student';
        const superEmailReg = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
        if (superEmailReg && email && email.toLowerCase().trim() === superEmailReg) {
            assignedRole = 'superadmin';
        }

        const userPayload = {
            name: name.trim(),
            password,
            role: assignedRole
        };
        if (assignedRole !== 'parent' && classLevel) {
            userPayload.classLevel = classLevel.trim();
        }
        if (email) {
            userPayload.email = email;
        }
        if (phone) {
            userPayload.phone = phone;
        }

        const newUser = new User(userPayload);
        await newUser.save();

        let redirectUrl = '/dashboard';
        if (newUser.role === 'parent') redirectUrl = '/parent/dashboard';
        else if (newUser.role === 'teacher') redirectUrl = '/teacher';
        else if (newUser.role === 'superadmin') redirectUrl = '/superadmin';
        else if (newUser.role === 'admin' || newUser.role === 'content_manager' || newUser.role === 'support' || newUser.role === 'moderator') redirectUrl = '/admin';

        delete req.session.tempQuiz;
        req.session.userId = newUser._id.toString();
        req.session.user = {
            _id: newUser._id.toString(),
            name: newUser.name,
            role: newUser.role,
            classLevel: newUser.classLevel || ''
        };
        req.session.isFirstLogin = true;

        if (email) {
            sendWelcomeEmail(email, newUser.name).catch(e => console.error('Failed to send welcome email:', e));
        }

        req.session.save((saveErr) => {
            if (saveErr) console.warn('⚠️ Session save warning on register:', saveErr.message);
            return res.json({ success: true, redirect: redirectUrl });
        });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) {
            const isPhone = (err.keyPattern && err.keyPattern.phone) || (err.message && err.message.includes('phone'));
            return res.status(400).json({
                error: isPhone ? 'এই ফোন নম্বরটি ইতিমধ্যে ব্যবহৃত হয়েছে।' : 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হয়েছে।'
            });
        }
        res.status(500).json({ error: `সার্ভার ত্রুটি: ${err.message}` });
    }
});

module.exports = router;
