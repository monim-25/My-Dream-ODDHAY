const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema({
    year: {
        type: String,
        required: [true, 'Year is required'],
        unique: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    order: {
        type: Number,
        default: 0
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

module.exports = mongoose.model('AcademicYear', academicYearSchema);
