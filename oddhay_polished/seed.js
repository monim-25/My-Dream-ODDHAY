const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Course = require('./models/Course');
const Quiz = require('./models/Quiz');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const seedData = async () => {
    try {
        console.log('1. Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        console.log('2. Clearing existing data...');
        await User.deleteMany({});
        await Course.deleteMany({});
        await Quiz.deleteMany({});
        console.log('✅ Data cleared.');

        console.log('3. Creating Teacher account...');
        const teacher = new User({
            name: 'Admin Teacher',
            email: 'admin@oddhay.com',
            password: 'password123',
            role: 'teacher',
            phone: '01700000000'
        });
        await teacher.save();
        console.log('✅ Teacher created: admin@oddhay.com');

        console.log('4. Creating Student account...');
        const student = new User({
            name: 'Sample Student',
            email: 'student@oddhay.com',
            password: 'password123',
            role: 'student',
            phone: '01800000000'
        });
        await student.save();
        console.log('✅ Student created: student@oddhay.com');

        console.log('5. Creating Courses...');
        const courses = [
            {
                title: 'Class 10 - SSC Mathematics',
                category: 'Mathematics',
                classLevel: 'Class 10',
                description: 'A comprehensive guide to Class 10 Mathematics.',
                thumbnail: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&q=80&w=800',
                lessons: [
                    { title: 'Algebra Basics', videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', duration: '15:00' }
                ]
            },
            {
                title: 'Class 9 - English Grammar',
                category: 'English',
                classLevel: 'Class 9',
                description: 'Master English grammar for Class 9.',
                thumbnail: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=800',
                lessons: [
                    { title: 'Tense Basics', videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', duration: '12:00' }
                ]
            },
            {
                title: 'Class 6 - Science Fun',
                category: 'Science',
                classLevel: 'Class 6',
                description: 'Explore the basics of science for Class 6.',
                thumbnail: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=800',
                lessons: [
                    { title: 'Introduction to Matter', videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ', duration: '10:00' }
                ]
            }
        ];
        const createdCourses = await Course.insertMany(courses);
        console.log(`✅ ${createdCourses.length} courses created.`);

        console.log('6. Creating Quiz...');
        const quiz = new Quiz({
            title: 'SSC Math Quiz - Algebra',
            course: createdCourses[0]._id,
            duration: 10,
            questions: [
                {
                    questionText: "What is the value of x in 2x + 5 = 15?",
                    options: ["2", "5", "10", "15"],
                    correctAnswerIndex: 1
                },
                {
                    questionText: "Which one is a prime number?",
                    options: ["4", "6", "9", "7"],
                    correctAnswerIndex: 3
                }
            ]
        });
        await quiz.save();
        console.log('✅ Quiz created.');

        console.log('🚀 SEEDING COMPLETE!');
        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ FATAL ERROR DURING SEEDING:');
        console.error(err);
        process.exit(1);
    }
};

seedData();
