const mongoose = require('mongoose');

const AcademicClassSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    // For classes with streams (Class 9, 10, 11, 12)
    hasGroups: {
        type: Boolean,
        default: false
    },
    // Subjects common to all students of this class (e.g. Bangla, English, ICT)
    commonSubjects: [{
        type: String,
        trim: true
    }],
    // Stream/Group specific subjects (Science, Commerce, Humanities)
    groups: [{
        name: { 
            type: String, 
            trim: true 
        },
        subjects: [{ 
            type: String, 
            trim: true 
        }]
    }],
    // Flat subjects list (for Class 6-8, or aggregated fallback)
    subjects: [{ 
        type: String,
        trim: true
    }],
    // Soft Delete / History Bucket: If true, hidden from live platform but preserved for records
    isArchived: {
        type: Boolean,
        default: false
    },
    order: { 
        type: Number, 
        default: 0 
    }
}, { timestamps: true });

module.exports = mongoose.model('AcademicClass', AcademicClassSchema);
