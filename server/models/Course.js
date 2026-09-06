const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: [{ type: String }], // Array of subjects, e.g., ['Physics', 'Chemistry']
    category: [{ type: String }], // Array of categories, e.g., ['Academic', 'Science']
    classLevel: [{ type: String }], // Array of class levels, e.g., ['Class 9', 'Class 10']
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
    price: { type: Number, default: 0 },
    discountPrice: { type: Number, default: 0 },
    difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
    totalRecordedClasses: { type: Number, default: 0 },
    totalLiveClasses: { type: Number, default: 0 },
    totalLectureNotes: { type: Number, default: 0 },
    totalQuizzes: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    learningHighlights: [{ type: String }], // Checklist points under About Course
    courseBenefits: [{ type: String }], // Checklist points under pricing card
    tags: [{ type: String }],
    trailerUrl: { type: String },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    permittedTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    routine: [{
        day: { type: String }, // e.g., 'Monday'
        startTime: { type: String }, // e.g., '10:00 AM'
        endTime: { type: String }, // e.g., '11:30 AM'
        note: { type: String } // e.g., 'Special session'
    }],
    routineImage: { type: String }, // Path to uploaded routine image
    createdAt: { type: Date, default: Date.now },
    chapters: [{
        title: { type: String, required: true },
        permittedTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        recordedClasses: [{
            title: String,
            videoPath: String, // Path to uploaded video
            description: String,
            instructor: String,
            duration: String,
            accessType: { type: String, enum: ['free', 'paid'], default: 'paid' },
            views: { type: Number, default: 0 }
        }],
        liveClasses: [{
            title: String,
            meetingUrl: String,
            date: Date,
            isLive: { type: Boolean, default: false },
            liveStartedAt: Date
        }],
        notes: [{
            title: String,
            filePath: String // Path to uploaded PDF
        }],
        quizzes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }]
    }],
    curriculumNodes: [{
        _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        name: { type: String, required: true },
        type: { type: String, enum: ['folder', 'video', 'note', 'liveClass', 'quiz'], required: true },
        parentId: { type: String, default: null }, // _id of parent folder or null/empty for root
        order: { type: Number, default: 0 },
        
        // Asset metadata:
        videoPath: String,
        thumbnail: String, // Path to uploaded video thumbnail
        duration: String,
        description: String,
        filePath: String,
        meetingUrl: String,
        date: Date,
        isLive: { type: Boolean, default: false },
        liveStartedAt: Date,
        quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        views: { type: Number, default: 0 },
        commentsDisabled: { type: Boolean, default: false },
        isRecorded: { type: Boolean, default: false }
    }]
});

courseSchema.index({ instructor: 1 });
courseSchema.index({ permittedTeachers: 1 });
courseSchema.index({ "curriculumNodes._id": 1 });
courseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);
