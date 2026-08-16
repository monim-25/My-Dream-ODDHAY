const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'SETTINGS_CHANGE', 'OTHER', 'FREE', 'PAID', 'SETTING']
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
