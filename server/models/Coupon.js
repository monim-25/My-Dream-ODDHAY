const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'], // % ছাড় বা নির্দিষ্ট টাকা ছাড়
        required: true,
        default: 'percentage'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscount: {
        type: Number, // percentage এর ক্ষেত্রে সর্বোচ্চ ছাড়ের পরিমাণ (টাকায়)
        default: null
    },
    minOrderAmount: {
        type: Number, // ন্যূনতম অর্ডার পরিমাণ
        default: 0
    },
    usageLimit: {
        type: Number, // মোট কতবার ব্যবহার করা যাবে (null = unlimited)
        default: null
    },
    usedCount: {
        type: Number,
        default: 0
    },
    perUserLimit: {
        type: Number, // একজন user কতবার ব্যবহার করতে পারবে
        default: 1
    },
    usedBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }
    }],
    applicableCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    }], // খালি থাকলে সব কোর্সে প্রযোজ্য
    isActive: {
        type: Boolean,
        default: true
    },
    expiresAt: {
        type: Date,
        default: null // null = no expiry
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    description: {
        type: String
    },
    // New fields for user/course targeting
    userType: {
        type: String,
        enum: ['all', 'first_purchase', 'specific_class'],
        default: 'all'
    },
    applicableClass: {
        type: String, // e.g., "6", "7", "11-12"
        default: null
    },
    courseType: {
        type: String,
        enum: ['all', 'specific'],
        default: 'all'
    }
}, { timestamps: true });

// Coupon valid কিনা check করার method
couponSchema.methods.isValid = function (userId, courseId, amount, userClass) {
    // Active check
    if (!this.isActive) return { valid: false, error: 'এই কুপনটি সক্রিয় নেই।' };

    // Expiry check
    if (this.expiresAt && new Date() > this.expiresAt) return { valid: false, error: 'এই কুপনের মেয়াদ শেষ হয়ে গেছে।' };

    // Usage limit check
    if (this.usageLimit !== null && this.usedCount >= this.usageLimit) return { valid: false, error: 'এই কুপনের ব্যবহার সীমা শেষ হয়ে গেছে।' };

    // Per-user limit check
    const userUsage = this.usedBy.filter(u => u.user.toString() === userId.toString()).length;
    if (userUsage >= this.perUserLimit) return { valid: false, error: 'আপনি এই কুপনটি আগেই ব্যবহার করেছেন।' };

    // Min order amount check
    if (amount < this.minOrderAmount) return { valid: false, error: `এই কুপন ব্যবহার করতে ন্যূনতম ৳${this.minOrderAmount} এর অর্ডার করতে হবে।` };

    // User type check
    if (this.userType === 'first_purchase') {
        const userCouponUsage = this.usedBy.filter(u => u.user.toString() === userId.toString()).length;
        if (userCouponUsage > 0) return { valid: false, error: 'এই কুপনটি শুধুমাত্র প্রথমবারের কেনাকাটায় প্রযোজ্য।' };
    }

    if (this.userType === 'specific_class' && this.applicableClass) {
        if (userClass !== this.applicableClass) return { valid: false, error: 'এই কুপনটি আপনার ক্লাসের শিক্ষার্থীদের জন্য নয়।' };
    }

    // Course applicability check
    if (this.courseType === 'specific' && this.applicableCourses.length > 0 && courseId) {
        const applicable = this.applicableCourses.some(c => c.toString() === courseId.toString());
        if (!applicable) return { valid: false, error: 'এই কুপনটি এই কোর্সে প্রযোজ্য নয়।' };
    }

    return { valid: true };
};

// Discount amount calculate করার method
couponSchema.methods.calculateDiscount = function (amount) {
    let discount = 0;
    if (this.discountType === 'percentage') {
        discount = (amount * this.discountValue) / 100;
        if (this.maxDiscount !== null) discount = Math.min(discount, this.maxDiscount);
    } else {
        discount = this.discountValue;
    }
    return Math.min(discount, amount); // discount কখনো amount এর বেশি হবে না
};

module.exports = mongoose.model('Coupon', couponSchema);
