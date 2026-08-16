require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./server/models/Course');
const User = require('./server/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        // 1. Get a student to see their class level
        const user = await User.findOne({ role: 'student' });
        if (!user) {
            console.log('No student found to target. Please register a student first.');
            process.exit(0);
        }

        const classLevel = user.classLevel || 'Class 10';
        console.log(`Creating free courses for: ${classLevel}`);

        // 2. Create sample Free Courses
        const samples = [
            {
                title: 'Basic Physics Concepts',
                subject: 'Physics',
                category: 'Science',
                classLevel: classLevel,
                description: 'A free introduction to Physics.',
                thumbnail: 'https://images.unsplash.com/photo-1636466484362-d45089e96e67?auto=format&fit=crop&q=80&w=400',
                accessType: 'free'
            },
            {
                title: 'Algebra Fundamentals',
                subject: 'Mathematics',
                category: 'Science',
                classLevel: classLevel,
                description: 'Master the basics of Algebra.',
                thumbnail: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=400',
                accessType: 'free'
            }
        ];

        for (const s of samples) {
            await Course.findOneAndUpdate(
                { title: s.title, classLevel: s.classLevel },
                s,
                { upsert: true, new: true }
            );
        }

        console.log('✅ Success: Sample Free Courses added to Database.');
        console.log('Now refresh http://localhost:3005/courses and check the "Free Resources" tab.');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding:', err);
        process.exit(1);
    }
}

seed();
