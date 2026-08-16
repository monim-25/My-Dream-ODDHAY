const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    itemType: {
        type: String,
        enum: ['course', 'note', 'question_bank'],
        default: 'course'
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: false
    },
    note: {
        type: mongoose.Schema.Types.Mixed,
        required: false
    },
    questionBank: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionBank',
        required: false
    },
    planIndex: { type: Number, default: 0 },
    amount: { type: Number, required: true },         // final amount after discount
    originalAmount: { type: Number, default: 0 },     // before discount
    discountAmount: { type: Number, default: 0 },     // discount applied
    couponCode: { type: String, default: null },       // coupon used
    paymentMethod: {
        type: String,
        enum: ['bkash', 'nagad', 'rocket', 'card', 'bank_transfer'],
        required: true
    },
    phoneNumber: { type: String, required: true },
    transactionId: { type: String, required: true, uppercase: true, trim: true },
    status: {
        type: String,
        enum: ['pending', 'success', 'approved', 'failed', 'rejected', 'refunded', 'partial_refund'],
        default: 'success'
    },
    refundAmount: { type: Number, default: 0 },
    refundReason: { type: String, default: '' },
    refundDate: { type: Date },
    refundBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminNote: { type: String, default: '' },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Index for fast queries
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ transactionId: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
