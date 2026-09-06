const mongoose = require('mongoose');

const aiConversationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        default: 'New Conversation'
    },
    subject: {
        type: String,
        required: true,
        trim: true,
        default: 'General Study'
    },
    classLevel: {
        type: String,
        trim: true,
        default: 'Class 10'
    },
    mode: {
        type: String,
        enum: ['solver', 'concept', 'quiz', 'summary'],
        default: 'concept'
    },
    isPinned: {
        type: Boolean,
        default: false,
        index: true
    },
    messages: [{
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true
        },
        content: {
            type: String,
            required: true
        },
        subject: {
            type: String
        },
        mode: {
            type: String
        },
        attachmentName: {
            type: String
        },
        attachmentType: {
            type: String
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

aiConversationSchema.index({ user: 1, isPinned: -1, updatedAt: -1 });
aiConversationSchema.index({ user: 1, subject: 1 });

module.exports = mongoose.model('AiConversation', aiConversationSchema);
