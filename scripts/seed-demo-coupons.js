// Seed 50 demo coupons for testing
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true, default: 'percentage' },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: null },
    minOrderAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    usedBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }
    }],
    applicableCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String },
    userType: { type: String, enum: ['all', 'first_purchase', 'specific_class'], default: 'all' },
    applicableClass: { type: String, default: null },
    courseType: { type: String, enum: ['all', 'specific'], default: 'all' }
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

const prefixes = ['ODDHAY', 'SAVE', 'DISCOUNT', 'OFFER', 'DEAL', 'PROMO', 'FLASH', 'MEGA', 'SUPER', 'HOT'];
const suffixes = ['10', '20', '25', '30', '50', '100', '200', 'NEW', 'FIRST', 'WELCOME', 'SPECIAL', 'VIP', 'PREMIUM', 'STUDENT', 'TEACHER'];
const descriptions = [
    'Get amazing discount on all courses',
    'Special offer for new students',
    'Limited time discount on premium courses',
    'Back to school special offer',
    'Holiday season discount',
    'Welcome to ODDHAY platform',
    'First purchase bonus',
    'Teacher exclusive discount',
    'Student exclusive offer',
    'Flash sale discount'
];

async function seedCoupons() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Connected');

        // Delete existing demo coupons (codes starting with DEMO_)
        await Coupon.deleteMany({ code: /^DEMO_/ });
        console.log('🧹 Cleaned existing demo coupons');

        const coupons = [];
        for (let i = 0; i < 50; i++) {
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            const code = `DEMO_${prefix}${suffix}${i + 1}`;
            const discountType = Math.random() > 0.5 ? 'percentage' : 'fixed';
            const discountValue = discountType === 'percentage' ? 
                [10, 15, 20, 25, 30, 50][Math.floor(Math.random() * 6)] : 
                [100, 200, 300, 500][Math.floor(Math.random() * 4)];
            
            const hasExpiry = Math.random() > 0.3;
            const expiryDate = hasExpiry ? 
                new Date(Date.now() + Math.floor(Math.random() * 180 - 30) * 24 * 60 * 60 * 1000) : 
                null;

            const userType = Math.random() > 0.7 ? 
                ['first_purchase', 'specific_class'][Math.floor(Math.random() * 2)] : 
                'all';

            const courseType = Math.random() > 0.8 ? 'specific' : 'all';

            coupons.push({
                code,
                discountType,
                discountValue,
                maxDiscount: discountType === 'percentage' && Math.random() > 0.5 ? 1000 : null,
                minOrderAmount: Math.random() > 0.7 ? 500 : 0,
                usageLimit: Math.random() > 0.6 ? [50, 100, 200, 500, 1000][Math.floor(Math.random() * 5)] : null,
                usedCount: Math.floor(Math.random() * 50),
                perUserLimit: Math.random() > 0.5 ? [1, 2, 3, 5][Math.floor(Math.random() * 4)] : 1,
                isActive: Math.random() > 0.2,
                expiresAt: expiryDate,
                description: descriptions[Math.floor(Math.random() * descriptions.length)],
                userType,
                applicableClass: userType === 'specific_class' ? ['6', '7', '8', '9', '10', '11-12'][Math.floor(Math.random() * 6)] : null,
                courseType,
                applicableCourses: []
            });
        }

        await Coupon.insertMany(coupons);
        console.log(`✅ Inserted ${coupons.length} demo coupons`);

        mongoose.disconnect();
        console.log('👋 Done!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

seedCoupons();
