const mongoose = require('mongoose');

const academicBoardSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Board name is required'],
        unique: true,
        trim: true
    },
    code: {
        type: String,
        trim: true,
        default: ''
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

module.exports = mongoose.model('AcademicBoard', academicBoardSchema);
