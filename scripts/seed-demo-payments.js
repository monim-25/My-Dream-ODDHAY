// Seed 50 demo payments for testing
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

async function seedPayments() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Connected');

        const User = mongoose.model('User', new mongoose.Schema({ name: String, email: String }), 'users');
        const Course = mongoose.model('Course', new mongoose.Schema({ title: String }), 'courses');
        const Payment = mongoose.model('Payment', new mongoose.Schema({
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
            planIndex: { type: Number, default: 0 },
            amount: { type: Number },
            originalAmount: { type: Number },
            discountAmount: { type: Number, default: 0 },
            couponCode: { type: String, default: null },
            paymentMethod: { type: String },
            phoneNumber: { type: String },
            transactionId: { type: String, required: true, unique: true, uppercase: true, trim: true },
            status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success' },
            adminNote: { type: String, default: '' },
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            reviewedAt: { type: Date }
        }, { timestamps: true }), 'payments');

        // Delete existing demo payments
        await Payment.deleteMany({ transactionId: /^DEMO_/ });
        console.log('🧹 Cleaned existing demo payments');

        // Get real users and courses for population
        const users = await User.find().limit(20).lean();
        const courses = await Course.find().limit(10).lean();

        if (users.length === 0) {
            console.log('⚠️ No users found. Creating a demo user...');
            const demoUser = await User.create({ name: 'Demo User', email: 'demo@oddhay.com' });
            users.push(demoUser);
        }

        const paymentMethods = ['bkash', 'nagad', 'rocket', 'card', 'bank_transfer'];
        const statuses = ['success', 'success', 'success', 'success', 'success', 'success', 'success', 'failed', 'pending'];
        const prefixes = ['TXN', 'PAY', 'INV', 'ORD', 'REF'];

        const payments = [];
        for (let i = 0; i < 50; i++) {
            const user = users[Math.floor(Math.random() * users.length)];
            const course = courses.length > 0 ? courses[Math.floor(Math.random() * courses.length)] : null;
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const transactionId = `DEMO_${prefix}${Date.now().toString(36).toUpperCase()}${i}`;
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const amount = [200, 300, 500, 700, 1000, 1500, 2000][Math.floor(Math.random() * 7)];
            const hasDiscount = Math.random() > 0.7;
            const discount = hasDiscount ? Math.floor(amount * 0.1) : 0;
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

            // Random date within last 90 days
            const daysAgo = Math.floor(Math.random() * 90);
            const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            payments.push({
                user: user._id,
                course: course ? course._id : null,
                planIndex: 0,
                amount: amount - discount,
                originalAmount: amount,
                discountAmount: discount,
                couponCode: hasDiscount ? `DEMO_COUPON${Math.floor(Math.random() * 10)}` : null,
                paymentMethod,
                phoneNumber: `01${Math.floor(Math.random() * 900000000 + 100000000)}`,
                transactionId,
                status,
                adminNote: status === 'failed' ? 'Payment verification failed' : '',
                createdAt
            });
        }

        // Sort by createdAt descending
        payments.sort((a, b) => b.createdAt - a.createdAt);

        await Payment.insertMany(payments);
        console.log(`✅ Inserted ${payments.length} demo payments`);

        // Summary
        const success = payments.filter(p => p.status === 'success').length;
        const failed = payments.filter(p => p.status === 'failed').length;
        const pending = payments.filter(p => p.status === 'pending').length;
        console.log(`📊 Summary: ${success} Success, ${failed} Failed, ${pending} Pending`);

        mongoose.disconnect();
        console.log('👋 Done!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

seedPayments();
