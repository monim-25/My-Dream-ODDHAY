const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'parent', 'guardian', 'admin', 'teacher', 'superadmin', 'content_manager', 'support', 'moderator'], default: 'student' },
    classLevel: { type: String }, // e.g., Class 6, Class 10 (for students) or teaching class (for teachers)
    teachingSubject: { type: String }, // Subject taught by teachers
    phone: { type: String, unique: true, sparse: true },
    profilePicture: { type: String },
    profileImage: { type: String },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    address: { type: String },
    enrolledCourses: [{
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        expiresAt: { type: Date }, // null for forever
        progress: { type: Number, default: 0, min: 0, max: 100 }, // lesson completion %
        enrolledAt: { type: Date, default: Date.now }
    }],
    purchasedNotes: [{ type: mongoose.Schema.Types.Mixed }],
    completedLessons: [{ type: String }],
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // For Parent role
    parentRequests: [{
        parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
    }],
    quizResults: [{
        quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' },
        score: Number,
        total: Number,
        date: { type: Date, default: Date.now }
    }],
    trialEnrollments: [{
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        startedAt: { type: Date, default: Date.now }
    }],
    lastWatchedLesson: {
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        lessonId: { type: String },
        lessonTitle: { type: String },
        thumbnail: { type: String },
        lastPosition: { type: Number, default: 0 },
        watchedAt: { type: Date, default: Date.now }
    },
    attendedNotices: [{ type: String }],
    dailyGoals: {
        date: { type: String },
        videosCount: { type: Number, default: 0 },
        quizzesCount: { type: Number, default: 0 },
        notesCount: { type: Number, default: 0 },
        savedNotesCount: { type: Number, default: 0 },
        activeMinutes: { type: Number, default: 0 },
        todayXpEarned: { type: Number, default: 0 },
        todayWatchedLessons: [{ type: String }]
    },
    savedBookmarks: [{
        itemType: { type: String, default: 'resource' },
        title: { type: String, required: true },
        link: { type: String, required: true },
        savedAt: { type: Date, default: Date.now }
    }],
    savedQuestionBanks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' }],
    purchasedQuestionBanks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionBank' }],
    createdAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    passwordResetRequired: { type: Boolean, default: false },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    streak: { type: Number, default: 0 },
    lastActive: { type: Date },
    totalXP: { type: Number, default: 0 },
    restrictionExpires: { type: Date },
    restrictionReason: { type: String },

    // Teacher Profile Fields
    designation: { type: String },           // e.g. "Senior Physics Teacher"
    experience: { type: String },            // e.g. "8 years"
    education: { type: String },             // General education summary
    bio: { type: String },                   // Short professional bio
    achievements: { type: String },          // Notable achievements
    
    // Additional Detailed Info
    presentAddress: { type: String },
    permanentAddress: { type: String },
    schoolName: { type: String },
    collegeName: { type: String },
    universityName: { type: String },
    sscGpa: { type: String },
    hscGpa: { type: String },
    cgpa: { type: String },

    activeDevices: [{
        deviceId: String,
        browser: String,
        os: String,
        deviceType: String,
        ip: String,
        lastActive: { type: Date, default: Date.now }
    }],

    socialLinks: {
        facebook: { type: String },
        youtube: { type: String },
        linkedin: { type: String }
    }
});

// Strategic indexes for dashboard performance
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ 'quizResults.date': -1 });

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
