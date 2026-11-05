const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    actionDetails: {
        type: String, // E.g., "Created course: HSC Physics"
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    entityType: {
        type: String, // E.g., "Course", "User", "Quiz", "Payment"
        required: true
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    }
}, { timestamps: true });

systemLogSchema.index({ entityType: 1, createdAt: -1 });
systemLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
