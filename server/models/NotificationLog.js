const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    // For individual notifications (old system)
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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
        enum: ['course', 'exam', 'announcement', 'reminder', 'achievement', 'system', 'custom', 'payment'],
        default: 'custom'
    },
    icon: String,
    url: String,
    data: mongoose.Schema.Types.Mixed,
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'clicked', 'scheduled'],
        default: 'pending'
    },
    sentAt: Date,
    clickedAt: Date,
    error: String,
    // For tracking
    campaign: String,
    priority: {
        type: String,
        enum: ['low', 'normal', 'urgent'],
        default: 'normal'
    },
    // For broadcast notifications (new fields)
    target: {
        type: String,
        enum: ['all', 'student', 'teacher', 'admin', 'guardian', 'class', 'course'],
        default: 'all'
    },
    language: {
        type: String,
        enum: ['en', 'bn'],
        default: 'en'
    },
    classLevel: String,
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    },
    scheduledAt: Date,
    sent: {
        type: Number,
        default: 0
    },
    failed: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        default: 0
    },
    // Who sent this notification
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Read/Click tracking
    readCount: {
        type: Number,
        default: 0
    },
    clickCount: {
        type: Number,
        default: 0
    },
    uniqueReads: {
        type: Number,
        default: 0
    },
    uniqueClicks: {
        type: Number,
        default: 0
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
