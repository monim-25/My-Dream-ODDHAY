const mongoose = require('mongoose');
require('dotenv').config();

const Quiz = require('./server/models/Quiz');
const Course = require('./server/models/Course');
const User = require('./server/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const subjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Bangla', 'ICT', 'Accounting'];
const classLevels = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'HSC 1st Year', 'HSC 2nd Year'];

const modelTestTitles = [
    'Model Test - Full Syllabus', 'Chapterwise Test', 'Quick Revision Test',
    'Crash Course Test', 'Final Examination', 'Half Yearly Test', 'Pre-Test',
    'Post-Test', 'Mock Examination', 'Practice Set'
];

const courseExamTitles = [
    'Chapter Test', 'Unit Test', 'Monthly Test', 'Topic Quiz', 'Section Quiz',
    'Exercise Quiz', 'Problem Solving', 'Theory Quiz', 'Formula Test'
];

const questions = [
    { questionText: 'What is the speed of light?', options: ['3x10^8 m/s', '3x10^6 m/s', '3x10^4 m/s', '3x10^2 m/s'], correctAnswerIndex: 0, explanation: 'Speed of light is approximately 3x10^8 m/s' },
    { questionText: 'What is H2O?', options: ['Hydrogen', 'Oxygen', 'Water', 'Helium'], correctAnswerIndex: 2, explanation: 'H2O is water' },
    { questionText: 'What is 2+2?', options: ['3', '4', '5', '6'], correctAnswerIndex: 1, explanation: '2+2 = 4' },
    { questionText: 'What is the capital of Bangladesh?', options: ['Chittagong', 'Dhaka', 'Khulna', 'Sylhet'], correctAnswerIndex: 1, explanation: 'Dhaka is the capital' },
    { questionText: 'What is photosynthesis?', options: ['Respiration', 'Food making by plants', 'Digestion', 'Breathing'], correctAnswerIndex: 1, explanation: 'Photosynthesis is how plants make food' }
];

const seedQuizzes = async () => {
    try {
        console.log('1. Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        console.log('2. Fetching courses and users...');
        const courses = await Course.find().limit(10);
        const user = await User.findOne({ role: 'teacher' }) || await User.findOne();

        if (!user) {
            console.log('❌ No user found. Please run seed.js first.');
            process.exit(1);
        }

        console.log(`   Found ${courses.length} courses`);
        console.log(`   Using user: ${user.name || user.email}`);

        console.log('3. Creating 40 fake quizzes...');
        const quizzes = [];

        // Create 20 Model Tests (no course)
        for (let i = 0; i < 20; i++) {
            const title = modelTestTitles[i % modelTestTitles.length] + ' ' + (Math.floor(i / modelTestTitles.length) + 1);
            quizzes.push({
                title: title,
                course: null,
                duration: Math.floor(Math.random() * 30) + 10,
                questions: questions.slice(0, Math.floor(Math.random() * 5) + 1),
                addedBy: user._id
            });
        }

        // Create 20 Course Exams (with course)
        for (let i = 0; i < 20; i++) {
            const course = courses[i % courses.length];
            const title = courseExamTitles[i % courseExamTitles.length] + ' - ' + (Math.floor(i / courseExamTitles.length) + 1);
            quizzes.push({
                title: title,
                course: course ? course._id : null,
                duration: Math.floor(Math.random() * 20) + 5,
                questions: questions.slice(0, Math.floor(Math.random() * 5) + 1),
                addedBy: user._id
            });
        }

        await Quiz.insertMany(quizzes);
        console.log('✅ 40 quizzes created successfully!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
};

seedQuizzes();
