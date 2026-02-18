const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: { type: String, required: true },
    senderRole: { type: String, default: 'student' },
    // For private chat: receiver user ID
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Room: 'global' for public chat, or userId for private
    room: { type: String, default: 'global' },
    text: { type: String, required: true, maxlength: 1000 },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Index for fast room queries
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('Message', messageSchema);
