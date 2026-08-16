const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ['system', 'course', 'exam', 'message', 'announcement', 'reminder', 'payment'],
        default: 'system'
    },
    link: { type: String },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    clickedAt: { type: Date },
    // For tracking which broadcast notification this belongs to
    broadcastId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'NotificationLog'
    },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ broadcastId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
