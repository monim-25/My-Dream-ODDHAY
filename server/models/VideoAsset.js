const mongoose = require('mongoose');

const videoAssetSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    videoPath: { type: String, required: true }, // Can be a local path or a URL (YouTube/Vimeo)
    thumbnailPath: { type: String },
    duration: { type: String },
    assetType: { 
        type: String, 
        enum: ['Lesson', 'Trailer', 'Promotion', 'Announcement', 'Tutorial'],
        default: 'Promotion'
    },
    displayContext: {
        type: String,
        enum: ['Landing Page', 'User Profile', 'Course Context', 'Subject Hub', 'Global'],
        default: 'Global'
    },
    targetSubject: { type: String },
    targetClass: [{ type: String }],
    targetCourse: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    instructor: { type: String }, // For promo videos, might just be a name string
    accessType: { type: String, enum: ['free', 'paid'], default: 'free' },
    views: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VideoAsset', videoAssetSchema);
