const mongoose = require('mongoose');

const questionBankAttemptSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bank: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank', required: true },
    userAnswers: [{
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        questionType: { type: String, default: 'MCQ' }, // 'MCQ', 'Short', 'Medium', 'Comprehension'
        selectedOptionIndex: { type: Number, default: -1 }, // For MCQ
        selectedOptionText: { type: String, default: '' }, // For MCQ
        writtenAnswer: { type: String, default: '' }, // For Short/Medium/Comprehension
        isCorrect: { type: Boolean, default: false }, // Calculated for MCQ
        marksObtained: { type: Number, default: 0 },
        maxMarks: { type: Number, default: 1 }
    }],
    mcqScore: { type: Number, default: 0 },
    maxMcqScore: { type: Number, default: 0 },
    mcqTotalQuestions: { type: Number, default: 0 },
    mcqCorrectCount: { type: Number, default: 0 },
    wrongMcqCount: { type: Number, default: 0 },
    negativeMarksDeducted: { type: Number, default: 0 },
    totalBankQuestions: { type: Number, default: 0 },
    nonMcqCount: { type: Number, default: 0 },
    timeTakenSeconds: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuestionBankAttempt', questionBankAttemptSchema);
