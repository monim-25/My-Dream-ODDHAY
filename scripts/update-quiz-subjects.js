const mongoose = require('mongoose');
require('dotenv').config();

const Quiz = require('./server/models/Quiz');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const subjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Bangla', 'ICT', 'Accounting', 'Economics', 'History'];

const updateQuizzes = async () => {
    try {
        console.log('1. Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        console.log('2. Adding subjects to model tests...');
        
        // Find all quizzes without subject
        const modelTests = await Quiz.find({ subject: { $exists: false } });
        
        let updated = 0;
        for (const quiz of modelTests) {
            const randomSubject = subjects[Math.floor(Math.random() * subjects.length)];
            quiz.subject = randomSubject;
            await quiz.save();
            updated++;
        }

        console.log(`✅ Updated ${updated} quizzes with subjects!`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
};

updateQuizzes();