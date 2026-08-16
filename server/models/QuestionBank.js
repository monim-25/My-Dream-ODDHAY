const mongoose = require('mongoose');

const questionBankSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    year: { type: String, default: '' },
    board: { type: String, default: '' }, // e.g., Dhaka Board, Comilla Board
    topic: { type: String, default: '' }, // e.g., Mechanics, Electromagnetism
    subject: { type: String, required: true },
    classLevel: { type: [String], required: true },
    accessType: { type: String, enum: ['Free', 'Paid'], default: 'Free' },
    price: { type: Number, default: 0 },
    duration: { type: Number, default: 30 }, // Practice/Exam duration in minutes
    fileUrl: { type: String }, // Link to question paper
    thumbnail: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
    // Negative marking configuration
    negativeMarking: { type: Boolean, default: false },
    negativeMarkValue: { type: Number, default: 0.25 },
    // Flag for private custom student exams
    isCustom: { type: Boolean, default: false },
    // Real engagement tracking
    views: { type: Number, default: 0 },           // total page views
    examTakers: { type: Number, default: 0 },       // number of unique exam takers
    totalStudyMinutes: { type: Number, default: 0 }, // cumulative study minutes logged
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuestionBank', questionBankSchema);

