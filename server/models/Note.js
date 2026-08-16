const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    classLevel: [{ type: String }],
    description: { type: String },
    chapter: { type: String },
    parentFolderId: { type: String, default: null },
    accessType: { type: String, enum: ['Free', 'Paid'], default: 'Free' },
    price: { type: Number, default: 0 },
    fileUrl: { type: String }, // Link to PDF/Image
    thumbnail: { type: String },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, // Optional course link
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', noteSchema);
