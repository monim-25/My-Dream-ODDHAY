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
        phone: { type: String, default: '+৮৮০ ৯৬৩৮-৭৮৯০১২' },
        whatsapp: { type: String, default: '+৮৮০১৭১২-৩৪৫৬৭৮' },
        supportHours: { type: String, default: 'সকাল ৯টা - রাত ১১টা' }
    },
    socialLinks: {
        facebook: { type: String, default: 'https://facebook.com/oddhay' },
        youtube: { type: String, default: 'https://youtube.com/@oddhay' },
        whatsapp: { type: String, default: 'https://wa.me/8801712345678' },
        linkedin: { type: String, default: 'https://linkedin.com/company/oddhay' },
        instagram: { type: String, default: 'https://instagram.com/oddhay.official' }
    },
    legalInfo: {
        tradeLicense: { type: String, default: 'TRAD/DNCC/041285/2026' },
        tinNumber: { type: String, default: '8491-7302-6194' },
        address: { type: String, default: 'বাড়ি #১২, রোড #০৪, ধানমন্ডি, ঢাকা - ১২০৯, বাংলাদেশ' }
    },
    footerInfo: {
        bioText: { type: String, default: '' },
        copyrightText: { type: String, default: 'ODDHAY. All Rights Reserved.' }
    },
    landingPage: {
        heroScreenshotUrl: { type: String, default: '' },
        heroImageScale: { type: Number, default: 100 },
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
