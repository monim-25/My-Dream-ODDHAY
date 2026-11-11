const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    title: { type: String, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    subject: { type: String },    // Subject the exam covers (all exam types)
    classLevel: { type: String }, // Class level (all exam types)
    chapter: { type: String },    // Syllabus chapter
    topic: { type: String },      // Primary topic
    topics: [{ type: String }],   // All selected topics
    duration: { type: Number, default: 10 }, // Duration in minutes
    questions: [{
        questionType: { type: String, enum: ['MCQ', 'Short', 'Medium', 'Comprehension'], default: 'MCQ' },
        questionText: { type: String },
        options: [String], // Used for MCQ
        correctAnswerIndex: { type: Number }, // Used for MCQ
        correctAnswer: { type: String }, // Used for Short/Medium
        explanation: { type: String },
        answer: { type: String },
        context: { type: String },
        q1: { type: String },
        q2: { type: String },
        a1: { type: String },
        a2: { type: String },
        marks: { type: Number },
        topic: { type: String, default: '' },
        board: { type: String },
        year: { type: String }
    }],
    accessType: { type: String, enum: ['Free', 'Paid'], default: 'Free' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    isDraft: { type: Boolean, default: true },
    syncGroup: { type: String },  // Links cross-class synced quizzes together
    scheduledAt: { type: Date }, // Time when the exam becomes joinable
    expiresAt: { type: Date },   // Time when the exam disappears (12h window)
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// High-performance indexes for live model tests, student exams, and queries
quizSchema.index({ course: 1 });
quizSchema.index({ status: 1 });
quizSchema.index({ classLevel: 1, subject: 1 });
quizSchema.index({ classLevel: 1, subject: 1, chapter: 1, topic: 1 });
quizSchema.index({ scheduledAt: 1, expiresAt: 1 });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ syncGroup: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
