const mongoose = require('mongoose');

const routineTaskSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String },
    type: { type: String, default: 'task' },
    isCompleted: { type: Boolean, default: false },
    link: { type: String },
    isAiGenerated: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('RoutineTask', routineTaskSchema);
