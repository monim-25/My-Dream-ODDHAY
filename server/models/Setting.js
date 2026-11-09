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
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        supportHours: { type: String, default: '' }
    },
    socialLinks: {
        facebook: { type: String, default: '' },
        youtube: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        instagram: { type: String, default: '' }
    },
    legalInfo: {
        tradeLicense: { type: String, default: '' },
        tinNumber: { type: String, default: '' },
        address: { type: String, default: '' }
    },
    footerInfo: {
        bioText: { type: String, default: '' },
        copyrightText: { type: String, default: 'ODDHAY. All Rights Reserved.' }
    },
    privacyPolicy: {
        lastUpdated: { type: String, default: 'February 2026' },
        customContent: { type: String, default: '' },
        metaTitle: { type: String, default: 'Privacy Policy | ODDHAY' }
    },
    policiesAndLegal: {
        privacyPolicy: { type: String, default: '' },
        refundPolicy: { type: String, default: '' },
        termsConditions: { type: String, default: '' },
        aboutContent: { type: String, default: '' },
        faqContent: { type: String, default: '' },
        contactContent: { type: String, default: '' }
    },
    landingPage: {
        heroScreenshotUrl: { type: String, default: '' },
        heroImageScale: { type: Number, default: 100 },
        heroImageMobileScale: { type: Number, default: 100 },
        heroImageRotate: { type: Number, default: 0 },
        heroImageOffsetX: { type: Number, default: 0 },
        heroImageOffsetY: { type: Number, default: 0 },
        videoUrl: { type: String, default: '' },
        videoTitle: { type: String, default: 'অধ্যায় প্ল্যাটফর্ম পরিচিতি' },
        videoCaption: { type: String, default: 'এক নজরে দেখে নাও অধ্যায় কীভাবে তোমার পড়াশোনাকে করবে আরও সহজ ও কার্যকর' }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// We should ideally only have one settings document
// Use Setting.findOne() to get it, and Setting.findOneAndUpdate({}, update, { upsert: true, new: true }) to update

module.exports = mongoose.model('Setting', SettingSchema);
