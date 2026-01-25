const mongoose = require('mongoose');

const qaSchema = new mongoose.Schema({
    question: { type: String, required: true },
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    askedByName: { type: String }, // For guest or quick display
    answer: { type: String },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QA', qaSchema);
