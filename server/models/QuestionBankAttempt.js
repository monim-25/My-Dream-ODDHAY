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
        writtenImage: { type: String, default: '' }, // Student submitted picture
        writtenImages: [{ type: String }], // Multiple student submitted pictures
        q1Answer: { type: String, default: '' },
        q2Answer: { type: String, default: '' },
        q1Image: { type: String, default: '' },
        q2Image: { type: String, default: '' },
        q1Marks: { type: Number, default: 0 },
        q2Marks: { type: Number, default: 0 },
        isCorrect: { type: Boolean, default: false }, // Calculated for MCQ
        marksObtained: { type: Number, default: 0 },
        maxMarks: { type: Number, default: 1 },
        teacherComment: { type: String, default: '' },
        teacherImage: { type: String, default: '' },
        isReviewed: { type: Boolean, default: false }
    }],
    mcqScore: { type: Number, default: 0 },
    maxMcqScore: { type: Number, default: 0 },
    mcqTotalQuestions: { type: Number, default: 0 },
    mcqCorrectCount: { type: Number, default: 0 },
    wrongMcqCount: { type: Number, default: 0 },
    negativeMarksDeducted: { type: Number, default: 0 },
    totalBankQuestions: { type: Number, default: 0 },
    nonMcqCount: { type: Number, default: 0 },
    writtenStatus: { type: String, enum: ['none', 'pending', 'reviewed'], default: 'none' },
    teacherReview: {
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewerName: { type: String, default: '' },
        reviewedAt: { type: Date },
        overallFeedback: { type: String, default: '' },
        overallImage: { type: String, default: '' },
        totalWrittenScore: { type: Number, default: 0 },
        maxWrittenScore: { type: Number, default: 0 }
    },
    timeTakenSeconds: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuestionBankAttempt', questionBankAttemptSchema);
