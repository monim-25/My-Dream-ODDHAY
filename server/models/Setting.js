const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
    isMaintenanceMode: {
        type: Boolean,
        default: false
    },
    paymentNumbers: {
        bkash: { type: String, default: '' },
        nagad: { type: String, default: '' },
        rocket: { type: String, default: '' }
    },
    paymentGateway: {
        mode: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
        bkash: {
            appKey: { type: String, default: '' },
            appSecret: { type: String, default: '' },
            username: { type: String, default: '' },
            password: { type: String, default: '' }
        },
        nagad: {
            merchantId: { type: String, default: '' },
            publicKey: { type: String, default: '' },
            privateKey: { type: String, default: '' }
        }
    },
    contactInfo: {
        email: { type: String, default: 'support@oddhay.com' },
        phone: { type: String, default: '+8801XXXXXXXXX' },
        whatsapp: { type: String, default: '+8801XXXXXXXXX' }
    },
    socialLinks: {
        facebook: { type: String, default: 'https://facebook.com/oddhay' },
        youtube: { type: String, default: 'https://youtube.com/@oddhay' }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// We should ideally only have one settings document
// Use Setting.findOne() to get it, and Setting.findOneAndUpdate({}, update, { upsert: true, new: true }) to update

module.exports = mongoose.model('Setting', SettingSchema);
