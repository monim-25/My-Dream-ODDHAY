const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    title: { type: String, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    duration: { type: Number, default: 10 }, // Duration in minutes
    questions: [{
        questionText: { type: String, required: true },
        options: [String],
        correctAnswerIndex: { type: Number, required: true }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', quizSchema);
