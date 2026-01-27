const mongoose = require('mongoose');

const routineTaskSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    date: {
        type: Date,
        default: Date.now
    },
    time: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['class', 'exam', 'task', 'other'],
        default: 'task'
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    }
}, { timestamps: true });

module.exports = mongoose.model('RoutineTask', routineTaskSchema);
