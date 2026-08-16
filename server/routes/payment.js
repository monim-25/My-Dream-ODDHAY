const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { connectDB, protect, adminProtect, User, Course, Payment, Coupon, Note, Setting } = require('../config');
const { sendPaymentApprovalEmail } = require('../services/emailService');

// Validate coupon code
router.post('/validate-coupon', protect, async (req, res) => {
    try {
        await connectDB();
        const { code, courseId, noteId, amount } = req.body;
        if (!code) return res.json({ valid: false, error: 'কুপন কোড দিন।' });

        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return res.json({ valid: false, error: 'এই কুপন কোডটি বিদ্যমান নেই।' });

        const targetId = noteId || courseId;
        const validation = coupon.isValid(req.session.userId, targetId, parseFloat(amount) || 0);
        if (!validation.valid) return res.json({ valid: false, error: validation.error });

        const discount = coupon.calculateDiscount(parseFloat(amount) || 0);
        const finalAmount = Math.max(0, (parseFloat(amount) || 0) - discount);

        res.json({
            valid: true,
            discount,
            finalAmount,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            message: `✅ কুপন প্রয়োগ হয়েছে! ৳${discount.toFixed(0)} ছাড় পেয়েছেন।`
        });
    } catch (err) {
        res.json({ valid: false, error: 'কুপন যাচাই করতে সমস্যা হয়েছে।' });
    }
});

// Submit payment (from checkout form) - Auto-approves on successful transaction
router.post('/submit', protect, async (req, res) => {
    try {
        await connectDB();
        const { courseId, noteId, bankId, questionBankId, itemType, planIndex, paymentMethod, phoneNumber, transactionId, amount, couponCode } = req.body;
        const targetBankId = bankId || questionBankId;
        const isQB = itemType === 'question_bank' || !!targetBankId;
        const isNote = !isQB && (itemType === 'note' || !!noteId);

        const existing = await Payment.findOne({ transactionId: transactionId.toUpperCase() });
        if (existing) {
            const user = await User.findById(req.session.userId);
            if (user && isQB) {
                if (!user.purchasedQuestionBanks) user.purchasedQuestionBanks = [];
                const qbIdStr = String(targetBankId);
                if (!user.purchasedQuestionBanks.some(id => id && id.toString() === qbIdStr)) {
                    user.purchasedQuestionBanks.push(qbIdStr);
                    await user.save();
                }
                req.session.user = user.toObject();
            } else if (user && isNote) {
                if (!user.purchasedNotes) user.purchasedNotes = [];
                const noteIdStr = String(noteId);
                if (!user.purchasedNotes.some(id => id && id.toString() === noteIdStr)) {
                    user.purchasedNotes.push(noteIdStr);
                    await user.save();
                }
                req.session.user = user.toObject();
            } else if (user && !isNote && !isQB) {
                const plan = existing.course?.plans?.[parseInt(planIndex) || 0];
                let expiresAt = null;
                if (plan?.durationDays > 0) {
                    expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
                }
                const foundCourse = user.enrolledCourses.find(e => e.course && e.course.toString() === courseId.toString());
                if (foundCourse) {
                    foundCourse.expiresAt = expiresAt;
                } else {
                    user.enrolledCourses.push({ course: courseId, expiresAt });
                }
                await user.save();
                req.session.user = user.toObject();
            }
            return res.render('payment-pending', { payment: existing, user: req.session.user });
        }

        // Coupon processing
        let finalAmount = parseFloat(amount) || 0;
        let discountAmount = 0;
        let appliedCoupon = null;

        if (couponCode && couponCode.trim()) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
            if (coupon) {
                const targetId = targetBankId || noteId || courseId;
                const validation = coupon.isValid(req.session.userId, targetId, finalAmount);
                if (validation.valid) {
                    discountAmount = coupon.calculateDiscount(finalAmount);
                    finalAmount = Math.max(0, finalAmount - discountAmount);
                    appliedCoupon = coupon._id;
                    coupon.usedCount += 1;
                    coupon.usedBy.push({ user: req.session.userId });
                    await coupon.save();
                }
            }
        }

        const paymentData = {
            user: req.session.userId,
            amount: finalAmount,
            originalAmount: parseFloat(amount) || 0,
            discountAmount,
            couponCode: appliedCoupon ? couponCode.toUpperCase().trim() : null,
            paymentMethod,
            phoneNumber,
            transactionId: transactionId.toUpperCase(),
            status: 'success'
        };

        if (isQB) {
            paymentData.itemType = 'question_bank';
            paymentData.questionBank = targetBankId;
        } else if (isNote) {
            paymentData.itemType = 'note';
            paymentData.note = noteId;
        } else {
            paymentData.itemType = 'course';
            paymentData.course = courseId;
            paymentData.planIndex = parseInt(planIndex) || 0;
        }

        // Auto-approve payment and grant access immediately
        const payment = await Payment.create(paymentData);
        const user = await User.findById(req.session.userId);

        if (isQB) {
            const QuestionBank = require('../models/QuestionBank');
            let qb = null;
            if (mongoose.Types.ObjectId.isValid(targetBankId)) {
                qb = await QuestionBank.findById(targetBankId);
            }
            if (user) {
                if (!user.purchasedQuestionBanks) user.purchasedQuestionBanks = [];
                const qbIdStr = String(targetBankId);
                if (!user.purchasedQuestionBanks.some(id => id && id.toString() === qbIdStr)) {
                    user.purchasedQuestionBanks.push(qbIdStr);
                    await user.save();
                }
                req.session.user = user.toObject();

                const qbTitle = qb ? (qb.title || `${qb.subject} Question Bank`) : 'Question Bank';
                if (user.email) {
                    sendPaymentApprovalEmail(user.email, user.name, `Question Bank: ${qbTitle}`, finalAmount).catch(e => console.error('Email error:', e));
                }
            }
        } else if (isNote) {
            let note = null;
            if (mongoose.Types.ObjectId.isValid(noteId)) {
                note = await Note.findById(noteId);
            }

            if (user) {
                if (!user.purchasedNotes) user.purchasedNotes = [];
                const noteIdStr = String(noteId);
                if (!user.purchasedNotes.some(id => id && id.toString() === noteIdStr)) {
                    user.purchasedNotes.push(noteIdStr);
                    await user.save();
                }
                req.session.user = user.toObject();

                const noteTitle = note ? note.title : 'Academic Note';
                if (user.email) {
                    sendPaymentApprovalEmail(user.email, user.name, `Note: ${noteTitle}`, finalAmount).catch(e => console.error('Email error:', e));
                }
            }
            if (note && mongoose.Types.ObjectId.isValid(noteId)) {
                try { await payment.populate('note', 'title subject price'); } catch(e) {}
            }
        } else {
            const course = await Course.findById(courseId);
            if (user && course) {
                const plan = course.plans?.[parseInt(planIndex) || 0];
                let expiresAt = null;
                if (plan?.durationDays > 0) {
                    expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
                }

                const existing = user.enrolledCourses.find(e => e.course.toString() === courseId.toString());
                if (existing) {
                    existing.expiresAt = expiresAt;
                } else {
                    user.enrolledCourses.push({ course: courseId, expiresAt });
                }
                await user.save();

                // Send approval email
                if (user.email) {
                    sendPaymentApprovalEmail(user.email, user.name, course.title, finalAmount).catch(e => console.error('Email error:', e));
                }
            }
            if (course) {
                try { await payment.populate('course', 'title'); } catch(e) {}
            }
        }

        res.render('payment-pending', { payment, user: req.session.user });
    } catch (err) {
        console.error('Payment submit error stack:', err);
        if (err.code === 11000) {
            const isNote = req.body.itemType === 'note' || !!req.body.noteId;
            const existing = await Payment.findOne({ transactionId: req.body.transactionId ? req.body.transactionId.toUpperCase() : '' }).lean().catch(() => null);
            const user = await User.findById(req.session.userId);
            if (user && isNote) {
                if (!user.purchasedNotes) user.purchasedNotes = [];
                const noteIdStr = String(req.body.noteId);
                if (!user.purchasedNotes.some(id => id && id.toString() === noteIdStr)) {
                    user.purchasedNotes.push(noteIdStr);
                    await user.save();
                }
                req.session.user = user.toObject();
            }
            const fallbackPayment = existing || {
                amount: parseFloat(req.body.amount) || 50,
                paymentMethod: req.body.paymentMethod || 'bkash',
                transactionId: req.body.transactionId || 'COMPLETED',
                status: 'success'
            };
            return res.render('payment-pending', { payment: fallbackPayment, user: req.session.user });
        }
        res.status(500).send('There was an issue processing your payment: ' + (err.stack || err.message || err));
    }
});

// Student payment history
router.get('/history', protect, async (req, res) => {
    try {
        await connectDB();
        const payments = await Payment.find({ user: req.session.userId })
            .populate('course', 'title thumbnail category price')
            .populate('note', 'title subject price thumbnail')
            .sort({ createdAt: -1 }).lean();

        const totalSpent = payments
            .filter(p => p.status === 'approved' || p.status === 'success')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        const approvedCount = payments.filter(p => p.status === 'approved' || p.status === 'success').length;
        const pendingCount = payments.filter(p => p.status === 'pending').length;

        res.render('my-payments', { 
            user: req.session.user, 
            payments,
            stats: {
                totalSpent,
                approvedCount,
                pendingCount,
                totalTransactions: payments.length
            }
        });
    } catch (err) {
        console.error('Payment history error:', err);
        res.render('my-payments', { 
            user: req.session.user, 
            payments: [],
            stats: { totalSpent: 0, approvedCount: 0, pendingCount: 0, totalTransactions: 0 }
        });
    }
});

// Admin: Payment management page
router.get('/admin', protect, adminProtect, async (req, res) => {
    try {
        await connectDB();
        const filter = req.query.status || 'all';
        const query = filter === 'all' ? {} : { status: filter };

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [payments, statsAgg, revenueChart] = await Promise.all([
            Payment.find(query).populate('user', 'name email').populate('course', 'title').populate('note', 'title').sort({ createdAt: -1 }).limit(20).lean(),
            Payment.aggregate([
                { $group: {
                    _id: null,
                    total: { $sum: 1 },
                    success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                    totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, '$amount', 0] } },
                    totalRefunds: { $sum: '$refundAmount' },
                    bkash: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$paymentMethod', 'bkash'] }] }, '$amount', 0] } },
                    nagad: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$paymentMethod', 'nagad'] }] }, '$amount', 0] } },
                    rocket: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'success'] }, { $eq: ['$paymentMethod', 'rocket'] }] }, '$amount', 0] } }
                }}
            ]),
            Payment.aggregate([
                { $match: { status: 'success', createdAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amount: { $sum: "$amount" } } },
                { $sort: { "_id": 1 } }
            ])
        ]);

        const statsResult = statsAgg[0] || { total: 0, success: 0, totalRevenue: 0, totalRefunds: 0, bkash: 0, nagad: 0, rocket: 0 };
        const avgAmount = statsResult.success > 0 ? statsResult.totalRevenue / statsResult.success : 0;

        res.render('admin/payments', {
            user: req.session.user,
            payments,
            stats: {
                total: statsResult.total,
                success: statsResult.success,
                totalRefunds: statsResult.totalRefunds,
                totalRevenue: statsResult.totalRevenue,
                bkashRevenue: statsResult.bkash,
                nagadRevenue: statsResult.nagad,
                rocketRevenue: statsResult.rocket,
                avgAmount
            },
            filters: { q: '', status: filter, method: 'all', dateFilter: 'all', page: 1, totalPages: 1 },
            revenueChart: revenueChart || [],
            active: 'payments'
        });
    } catch (err) {
        res.status(500).send('Error: ' + err.message);
    }
});

// Admin: Approve or reject a payment
router.post('/:id/review', protect, adminProtect, async (req, res) => {
    try {
        await connectDB();
        const { action, adminNote } = req.body;
        const payment = await Payment.findById(req.params.id).populate('course').populate('note');

        if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
        if (payment.status !== 'pending') return res.status(400).json({ success: false, error: 'Already reviewed' });

        payment.status = action === 'approve' ? 'success' : 'failed';
        payment.adminNote = adminNote || '';
        payment.reviewedBy = req.session.userId;
        payment.reviewedAt = new Date();
        await payment.save();

        if (action === 'approve') {
            const user = await User.findById(payment.user);
            if (user) {
                if (payment.itemType === 'note' || payment.note) {
                    if (!user.purchasedNotes) user.purchasedNotes = [];
                    const noteId = payment.note._id || payment.note;
                    if (!user.purchasedNotes.some(id => id && id.toString() === noteId.toString())) {
                        user.purchasedNotes.push(noteId);
                        await user.save();
                    }
                    if (user.email) {
                        sendPaymentApprovalEmail(user.email, user.name, `Note: ${payment.note?.title || 'Note'}`, payment.amount).catch(e => console.error('Email error:', e));
                    }
                } else if (payment.course) {
                    const plan = payment.course?.plans?.[payment.planIndex];
                    let expiresAt = null;
                    if (plan?.durationDays > 0) {
                        expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
                    }
                    const existing = user.enrolledCourses.find(e => e.course.toString() === payment.course._id.toString());
                    if (existing) existing.expiresAt = expiresAt;
                    else user.enrolledCourses.push({ course: payment.course._id, expiresAt });
                    await user.save();

                    if (user.email) {
                        sendPaymentApprovalEmail(user.email, user.name, payment.course.title, payment.amount).catch(e => console.error('Email error:', e));
                    }
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
