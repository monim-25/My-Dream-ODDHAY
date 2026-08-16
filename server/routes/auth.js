const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { connectDB, protect, User } = require('../config');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: 'অনেকবার চেষ্টা করেছেন, দয়া করে ৫ মিনিট পর আবার চেষ্টা করুন।'
});

const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'অনেকবার চেষ্টা করেছেন, দয়া করে ১৫ মিনিট পর আবার চেষ্টা করুন।'
});

// GET Login/Register pages
router.get('/login', (req, res) => res.render('login'));
router.get('/register', (req, res) => res.render('register'));
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
        const identifier = (req.body.email || '').trim();
        const password = req.body.password;
        if (!identifier || !password) return res.status(400).send('ইমেইল/ফোন এবং পাসওয়ার্ড প্রদান করুন।');

        const user = await User.findOne(identifier.includes('@') ? { email: identifier } : { phone: identifier });
        if (!user) return res.status(401).send('ইমেইল/ফোন বা পাসওয়ার্ড ভুল।');

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).send('ইমেইল/ফোন বা পাসওয়ার্ড ভুল।');

        // Super Admin auto-promotion
        const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
        const userEmail = (user.email || '').toLowerCase().trim();
        if (superEmail && userEmail === superEmail && user.role !== 'superadmin') {
            user.role = 'superadmin';
            await user.save();
        }

        req.session.user = user.toObject();
        req.session.userId = user._id.toString();
        req.session.isFirstLogin = true;

        req.session.save((err) => {
            if (err) return res.status(500).send(`Session Error: ${err.message}`);
            // Force password change if admin reset it
            if (user.passwordResetRequired) return res.redirect('/change-password');
            
            if (user.role === 'superadmin') return res.redirect('/superadmin');
            if (user.role === 'admin') return res.redirect('/admin');
            if (user.role === 'content_manager' || user.role === 'support' || user.role === 'moderator') return res.redirect('/admin');
            if (user.role === 'teacher') return res.redirect('/teacher');
            if (user.role === 'parent') return res.redirect('/parent/dashboard');
            res.redirect('/dashboard');
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).send(`Login Failed: ${err.message}`);
    }
});

// POST Register
router.post('/register', authLimiter, async (req, res) => {
    try {
        await connectDB();
        const { name, identifier, password, confirmPassword, role, classLevel } = req.body;
        if (!name || !identifier || !password || !confirmPassword)
            return res.status(400).json({ error: 'দয়া করে সবগুলো তথ্য প্রদান করুন।' });
        if (password !== confirmPassword)
            return res.status(400).json({ error: 'পাসওয়ার্ড দুটি মিলছে না।' });

        const cleanId = identifier.trim();
        const email = cleanId.includes('@') ? cleanId.toLowerCase() : null;
        const phone = cleanId.includes('@') ? null : cleanId;

        // Super admin auto-promotion on register
        let assignedRole = role || 'student';
        const superEmailReg = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
        if (superEmailReg && email && email.toLowerCase().trim() === superEmailReg) {
            assignedRole = 'superadmin';
        }

        const newUser = new User({ name: name.trim(), password, role: assignedRole, classLevel: classLevel || 'Class 10', email: email || undefined, phone: phone || undefined });
        await newUser.save();

        let redirectUrl = '/dashboard';
        if (newUser.role === 'parent') redirectUrl = '/parent/dashboard';
        else if (newUser.role === 'teacher') redirectUrl = '/teacher';
        else if (newUser.role === 'superadmin') redirectUrl = '/superadmin';
        else if (newUser.role === 'admin' || newUser.role === 'content_manager' || newUser.role === 'support' || newUser.role === 'moderator') redirectUrl = '/admin';

        req.session.userId = newUser._id.toString();
        req.session.user = { _id: newUser._id.toString(), name: newUser.name, role: newUser.role, classLevel: newUser.classLevel };

        if (email) {
            sendWelcomeEmail(email, newUser.name).catch(e => console.error('Failed to send welcome email:', e));
        }

        req.session.save(() => res.json({ success: true, redirect: redirectUrl }));
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0];
            return res.status(400).json({ error: field === 'phone' ? 'এই ফোন নম্বরটি ইতিমধ্যে ব্যবহৃত হয়েছে।' : 'এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হয়েছে।' });
        }
        res.status(500).json({ error: `সার্ভার ত্রুটি: ${err.message}` });
    }
});

module.exports = router;
