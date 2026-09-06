const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, required: true },
    userAvatar: { type: String },
    userRole: { type: String, default: 'student' },
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: { type: String, required: true },
    senderRole: { type: String, default: 'student' },
    userAvatar: { type: String },
    // For private chat: receiver user ID
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Room: 'global' for public chat, or userId for private
    room: { type: String, default: 'global' },
    text: { type: String, default: '', maxlength: 2000 },
    attachment: {
        url: { type: String },
        fileType: { type: String, enum: ['image', 'video', 'audio', 'pdf', 'document', 'other'] },
        fileName: { type: String },
        fileSize: { type: Number },
        duration: { type: Number } // For voice notes / audio in seconds
    },
    isRead: { type: Boolean, default: false },
    highlighted: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: Date },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    replyTo: {
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        senderName: { type: String },
        text: { type: String },
        fileType: { type: String }
    },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    deletedForEveryone: { type: Boolean, default: false },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [replySchema],
    createdAt: { type: Date, default: Date.now }
});

// Index for fast room queries
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('Message', messageSchema);
