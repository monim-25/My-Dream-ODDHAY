const mongoose = require('mongoose');

const aiKnowledgeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Knowledge title is required'],
        trim: true
    },
    classLevel: {
        type: String,
        required: [true, 'Class level is required'],
        default: 'All Classes',
        trim: true
    },
    subject: {
        type: String,
        required: [true, 'Subject is required'],
        trim: true
    },
    topic: {
        type: String,
        default: '',
        trim: true
    },
    keywords: [{
        type: String,
        trim: true
    }],
    content: {
        type: String,
        required: [true, 'Knowledge content / formula is required'],
        trim: true
    },
    priority: {
        type: Number,
        default: 100, // Higher number = higher priority override
        min: 1,
        max: 1000
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for fast text and keyword matching
aiKnowledgeSchema.index({ subject: 1, classLevel: 1, isActive: 1 });
aiKnowledgeSchema.index({ keywords: 1 });
aiKnowledgeSchema.index({ title: 'text', content: 'text', topic: 'text' });

module.exports = mongoose.model('AIKnowledge', aiKnowledgeSchema);
