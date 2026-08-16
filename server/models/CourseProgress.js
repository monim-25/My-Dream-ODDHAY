const mongoose = require('mongoose');

const courseProgressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    progressMap: { 
        type: Map, 
        of: Number, // nodeId -> seconds watched
        default: {}
    },
    completedNodes: [{ type: String }],
    lastAccessed: { type: Date, default: Date.now }
});

// Compound index to ensure uniqueness per user per course
courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('CourseProgress', courseProgressSchema);
