const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Topic name is required'], 
        trim: true 
    },
    code: { 
        type: String, 
        trim: true, 
        default: '' 
    },
    classLevel: { 
        type: String, 
        required: [true, 'Class level is required'], 
        trim: true 
    }, // e.g. 'Class 9', 'Class 10', 'HSC 1st Year', 'HSC 2nd Year', etc.
    group: { 
        type: String, 
        enum: ['Science', 'Commerce', 'Humanities', 'General', 'None', 'all'], 
        default: 'None' 
    },
    subject: { 
        type: String, 
        required: [true, 'Subject is required'], 
        trim: true 
    },
    segment: {
        type: String,
        trim: true,
        default: ''
    }, // e.g. 'গদ্য', 'পদ্য', 'উপন্যাস', 'নাটক', 'বীজগণিত', 'ক-বিভাগ'
    chapter: {
        number: { type: Number, default: 1 },
        name: { type: String, required: [true, 'Chapter name is required'], trim: true }
    },
    difficulty: { 
        type: String, 
        enum: ['Easy', 'Medium', 'Hard'], 
        default: 'Medium' 
    },
    keywords: [{ 
        type: String, 
        trim: true 
    }],
    description: { 
        type: String, 
        default: '', 
        trim: true 
    },
    subTopics: [{ 
        type: String, 
        trim: true 
    }],
    order: { 
        type: Number, 
        default: 0 
    },
    isChapterPlaceholder: {
        type: Boolean,
        default: false,
        index: true
    },
    isArchived: { 
        type: Boolean, 
        default: false 
    },
    status: {
        type: String,
        enum: ['approved', 'pending', 'rejected'],
        default: 'approved',
        index: true
    },
    submittedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    reviewedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    reviewedAt: { 
        type: Date 
    },
    rejectionReason: { 
        type: String, 
        default: '', 
        trim: true 
    },
    deletionRequest: {
        isRequested: { type: Boolean, default: false },
        reason: { type: String, default: '', trim: true },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        requestedByName: { type: String, default: '' },
        requestedAt: { type: Date },
        status: { type: String, enum: ['none', 'pending', 'declined'], default: 'none' },
        declinedReason: { type: String, default: '', trim: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date }
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }
}, { 
    timestamps: true 
});

// Fast query indexes for cascaded lookups and filters
topicSchema.index({ classLevel: 1, subject: 1, segment: 1, 'chapter.name': 1, status: 1, isArchived: 1, order: 1 });
topicSchema.index({ 'deletionRequest.isRequested': 1, 'deletionRequest.status': 1 });
topicSchema.index({ name: 'text', keywords: 'text', description: 'text', subTopics: 'text' });

module.exports = mongoose.model('Topic', topicSchema);

