const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String },
    classLevel: { type: String, required: true }, // e.g., Class 9, Class 10, HSC
    type: { type: String, enum: ['Book', 'Note'], required: true },
    category: { type: String }, // e.g., Physics, Chemistry, Bangla
    thumbnail: { type: String },
    fileUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Book', bookSchema);
