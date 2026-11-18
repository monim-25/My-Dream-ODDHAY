const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    subjects: [{ type: String, trim: true }],
    chapter: { type: String, default: '' },
    segment: { type: String, default: '', trim: true },
    topic: { type: String, default: '' },
    subTopic: { type: String, default: '' },
    subTopics: [{ type: String }],
    classLevel: { type: mongoose.Schema.Types.Mixed, required: true }, // Supports single string ('Class 10') or array (['Class 9', 'Class 10'])
    questionText: { type: String, required: true },
    options: [{ type: String }],
    correctAnswerIndex: { type: Number },
    correctAnswer: { type: String, default: '' },
    questionType: { type: String, enum: ['MCQ', 'Short', 'Medium', 'Comprehension'], required: true },
    mcqSubtype: { type: String, enum: ['standard', 'multiple_completion', 'contextual'], default: 'standard' },
    statements: [{ type: String }], // Roman numeral statements for multiple completion MCQ (i, ii, iii)
    contextId: { type: String, default: '' }, // Groups multiple contextual MCQs sharing the same stimulus/context
    contextInstruction: { type: String, default: '' }, // Directive e.g. "উদ্দীপকটি পড়ে ২ ও ৩ নং প্রশ্নের উত্তর দিন"
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
    q3: { type: String, default: '' },
    q4: { type: String, default: '' },
    a1: { type: String, default: '' },
    a2: { type: String, default: '' },
    a3: { type: String, default: '' },
    a4: { type: String, default: '' },
    s1: { type: String, default: '' },
    s2: { type: String, default: '' },
    s3: { type: String, default: '' },
    s4: { type: String, default: '' },
    solution1: { type: String, default: '' },
    solution2: { type: String, default: '' },
    solution3: { type: String, default: '' },
    solution4: { type: String, default: '' },
    marks: { type: Number, default: 1 },
    isBangla: { type: Boolean, default: false },
    language: { type: String, enum: ['en', 'bn'], default: 'en' },
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' }
});

module.exports = mongoose.model('Question', questionSchema);
