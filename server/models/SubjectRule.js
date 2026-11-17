const mongoose = require('mongoose');

const subjectRuleSchema = new mongoose.Schema({
    subjectName: {
        type: String,
        required: [true, 'Subject name is required'],
        trim: true,
        index: true
    },
    // Applicable classes: e.g. ['Class 9', 'Class 10'] or ['all'] / empty array for all classes
    classLevels: [{
        type: String,
        trim: true
    }],
    hasSegments: {
        type: Boolean,
        default: true
    },
    // Defined segments list: e.g. ['গদ্য', 'পদ্য', 'উপন্যাস', 'নাটক']
    segments: [{
        type: String,
        trim: true
    }],
    // Whether choosing a segment is required during topic/question creation
    isMandatory: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Fast compound index for class & subject lookups
subjectRuleSchema.index({ subjectName: 1, classLevels: 1, isActive: 1 });

module.exports = mongoose.model('SubjectRule', subjectRuleSchema);
