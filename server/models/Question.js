const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    topic: { type: String, default: '' },
    classLevel: { type: String, required: true },
    questionText: { type: String, required: true },
    options: [{ type: String }],
    correctAnswerIndex: { type: Number },
    correctAnswer: { type: String, default: '' },
    questionType: { type: String, enum: ['MCQ', 'Short', 'Medium', 'Comprehension'], required: true },
    board: { type: String, default: '' },
    year: { type: String, default: '' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    accessType: { type: String, enum: ['Free', 'Paid'], default: 'Free' },
    fileUrl: { type: String, default: '' },
    explanation: { type: String, default: '' },
    context: { type: String, default: '' },
    q1: { type: String, default: '' },
    q2: { type: String, default: '' },
    a1: { type: String, default: '' },
    a2: { type: String, default: '' },
    marks: { type: Number, default: 1 },
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' }
});

module.exports = mongoose.model('Question', questionSchema);
