const mongoose = require('mongoose');

const qaSchema = new mongoose.Schema({
    question: { type: String, required: true },
    subject: { type: String, default: 'General Academic' },
    image: { type: String }, // Attached picture for question
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    askedByName: { type: String },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    answer: { type: String },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    answeredAt: { type: Date },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: { type: String },
        userRole: { type: String },
        userAvatar: { type: String },
        text: { type: String, required: true },
        image: { type: String }, // Attached picture for reply/comment
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

qaSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('QA', qaSchema);
