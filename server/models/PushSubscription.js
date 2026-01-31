const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    endpoint: {
        type: String,
        required: true,
        unique: true
    },
    keys: {
        p256dh: {
            type: String,
            required: true
        },
        auth: {
            type: String,
            required: true
        }
    },
    userAgent: String,
    deviceType: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'unknown'],
        default: 'unknown'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUsed: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
pushSubscriptionSchema.index({ user: 1, isActive: 1 });
pushSubscriptionSchema.index({ endpoint: 1 });

// Update lastUsed on successful notification
pushSubscriptionSchema.methods.markAsUsed = function () {
    this.lastUsed = new Date();
    return this.save();
};

// Deactivate subscription
pushSubscriptionSchema.methods.deactivate = function () {
    this.isActive = false;
    return this.save();
};

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
