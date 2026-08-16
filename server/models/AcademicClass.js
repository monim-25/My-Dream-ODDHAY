const mongoose = require('mongoose');

const AcademicClassSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    subjects: [{ 
        type: String,
        trim: true
    }],
    order: { 
        type: Number, 
        default: 0 
    }
}, { timestamps: true });

module.exports = mongoose.model('AcademicClass', AcademicClassSchema);
