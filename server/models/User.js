const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'parent', 'admin', 'superadmin'], default: 'student' },
    classLevel: { type: String }, // e.g., Class 6, Class 10
    phone: { type: String },
    enrolledCourses: [{
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        expiresAt: { type: Date } // null for forever
    }],
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
    createdAt: { type: Date, default: Date.now }
});

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
