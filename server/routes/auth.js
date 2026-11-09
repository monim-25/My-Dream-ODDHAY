const { normalizeClass, normalizeGroup, isClassWithGroups } = require('../utils/academicHelper');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { connectDB, protect, User } = require('../config');
const { sendLoginOtpEmail, sendRegistrationOtpEmail, sendPasswordResetOtpEmail, sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');

// Helper to retrieve device ID from cookies
function getDeviceId(req) {
    if (req.cookies && req.cookies.oddhay_device_id) {
        return req.cookies.oddhay_device_id;
    }
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)oddhay_device_id=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}
const { sendSmsOtp } = require('../services/smsService');

const rateLimit = require('express-rate-limit');

// Hardcoded fallback — same as config.js SUPER_ADMIN_EMAIL_DEFAULT
const SUPER_ADMIN_EMAIL_DEFAULT = 'monimmdmonim41@gmail.com';
const getSuperAdminEmail = () => (process.env.SUPER_ADMIN_EMAIL || SUPER_ADMIN_EMAIL_DEFAULT).toLowerCase().trim();

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

    // Clean phone number: remove spaces, hyphens, plus, parentheses, dots
    let phone = clean.replace(/[\s\-\+\(\)\.]/g, '');
    if (phone.startsWith('00880')) {
        phone = '0' + phone.substring(5);
    } else if (phone.startsWith('8800')) {
        phone = phone.substring(3);
    } else if (phone.startsWith('880')) {
        phone = '0' + phone.substring(3);
    } else if (/^1[3-9]\d{8}$/.test(phone)) {
        phone = '0' + phone;
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
        const classes = await AcademicClass.find({ isArchived: { $ne: true } }).sort({ order: 1 }).lean();
        return (classes && classes.length > 0) ? classes : defaultClasses;
    } catch (e) {
        return defaultClasses;
    }
}

// GET Login/Register pages
router.get('/login', async (req, res) => {
    if (req.session && req.session.userId && req.session.user) {
        const dest = (req.query.redirect && req.query.redirect.startsWith('/') && !req.query.redirect.startsWith('//'))
            ? req.query.redirect
            : '/dashboard';
        return res.redirect(dest);
    }
    const academicClasses = await getAcademicClasses();
    res.render('login', {
        academicClasses,
        activeTab: req.query.tab === 'register' ? 'register' : 'login',
        error: req.query.error || null,
        redirect: req.query.redirect || ''
    });
});
router.get('/register', async (req, res) => {
    if (req.session && req.session.userId && req.session.user) {
        const dest = (req.query.redirect && req.query.redirect.startsWith('/') && !req.query.redirect.startsWith('//'))
            ? req.query.redirect
            : '/dashboard';
        return res.redirect(dest);
    }
    const academicClasses = await getAcademicClasses();
    res.render('login', {
        academicClasses,
        activeTab: 'register',
        error: null,
        redirect: req.query.redirect || ''
    });
});

// Social OAuth Routes (Google & Facebook)
const getOAuthRedirectUri = (req, path) => {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    return `${proto}://${req.get('host')}${path}`;
};

router.get('/auth/google', (req, res) => {
    if (req.query.redirect) req.session.oauthRedirect = req.query.redirect;
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        const redirectUri = getOAuthRedirectUri(req, '/auth/google/callback');
        const scope = encodeURIComponent('profile email');
        const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
        return res.redirect(googleAuthUrl);
    }
    return res.redirect('/login?error=' + encodeURIComponent('Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID in .env to activate.'));
});

// Google OAuth Callback Handler
router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code, error } = req.query;
        if (error || !code) {
            return res.redirect('/login?error=' + encodeURIComponent(error ? `Google login cancelled: ${error}` : 'Authorization code missing.'));
        }

        const redirectUri = getOAuthRedirectUri(req, '/auth/google/callback');

        // 1. Exchange authorization code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: String(code),
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            }).toString()
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            console.error('Google Token Exchange Failed:', tokenData);
            return res.redirect('/login?error=' + encodeURIComponent('Failed to authenticate with Google.'));
        }

        // 2. Fetch User Profile from Google
        const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const googleProfile = await userinfoResponse.json();

        if (!googleProfile || !googleProfile.email) {
            return res.redirect('/login?error=' + encodeURIComponent('Could not retrieve email from your Google account.'));
        }

        await connectDB();
        const email = googleProfile.email.toLowerCase().trim();
        let user = await User.findOne({ email });

        if (!user) {
            // Register new user via Google
            const bcrypt = require('bcryptjs');
            const randomPassword = crypto.randomBytes(24).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            user = new User({
                name: googleProfile.name || 'Google User',
                email: email,
                password: hashedPassword,
                role: 'student',
                profilePicture: googleProfile.picture || '',
                isEmailVerified: true
            });
            await user.save();
        } else {
            // Existing user update
            if (!user.profilePicture && googleProfile.picture) {
                user.profilePicture = googleProfile.picture;
            }
            if (!user.isEmailVerified) {
                user.isEmailVerified = true;
            }
            await user.save();
        }


        // Trust device for OAuth login
        const oauthDeviceId = getDeviceId(req) || crypto.randomBytes(24).toString('hex');
        if (!Array.isArray(user.trustedDevices)) user.trustedDevices = [];
        if (!user.trustedDevices.some(d => d.deviceToken === oauthDeviceId)) {
            user.trustedDevices.push({
                deviceToken: oauthDeviceId,
                userAgent: req.headers['user-agent'] || '',
                verifiedAt: new Date()
            });
            await user.save();
        }
        res.cookie('oddhay_device_id', oauthDeviceId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        // Establish session
        req.session.userId = user._id.toString();
        req.session.user = user.toObject();
        req.session.isFirstLogin = false;

        const hasClass = Boolean(user.classLevel && user.classLevel.trim());
        const defaultDest = (!hasClass && user.role === 'student') ? '/onboarding' : '/dashboard';
        const targetRedirect = req.session.oauthRedirect || (
            user.role === 'superadmin' ? '/superadmin' :
            user.role === 'admin' ? '/admin' :
            user.role === 'teacher' ? '/teacher' :
            user.role === 'parent' ? '/parent/dashboard' : defaultDest
        );
        delete req.session.oauthRedirect;
        if (!hasClass && user.role === 'student') {
            return res.redirect('/onboarding');
        }
        return res.redirect(targetRedirect);
    } catch (err) {
        console.error('Google Auth Callback Error:', err);
        return res.redirect('/login?error=' + encodeURIComponent('An error occurred during Google authentication.'));
    }
});

router.get('/auth/facebook', (req, res) => {
    if (req.query.redirect) req.session.oauthRedirect = req.query.redirect;
    if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
        const redirectUri = getOAuthRedirectUri(req, '/auth/facebook/callback');
        const scope = encodeURIComponent('email,public_profile');
        const fbAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
        return res.redirect(fbAuthUrl);
    }
    return res.redirect('/login?error=' + encodeURIComponent('Facebook Sign-In is not configured yet. Add FACEBOOK_APP_ID in .env to activate.'));
});

// Facebook OAuth Callback Handler
router.get('/auth/facebook/callback', async (req, res) => {
    try {
        const { code, error, error_description } = req.query;
        if (error || !code) {
            return res.redirect('/login?error=' + encodeURIComponent(error_description || error || 'Facebook authorization cancelled.'));
        }

        const redirectUri = `${req.protocol}://${req.get('host')}/auth/facebook/callback`;

        // 1. Exchange authorization code for access token
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?` + new URLSearchParams({
            client_id: process.env.FACEBOOK_APP_ID,
            client_secret: process.env.FACEBOOK_APP_SECRET,
            redirect_uri: redirectUri,
            code: String(code)
        }).toString();

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
            console.error('Facebook Token Exchange Failed:', tokenData);
            return res.redirect('/login?error=' + encodeURIComponent('Failed to authenticate with Facebook.'));
        }

        // 2. Fetch User Profile from Facebook Graph API
        const userUrl = `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`;
        const userResponse = await fetch(userUrl);
        const fbProfile = await userResponse.json();

        if (!fbProfile || !fbProfile.id) {
            return res.redirect('/login?error=' + encodeURIComponent('Could not retrieve profile from Facebook.'));
        }

        await connectDB();
        const fbEmail = (fbProfile.email || `${fbProfile.id}@facebook.oddhay.com`).toLowerCase().trim();
        let user = await User.findOne({ email: fbEmail });

        const pictureUrl = (fbProfile.picture && fbProfile.picture.data && fbProfile.picture.data.url) ? fbProfile.picture.data.url : '';

        if (!user) {
            // Register new user via Facebook
            const bcrypt = require('bcryptjs');
            const randomPassword = crypto.randomBytes(24).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            user = new User({
                name: fbProfile.name || 'Facebook User',
                email: fbEmail,
                password: hashedPassword,
                role: 'student',
                profilePicture: pictureUrl,
                isEmailVerified: Boolean(fbProfile.email)
            });
            await user.save();
        } else {
            // Existing user update
            if (!user.profilePicture && pictureUrl) {
                user.profilePicture = pictureUrl;
            }
            if (fbProfile.email && !user.isEmailVerified) {
                user.isEmailVerified = true;
            }
            await user.save();
        }

        // Trust device for OAuth login
        const fbDeviceId = getDeviceId(req) || crypto.randomBytes(24).toString('hex');
        if (!Array.isArray(user.trustedDevices)) user.trustedDevices = [];
        if (!user.trustedDevices.some(d => d.deviceToken === fbDeviceId)) {
            user.trustedDevices.push({
                deviceToken: fbDeviceId,
                userAgent: req.headers['user-agent'] || '',
                verifiedAt: new Date()
            });
            await user.save();
        }
        res.cookie('oddhay_device_id', fbDeviceId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        // Establish session
        req.session.userId = user._id.toString();
        req.session.user = user.toObject();
        req.session.isFirstLogin = false;

        const hasClass = Boolean(user.classLevel && user.classLevel.trim());
        const defaultDest = (!hasClass && user.role === 'student') ? '/onboarding' : '/dashboard';
        const targetRedirect = req.session.oauthRedirect || (
            user.role === 'superadmin' ? '/superadmin' :
            user.role === 'admin' ? '/admin' :
            user.role === 'teacher' ? '/teacher' :
            user.role === 'parent' ? '/parent/dashboard' : defaultDest
        );
        delete req.session.oauthRedirect;
        if (!hasClass && user.role === 'student') {
            return res.redirect('/onboarding');
        }
        return res.redirect(targetRedirect);
    } catch (err) {
        console.error('Facebook Auth Callback Error:', err);
        return res.redirect('/login?error=' + encodeURIComponent('An error occurred during Facebook authentication.'));
    }
});

router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
router.get('/forgot-password', (req, res) => res.render('forgot-password', { message: null, error: null }));

// GET Onboarding page for students (Mandatory Class & Group setup)
router.get('/onboarding', protect, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.session.userId).lean();
        if (!user) return res.redirect('/login');

        if (user.role === 'superadmin') return res.redirect('/superadmin');
        if (user.role === 'admin') return res.redirect('/admin');
        if (user.role === 'teacher') return res.redirect('/teacher');
        if (user.role === 'parent') return res.redirect('/parent/dashboard');

        // If student already has classLevel configured, go to dashboard
        if (user.classLevel && user.classLevel.trim()) {
            return res.redirect('/dashboard');
        }

        const academicClasses = await getAcademicClasses();
        res.render('onboarding', {
            user,
            academicClasses,
            error: null
        });
    } catch (err) {
        console.error('Onboarding GET error:', err);
        res.redirect('/dashboard');
    }
});

// POST Onboarding - Send OTP for Phone Verification
router.post('/onboarding/send-phone-otp', protect, forgotLimiter, async (req, res) => {
    try {
        await connectDB();
        const { phone } = req.body;
        if (!phone || !phone.trim()) {
            return res.status(400).json({ success: false, error: 'Please enter your 11-digit mobile number.' });
        }

        const { phone: normalizedPhone } = normalizeIdentifier(phone.trim());
        if (!normalizedPhone || !/^01[3-9]\d{8}$/.test(normalizedPhone)) {
            return res.status(400).json({ success: false, error: 'Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).' });
        }

        const existingWithPhone = await User.findOne({ phone: normalizedPhone, _id: { $ne: req.session.userId } }).lean();
        if (existingWithPhone) {
            return res.status(400).json({ success: false, error: 'This phone number is already registered with another account.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.onboardingPhoneOtp = {
            phone: normalizedPhone,
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        await sendSmsOtp(normalizedPhone, otp, 'phone_verification');
        console.log(`[Onboarding Phone OTP] Dispatched code for ${normalizedPhone}: ${otp}`);

        const maskedTarget = normalizedPhone.length >= 10 
            ? normalizedPhone.slice(0, 3) + '****' + normalizedPhone.slice(-4) 
            : normalizedPhone;

        return res.json({
            success: true,
            message: 'A 6-digit OTP has been sent to your mobile number.',
            maskedTarget,
            phone: normalizedPhone
        });
    } catch (err) {
        console.error('Send Phone OTP Error:', err);
        return res.status(500).json({ success: false, error: `Failed to send OTP: ${err.message}` });
    }
});

// POST Onboarding - Verify Phone OTP
router.post('/onboarding/verify-phone-otp', protect, async (req, res) => {
    try {
        await connectDB();
        const { otp } = req.body;
        const otpSession = req.session.onboardingPhoneOtp;

        if (!otpSession || !otpSession.phone || !otpSession.otp) {
            return res.status(400).json({ success: false, error: 'Verification session expired. Please resend OTP.' });
        }

        if (otpSession.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new code.' });
        }

        if (String(otp || '').trim() !== String(otpSession.otp).trim()) {
            return res.status(400).json({ success: false, error: 'Invalid OTP code. Please enter the correct code.' });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User session not found.' });
        }

        user.phone = otpSession.phone;
        user.isPhoneVerified = true;
        user.isProfileSetupComplete = true;
        user.lastActive = new Date();
        await user.save();

        delete req.session.onboardingPhoneOtp;
        req.session.user = user.toObject();

        const targetUrl = req.session.postOnboardingRedirect || '/dashboard';
        delete req.session.postOnboardingRedirect;

        req.session.save(() => {
            return res.json({ success: true, redirect: targetUrl });
        });
    } catch (err) {
        console.error('Verify Phone OTP Error:', err);
        return res.status(500).json({ success: false, error: `Verification failed: ${err.message}` });
    }
});

// POST Onboarding - Resend Phone OTP
router.post('/onboarding/resend-phone-otp', protect, forgotLimiter, async (req, res) => {
    try {
        const otpSession = req.session.onboardingPhoneOtp;
        if (!otpSession || !otpSession.phone) {
            return res.status(400).json({ success: false, error: 'Session expired. Please enter your mobile number again.' });
        }

        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        otpSession.otp = newOtp;
        otpSession.expiresAt = Date.now() + 10 * 60 * 1000;
        req.session.onboardingPhoneOtp = otpSession;

        await sendSmsOtp(otpSession.phone, newOtp, 'phone_verification');
        console.log(`[Onboarding Phone Resent OTP] Sent for ${otpSession.phone}: ${newOtp}`);

        return res.json({ success: true, message: 'A new OTP has been sent to your mobile number.' });
    } catch (err) {
        console.error('Resend Phone OTP Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST Onboarding - Save student class, group, subjects, phone
router.post('/onboarding', protect, async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('application/json');
    try {
        await connectDB();
        const user = await User.findById(req.session.userId);
        if (!user) {
            const err = 'User session not found. Please sign in.';
            return isJson ? res.status(404).json({ success: false, error: err }) : res.redirect('/login');
        }

        const { classLevel, group, subjects, phone } = req.body;

        if (!classLevel || !classLevel.trim()) {
            const err = 'Please select your Class / Academic Level.';
            if (isJson) return res.status(400).json({ success: false, error: err });
            const academicClasses = await getAcademicClasses();
            return res.render('onboarding', { user, academicClasses, error: err });
        }

        user.classLevel = classLevel.trim();

        let finalGroup = (group || '').trim();
        let finalSubjects = Array.isArray(subjects) ? subjects.map(s => String(s).trim()).filter(Boolean) : (subjects ? [String(subjects).trim()] : []);

        try {
            const AcademicClass = require('../models/AcademicClass');
            const classDoc = await AcademicClass.findOne({ name: user.classLevel }).lean();
            if (classDoc) {
                let compSubs = [];
                if (classDoc.hasGroups && Array.isArray(classDoc.commonSubjects)) {
                    compSubs = classDoc.commonSubjects;
                } else if (!classDoc.hasGroups && Array.isArray(classDoc.subjects)) {
                    compSubs = classDoc.subjects;
                }
                finalSubjects = Array.from(new Set([...compSubs, ...finalSubjects]));
                if (!classDoc.hasGroups) {
                    finalGroup = 'General';
                }
            }
        } catch (cErr) {
            console.warn('AcademicClass lookup warning during onboarding:', cErr.message);
        }

        user.group = finalGroup || 'General';
        user.subjects = finalSubjects;

        if (phone && phone.trim()) {
            const { phone: normalizedPhone } = normalizeIdentifier(phone.trim());
            if (normalizedPhone) {
                const existingWithPhone = await User.findOne({ phone: normalizedPhone, _id: { $ne: user._id } }).lean();
                if (existingWithPhone) {
                    const err = 'This phone number is already registered with another account.';
                    if (isJson) return res.status(400).json({ success: false, error: err });
                    const academicClasses = await getAcademicClasses();
                    return res.render('onboarding', { user, academicClasses, error: err });
                }
                user.phone = normalizedPhone;
            }
        }

        user.isProfileSetupComplete = true;
        user.lastActive = new Date();
        await user.save();

        req.session.user = user.toObject();

        const targetUrl = req.session.postOnboardingRedirect || '/dashboard';
        delete req.session.postOnboardingRedirect;

        req.session.save(() => {
            if (isJson) return res.json({ success: true, redirect: targetUrl });
            return res.redirect(targetUrl);
        });
    } catch (err) {
        console.error('Onboarding POST error:', err);
        const errText = `Failed to save profile: ${err.message}`;
        if (isJson) return res.status(500).json({ success: false, error: errText });
        const academicClasses = await getAcademicClasses();
        return res.render('onboarding', { user: req.session.user || {}, academicClasses, error: errText });
    }
});

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
        if (!user) return res.render('forgot-password', { message: null, error: 'The reset link is invalid or has expired. Please request a new one.' });
        res.render('reset-password', { token: req.params.token, error: null });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// POST Forgot password - send OTP via email or phone
router.post('/forgot-password', forgotLimiter, async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('application/json');
    try {
        await connectDB();
        const raw = (req.body.identifier || req.body.email || req.body.phone || '').trim();
        if (!raw) {
            const err = 'Please enter your email address or phone number.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        const { email, phone } = normalizeIdentifier(raw);
        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (phone) {
            user = await User.findOne({ phone });
        }

        // Return error if user account does not exist
        if (!user) {
            const err = email
                ? 'No account found with this email address. Please check or create an account.'
                : 'No account found with this phone number. Please check or create an account.';
            return isJson ? res.status(404).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        // Generate secure 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const successMsg = 'A 6-digit verification code has been sent.';

        // Mask target for display
        let maskedTarget = raw;
        if (email) {
            const [uname, domain] = email.split('@');
            maskedTarget = (uname.length > 2 ? uname.slice(0, 2) + '***' : uname + '***') + '@' + domain;
        } else if (phone) {
            maskedTarget = phone.length >= 10 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
        }

        user.passwordResetOtp = otp;
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        const token = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = token;
        await user.save();

        let sendResult = null;
        if (user.email) {
            try {
                sendResult = await sendPasswordResetOtpEmail(user.email, user.name, otp);
            } catch (mErr) {
                console.error('[Forgot Password] Email send error:', mErr.message);
            }
        } else if (user.phone) {
            try {
                sendResult = await sendSmsOtp(user.phone, otp, 'password_reset');
            } catch (sErr) {
                console.error('[Forgot Password] SMS send error:', sErr.message);
            }
        }

        console.log(`[Forgot Password OTP] Verification code for ${user.email || user.phone}: ${otp}`);

        if (isJson) {
            return res.json({
                success: true,
                message: successMsg,
                maskedTarget,
                identifier: raw,
                simulated: sendResult?.simulated || false
            });
        }

        res.render('forgot-password', { message: successMsg, error: null, step: 2, identifier: raw, maskedTarget });
    } catch (err) {
        const errText = `Server error: ${err.message}`;
        if (isJson) return res.status(500).json({ success: false, error: errText });
        res.render('forgot-password', { message: null, error: errText });
    }
});

// POST Verify OTP code only (Step 2 - Proves OTP before setting new password)
router.post('/forgot-password/verify-code', async (req, res) => {
    try {
        await connectDB();
        const { identifier, otp } = req.body;

        if (!identifier) {
            return res.status(400).json({ success: false, error: 'Identifier is missing. Please restart the process.' });
        }

        const cleanOtp = String(otp || '').trim();
        if (!cleanOtp || cleanOtp.length !== 6) {
            return res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (phone) {
            user = await User.findOne({ phone });
        }

        if (!user || !user.passwordResetOtp || user.passwordResetOtp !== cleanOtp || !user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
            return res.status(400).json({ success: false, error: 'Invalid or expired verification code. Please check and try again.' });
        }

        // Generate verified reset session token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = resetToken;
        await user.save();

        return res.json({
            success: true,
            message: 'Verification code confirmed.',
            resetToken: resetToken
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

// POST Set New Password (Step 3 - Allowed only after proving OTP)
router.post('/forgot-password/reset-password', async (req, res) => {
    try {
        await connectDB();
        const { identifier, resetToken, password, confirmPassword } = req.body;

        if (!identifier || !resetToken) {
            return res.status(400).json({ success: false, error: 'Session expired. Please verify your OTP code again.' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Passwords do not match.' });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (phone) {
            user = await User.findOne({ phone });
        }

        if (!user || !user.passwordResetToken || user.passwordResetToken !== resetToken || !user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
            return res.status(400).json({ success: false, error: 'Password reset session has expired. Please verify your OTP again.' });
        }

        user.password = password;
        user.passwordResetOtp = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.passwordResetRequired = false;
        await user.save();

        return res.json({
            success: true,
            message: 'Password has been reset successfully.',
            redirect: '/login'
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

// POST Verify OTP and reset password (legacy combined handler fallback)
router.post('/forgot-password/verify-otp', async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('application/json');
    try {
        await connectDB();
        const { identifier, otp, password, confirmPassword } = req.body;

        if (!identifier) {
            const err = 'Account identifier missing. Please restart the reset process.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        if (!otp || String(otp).trim().length !== 6) {
            const err = 'Please enter the 6-digit OTP code.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        if (!password || password.length < 6) {
            const err = 'Password must be at least 6 characters.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        if (password !== confirmPassword) {
            const err = 'Passwords do not match.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        let user = null;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (phone) {
            user = await User.findOne({ phone });
        }

        if (!user || !user.passwordResetOtp || user.passwordResetOtp !== String(otp).trim() || !user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
            const err = 'Invalid or expired OTP code. Please request a new one.';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('forgot-password', { message: null, error: err });
        }

        user.password = password;
        user.passwordResetOtp = undefined;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.passwordResetRequired = false;
        await user.save();

        if (isJson) {
            return res.json({
                success: true,
                message: 'Password reset successfully. Redirecting to login...',
                redirect: '/login'
            });
        }

        res.redirect('/login');
    } catch (err) {
        const errText = `Server error: ${err.message}`;
        if (isJson) return res.status(500).json({ success: false, error: errText });
        res.render('forgot-password', { message: null, error: errText });
    }
});

// POST Reset password
router.post('/reset-password/:token', async (req, res) => {
    try {
        await connectDB();
        const { password, confirmPassword } = req.body;
        if (!password || password.length < 6)
            return res.render('reset-password', { token: req.params.token, error: 'Password must be at least 6 characters.' });
        if (password !== confirmPassword)
            return res.render('reset-password', { token: req.params.token, error: 'Passwords do not match.' });

        const user = await User.findOne({ passwordResetToken: req.params.token, passwordResetExpires: { $gt: Date.now() } });
        if (!user) return res.render('forgot-password', { message: null, error: 'The reset link has expired. Please request a new one.' });

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        res.redirect('/login');
    } catch (err) {
        res.render('reset-password', { token: req.params.token, error: 'Server error. Please try again.' });
    }
});

// POST Login
router.post('/login', authLimiter, async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('application/json');
    try {
        await connectDB();
        const academicClasses = await getAcademicClasses();
        const redirectParam = (req.body.redirect && req.body.redirect.startsWith('/') && !req.body.redirect.startsWith('//')) ? req.body.redirect : '';
        const rawIdentifier = (req.body.email || req.body.identifier || '').trim();
        const password = req.body.password;
        if (!rawIdentifier || !password) {
            const err = 'ইমেইল/ফোন এবং পাসওয়ার্ড প্রদান করুন।';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('login', { academicClasses, activeTab: 'login', redirect: redirectParam, error: err });
        }

        const { email, phone } = normalizeIdentifier(rawIdentifier);
        const query = email ? { email } : { phone };
        const user = await User.findOne(query);
        if (!user) {
            const err = 'ইমেইল/ফোন বা পাসওয়ার্ড ভুল।';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('login', { academicClasses, activeTab: 'login', redirect: redirectParam, error: err });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            const err = 'ইমেইল/ফোন বা পাসওয়ার্ড ভুল।';
            return isJson ? res.status(400).json({ success: false, error: err }) : res.render('login', { academicClasses, activeTab: 'login', redirect: redirectParam, error: err });
        }

        // Check if current device is already recognized & trusted
        const existingDeviceId = getDeviceId(req);
        const isDeviceTrusted = Boolean(
            existingDeviceId &&
            Array.isArray(user.trustedDevices) &&
            user.trustedDevices.some(d => d.deviceToken === existingDeviceId)
        );

        // If device is NOT recognized (new device / first time on this device): Require OTP!
        if (!isDeviceTrusted) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const deviceIdToTrust = existingDeviceId || crypto.randomBytes(24).toString('hex');

            req.session.login2fa = {
                userId: user._id.toString(),
                otp,
                deviceId: deviceIdToTrust,
                expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
                redirect: redirectParam,
                remember: Boolean(req.body.remember)
            };

            // Mask destination for user display
            let maskedTarget = '';
            if (user.phone) {
                const p = user.phone;
                maskedTarget = p.length >= 10 ? p.slice(0, 3) + '****' + p.slice(-4) : p;
                try {
                    await sendSmsOtp(user.phone, otp, 'login');
                } catch (sErr) {
                    console.error('[Login 2FA SMS Error]:', sErr.message);
                }
            } else if (user.email) {
                const [uname, domain] = user.email.split('@');
                maskedTarget = (uname.length > 2 ? uname.slice(0, 2) + '***' : uname + '***') + '@' + domain;
                try {
                    await sendLoginOtpEmail(user.email, user.name, otp);
                } catch (mErr) {
                    console.error('[Login 2FA Email Error]:', mErr.message);
                }
            }

            console.log(`[Login 2FA OTP] Dispatched code for ${user.phone || user.email}: ${otp}`);

            if (isJson) {
                return res.json({
                    success: true,
                    requires2fa: true,
                    maskedTarget,
                    channel: user.phone ? 'phone' : 'email'
                });
            }

            return res.render('login', {
                academicClasses,
                activeTab: 'login',
                redirect: redirectParam,
                requires2fa: true,
                maskedTarget,
                error: null
            });
        }

        // Device is already trusted! Proceed with standard sign-in
        res.cookie('oddhay_device_id', existingDeviceId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        // Super Admin auto-promotion & role normalization
        const superEmail = getSuperAdminEmail();
        const userEmail = (user.email || '').toLowerCase().trim();
        if (userEmail === superEmail) {
            if (user.role !== 'superadmin') {
                user.role = 'superadmin';
                await user.save();
            }
        } else if (user.role === 'superadmin') {
            user.role = 'admin';
            await user.save();
        }

        user.loginCount = (user.loginCount || 0) + 1;
        user.lastActive = new Date();
        await user.save();

        delete req.session.tempQuiz;
        req.session.user = user.toObject();
        req.session.userId = user._id.toString();
        req.session.isFirstLogin = false;

        let redirectUrl = '/dashboard';
        if (user.passwordResetRequired) redirectUrl = '/change-password';
        else if (userEmail === superEmail || user.role === 'superadmin') redirectUrl = '/superadmin';
        else if (user.role === 'admin' || user.role === 'content_manager' || user.role === 'support' || user.role === 'moderator') {
            if (user.role === 'admin') {
                const hasAdminProfile = Boolean(user.isProfileSetupComplete || (user.schoolName && user.collegeName && user.universityName && user.presentAddress && user.permanentAddress));
                redirectUrl = hasAdminProfile ? '/admin' : '/admin/onboarding-profile';
            } else {
                redirectUrl = '/admin';
            }
        } else if (user.role === 'teacher') {
            const needsPass = user.passwordResetRequired || user.isPasswordSet === false;
            if (needsPass) redirectUrl = '/teacher/setup-password';
            else {
                const hasAcademics = Boolean(user.isProfileSetupComplete || (user.schoolName && user.universityName && user.presentAddress));
                redirectUrl = hasAcademics ? '/teacher' : '/teacher/onboarding-profile';
            }
        } else if (user.role === 'parent') redirectUrl = '/parent/dashboard';
        else if (redirectParam) redirectUrl = redirectParam;

        req.session.save((err) => {
            if (err) {
                return isJson ? res.status(500).json({ success: false, error: `Session Error: ${err.message}` }) : res.render('login', { error: `Session Error: ${err.message}` });
            }
            if (isJson) {
                return res.json({ success: true, requires2fa: false, redirect: redirectUrl });
            }
            return res.redirect(redirectUrl);
        });
    } catch (err) {
        console.error('Login Error:', err);
        if (isJson) return res.status(500).json({ success: false, error: `লগইন ব্যর্থ হয়েছে: ${err.message}` });
        res.render('login', { error: `লগইন ব্যর্থ হয়েছে: ${err.message}` });
    }
});

// POST Verify Login OTP (New Device Authorization)
router.post('/login/verify-otp', async (req, res) => {
    try {
        await connectDB();
        const { otp } = req.body;
        const login2fa = req.session.login2fa;

        if (!login2fa || !login2fa.userId || !login2fa.otp) {
            return res.status(400).json({
                success: false,
                error: 'লগইন ভেরিফিকেশন সেশনের মেয়াদ শেষ হয়েছে। পুনরায় লগইন করার চেষ্টা করুন।'
            });
        }

        if (login2fa.expiresAt < Date.now()) {
            return res.status(400).json({
                success: false,
                error: 'ওটিপির মেয়াদ শেষ হয়েছে (Expired)। দয়া করে নতুন কোড পাঠান।'
            });
        }

        const inputOtp = String(otp || '').trim();
        if (inputOtp !== String(login2fa.otp).trim()) {
            return res.status(400).json({
                success: false,
                error: 'ভুল ওটিপি কোড। পুনরায় সঠিক কোডটি দিন।'
            });
        }

        const user = await User.findById(login2fa.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'ইউজার অ্যাকাউন্ট পাওয়া যায়নি।' });
        }

        // Trust this device
        const deviceId = login2fa.deviceId || crypto.randomBytes(24).toString('hex');
        if (!Array.isArray(user.trustedDevices)) {
            user.trustedDevices = [];
        }

        const devIdx = user.trustedDevices.findIndex(d => d.deviceToken === deviceId);
        if (devIdx >= 0) {
            user.trustedDevices[devIdx].verifiedAt = new Date();
            user.trustedDevices[devIdx].userAgent = req.headers['user-agent'] || '';
        } else {
            user.trustedDevices.push({
                deviceToken: deviceId,
                userAgent: req.headers['user-agent'] || '',
                verifiedAt: new Date()
            });
        }

        // Set persistent 1-year device cookie
        res.cookie('oddhay_device_id', deviceId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        // Super Admin auto-promotion & role normalization
        const superEmail = getSuperAdminEmail();
        const userEmail = (user.email || '').toLowerCase().trim();
        if (userEmail === superEmail) {
            if (user.role !== 'superadmin') {
                user.role = 'superadmin';
            }
        } else if (user.role === 'superadmin') {
            user.role = 'admin';
        }

        user.loginCount = (user.loginCount || 0) + 1;
        user.lastActive = new Date();
        await user.save();

        const redirectParam = login2fa.redirect || '';
        delete req.session.login2fa;
        delete req.session.tempQuiz;

        req.session.user = user.toObject();
        req.session.userId = user._id.toString();
        req.session.isFirstLogin = false;

        let redirectUrl = '/dashboard';
        if (user.passwordResetRequired) redirectUrl = '/change-password';
        else if (userEmail === superEmail || user.role === 'superadmin') redirectUrl = '/superadmin';
        else if (user.role === 'admin' || user.role === 'content_manager' || user.role === 'support' || user.role === 'moderator') {
            if (user.role === 'admin') {
                const hasAdminProfile = Boolean(user.isProfileSetupComplete || (user.schoolName && user.collegeName && user.universityName && user.presentAddress && user.permanentAddress));
                redirectUrl = hasAdminProfile ? '/admin' : '/admin/onboarding-profile';
            } else {
                redirectUrl = '/admin';
            }
        } else if (user.role === 'teacher') {
            const needsPass = user.passwordResetRequired || user.isPasswordSet === false;
            if (needsPass) redirectUrl = '/teacher/setup-password';
            else {
                const hasAcademics = Boolean(user.isProfileSetupComplete || (user.schoolName && user.universityName && user.presentAddress));
                redirectUrl = hasAcademics ? '/teacher' : '/teacher/onboarding-profile';
            }
        } else if (user.role === 'parent') redirectUrl = '/parent/dashboard';
        else if (redirectParam) redirectUrl = redirectParam;

        req.session.save((err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            return res.json({ success: true, redirect: redirectUrl });
        });
    } catch (err) {
        console.error('[Verify Login OTP Error]:', err);
        return res.status(500).json({ success: false, error: `সার্ভার ত্রুটি: ${err.message}` });
    }
});

// POST Resend Login OTP
router.post('/login/resend-otp', forgotLimiter, async (req, res) => {
    try {
        await connectDB();
        const login2fa = req.session.login2fa;
        if (!login2fa || !login2fa.userId) {
            return res.status(400).json({ success: false, error: 'লগইন সেশন পাওয়া যায়নি। অনুগ্রহ করে পুনরায় লগইন করুন।' });
        }

        const user = await User.findById(login2fa.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'ইউজার পাওয়া যায়নি।' });
        }

        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        login2fa.otp = newOtp;
        login2fa.expiresAt = Date.now() + 10 * 60 * 1000;
        req.session.login2fa = login2fa;

        if (user.phone) {
            await sendSmsOtp(user.phone, newOtp, 'login');
        } else if (user.email) {
            await sendLoginOtpEmail(user.email, user.name, newOtp);
        }

        console.log(`[Resent Login OTP] Sent code for ${user.phone || user.email}: ${newOtp}`);
        return res.json({ success: true, message: 'নতুন ভেরিফিকেশন কোড পাঠানো হয়েছে।' });
    } catch (err) {
        console.error('[Resend Login OTP Error]:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST Register - Send OTP (Step 3 -> Step 4)
router.post('/register/send-otp', forgotLimiter, async (req, res) => {
    try {
        await connectDB();
        const { name, identifier } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Please enter your full name.' });
        }
        if (!identifier || !identifier.trim()) {
            return res.status(400).json({ success: false, error: 'Please enter an email or phone number.' });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        if (!email && !phone) {
            return res.status(400).json({ success: false, error: 'Please provide a valid email or 11-digit phone number.' });
        }

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
            }
        } else if (phone) {
            if (!/^01[3-9]\d{8}$/.test(phone)) {
                return res.status(400).json({ success: false, error: 'Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).' });
            }
        }

        // Check if user already exists
        const existingQuery = email ? { email: email.toLowerCase() } : { phone };
        const existingUser = await User.findOne(existingQuery).lean();
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: email
                    ? 'An account already exists with this email address. Please sign in.'
                    : 'An account already exists with this phone number. Please sign in.'
            });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP in session with 10-minute validity
        req.session.regOtp = {
            code: otp,
            identifier: email || phone,
            rawIdentifier: identifier.trim(),
            name: name.trim(),
            expiresAt: Date.now() + 10 * 60 * 1000,
            verified: false
        };

        // Mask target for UI display
        let maskedTarget = identifier.trim();
        if (email) {
            const [u, d] = email.split('@');
            maskedTarget = (u.length > 2 ? u.slice(0, 2) + '***' : u + '***') + '@' + d;
        } else if (phone) {
            maskedTarget = phone.length >= 10 ? phone.slice(0, 3) + '****' + phone.slice(-4) : phone;
        }

        // Send OTP
        let sendResult = null;
        if (email) {
            try {
                sendResult = await sendRegistrationOtpEmail(email, name.trim(), otp);
            } catch (mErr) {
                console.error('[Registration Email OTP Error]:', mErr.message);
            }
        } else if (phone) {
            try {
                sendResult = await sendSmsOtp(phone, otp, 'registration');
            } catch (sErr) {
                console.error('[Registration SMS OTP Error]:', sErr.message);
            }
        }

        console.log(`[Registration OTP] Generated code for ${email || phone}: ${otp}`);

        await new Promise((resolve) => req.session.save(resolve));

        return res.json({
            success: true,
            message: 'Verification code sent successfully.',
            maskedTarget,
            simulated: sendResult?.simulated || false
        });
    } catch (err) {
        console.error('Registration send-otp error:', err);
        return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

// POST Register - Verify OTP (Step 4 -> Step 5)
router.post('/register/verify-otp', async (req, res) => {
    try {
        const { identifier, otp } = req.body;
        if (!identifier) {
            return res.status(400).json({ success: false, error: 'Identifier is missing. Please restart registration.' });
        }

        const cleanOtp = String(otp || '').trim();
        if (!cleanOtp || cleanOtp.length !== 6) {
            return res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        const normalized = email || phone;

        const regData = req.session.regOtp;
        if (!regData || regData.identifier !== normalized) {
            return res.status(400).json({ success: false, error: 'Verification session expired. Please request a new code.' });
        }

        if (Date.now() > regData.expiresAt) {
            delete req.session.regOtp;
            return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
        }

        if (regData.code !== cleanOtp) {
            return res.status(400).json({ success: false, error: 'Invalid verification code. Please check and try again.' });
        }

        // Mark verified in session
        req.session.regOtp.verified = true;
        await new Promise((resolve) => req.session.save(resolve));

        return res.json({
            success: true,
            message: 'Verification code confirmed successfully.'
        });
    } catch (err) {
        console.error('Registration verify-otp error:', err);
        return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

// POST Register - Final Submission (Step 5)
router.post('/register', authLimiter, async (req, res) => {
    try {
        await connectDB();
        const { name, identifier, password, confirmPassword, classLevel, group, subjects } = req.body;

        if (!name || !identifier || !password || !confirmPassword) {
            return res.status(400).json({ success: false, error: 'Please fill in all required fields.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Passwords do not match.' });
        }

        const { email, phone } = normalizeIdentifier(identifier);
        const normalized = email || phone;

        // Verify OTP session proof
        const regData = req.session.regOtp;
        if (!regData || !regData.verified || regData.identifier !== normalized) {
            return res.status(400).json({ success: false, error: 'Please verify your verification code before setting password.' });
        }

        // Check if user already exists
        const existingQuery = email ? { email: email.toLowerCase() } : { phone };
        const existingUser = await User.findOne(existingQuery).lean();
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: email
                    ? 'An account already exists with this email. Please sign in.'
                    : 'An account already exists with this phone number. Please sign in.'
            });
        }

        // Always Student role
        let assignedRole = 'student';
        const superEmailReg = getSuperAdminEmail();
        if (email && email.toLowerCase().trim() === superEmailReg) {
            assignedRole = 'superadmin';
        }

        const initialDeviceId = getDeviceId(req) || crypto.randomBytes(24).toString('hex');
        const userPayload = {
            name: name.trim(),
            password,
            role: assignedRole,
            loginCount: 1,
            lastActive: new Date(),
            trustedDevices: [{
                deviceToken: initialDeviceId,
                userAgent: req.headers['user-agent'] || '',
                verifiedAt: new Date()
            }]
        };

        if (email) userPayload.email = email.toLowerCase().trim();
        if (phone) userPayload.phone = phone;
        if (classLevel) userPayload.classLevel = classLevel.trim();
        if (group) userPayload.group = group.trim();

        // Ensure compulsory subjects are auto-included alongside chosen group subjects
        let finalSubjects = Array.isArray(subjects) ? subjects.map(s => String(s).trim()).filter(Boolean) : [];
        if (classLevel) {
            try {
                const AcademicClass = require('../models/AcademicClass');
                const classDoc = await AcademicClass.findOne({ name: classLevel.trim() }).lean();
                if (classDoc) {
                    let compSubs = [];
                    if (classDoc.hasGroups && Array.isArray(classDoc.commonSubjects)) {
                        compSubs = classDoc.commonSubjects;
                    } else if (!classDoc.hasGroups && Array.isArray(classDoc.subjects)) {
                        compSubs = classDoc.subjects;
                    }
                    finalSubjects = Array.from(new Set([...compSubs, ...finalSubjects]));
                }
            } catch (cErr) {
                console.warn('AcademicClass lookup warning during registration:', cErr.message);
            }
        }
        if (finalSubjects.length > 0) {
            userPayload.subjects = finalSubjects;
        }

        const newUser = new User(userPayload);
        await newUser.save();

        // Clear registration OTP session
        delete req.session.regOtp;
        delete req.session.tempQuiz;

        // Set persistent device cookie for newly registered user
        res.cookie('oddhay_device_id', initialDeviceId, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        // Automatically log in user and establish session
        req.session.userId = newUser._id.toString();
        req.session.user = newUser.toObject();
        req.session.isFirstLogin = true;

        if (email) {
            sendWelcomeEmail(email, newUser.name).catch(e => console.error('Failed to send welcome email:', e));
        }

        // Push notification for superadmin
        try {
            const pushNotificationService = require('../services/pushNotificationService');
            pushNotificationService.sendToRole('superadmin', {
                title: `New Student Registered: ${newUser.name}`,
                body: `${newUser.name} (${newUser.email || newUser.phone}) joined ODDHAY.`,
                url: `/superadmin/user/${newUser._id}`,
                type: 'user_registered'
            }).catch(e => console.warn('Superadmin user notification warning:', e.message));
        } catch (e) {}

        req.session.save((saveErr) => {
            if (saveErr) console.warn('Session save warning on register:', saveErr.message);
            return res.json({
                success: true,
                message: 'Account created successfully!',
                redirect: '/dashboard'
            });
        });
    } catch (err) {
        console.error('Registration submission error:', err);
        if (err.code === 11000) {
            const isPhone = (err.keyPattern && err.keyPattern.phone) || (err.message && err.message.includes('phone'));
            return res.status(400).json({
                success: false,
                error: isPhone ? 'An account already exists with this phone number.' : 'An account already exists with this email address.'
            });
        }
        return res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

module.exports = router;

