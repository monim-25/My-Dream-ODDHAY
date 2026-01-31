const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['course', 'exam', 'announcement', 'reminder', 'achievement', 'system', 'custom'],
        default: 'custom'
    },
    icon: String,
    url: String,
    data: mongoose.Schema.Types.Mixed,
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'clicked'],
        default: 'pending'
    },
    sentAt: Date,
    clickedAt: Date,
    error: String,
    // For tracking
    campaign: String,
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    }
}, {
    timestamps: true
});

// Indexes
notificationLogSchema.index({ user: 1, status: 1 });
notificationLogSchema.index({ type: 1, createdAt: -1 });
notificationLogSchema.index({ campaign: 1 });

// Mark as sent
notificationLogSchema.methods.markAsSent = function () {
    this.status = 'sent';
    this.sentAt = new Date();
    return this.save();
};

// Mark as failed
notificationLogSchema.methods.markAsFailed = function (error) {
    this.status = 'failed';
    this.error = error;
    return this.save();
};

// Mark as clicked
notificationLogSchema.methods.markAsClicked = function () {
    this.status = 'clicked';
    this.clickedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
