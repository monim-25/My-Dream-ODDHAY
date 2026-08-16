const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    title: { type: String, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    subject: { type: String }, // For Model Tests - shows which subject the exam is about
    classLevel: { type: String }, // For Model Tests
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
        board: { type: String },
        year: { type: String }
    }],
    accessType: { type: String, enum: ['Free', 'Paid'], default: 'Free' },
    scheduledAt: { type: Date }, // Time when the exam becomes joinable
    expiresAt: { type: Date },   // Time when the exam disappears (12h window)
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', quizSchema);
