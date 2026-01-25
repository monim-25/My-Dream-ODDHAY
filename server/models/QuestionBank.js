const mongoose = require('mongoose');

const questionBankSchema = new mongoose.Schema({
    year: { type: String, required: true },
    board: { type: String, required: true }, // e.g., Dhaka Board, Comilla Board
    subject: { type: String, required: true },
    classLevel: { type: String, required: true },
    fileUrl: { type: String }, // Link to question paper
    thumbnail: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuestionBank', questionBankSchema);
