const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    nodeId: { type: String, required: true }, // The _id of the curriculumNode (stored as string)
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userAvatar: { type: String },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    highlighted: { type: Boolean, default: false },
    replies: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        userName: { type: String, required: true },
        userAvatar: { type: String },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }]
});

// Index for fast comment fetching per lesson node
commentSchema.index({ nodeId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
