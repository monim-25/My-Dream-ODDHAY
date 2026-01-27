const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true }, // e.g., Physics, Mathematics
    category: { type: String, required: true }, // e.g., Science, Commerce, Arts
    classLevel: { type: String, required: true }, // e.g., Class 6, Class 10
    description: { type: String },
    thumbnail: { type: String }, // Path to uploaded image
    accessType: { type: String, enum: ['free', 'paid', 'trial'], default: 'free' },
    plans: [{
        name: { type: String }, // e.g., '1 Month', '1 Year', 'Lifetime'
        durationDays: { type: Number }, // 30, 365, 0 for forever
        price: { type: Number }
    }],
    featuredForClasses: [{ type: String }], // Array of class levels to show this as an "Ad"
    trialPeriod: { type: Number, default: 0 }, // in days
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    chapters: [{
        title: { type: String, required: true },
        recordedClasses: [{
            title: String,
            videoPath: String, // Path to uploaded video
            duration: String
        }],
        liveClasses: [{
            title: String,
            meetingUrl: String,
            date: Date
        }],
        notes: [{
            title: String,
            filePath: String // Path to uploaded PDF
        }],
        quizzes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }]
    }]
});

module.exports = mongoose.model('Course', courseSchema);
