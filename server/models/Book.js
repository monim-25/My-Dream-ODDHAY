const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, default: 'ODDHAY Editorial / NCTB' },
    subject: { type: String, required: true },
    classLevel: { type: String, required: true }, // Class 9, Class 10, HSC, Admission
    category: { 
        type: String, 
        enum: ['Textbook', 'Reference Book', 'Formula Sheet', 'Board Solution', 'Handwritten Note'], 
        default: 'Textbook' 
    },
    description: { type: String },
    coverImage: { type: String },
    fileUrl: { type: String, required: true },
    fileSize: { type: String, default: '2.4 MB' },
    pageCount: { type: Number, default: 0 },
    accessType: { type: String, enum: ['Free', 'Premium'], default: 'Free' },
    viewsCount: { type: Number, default: 0 },
    downloadsCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Book', bookSchema);
