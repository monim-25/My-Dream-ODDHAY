require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./server/models/Course');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const courseTitle = 'Physics Masterclass 2024';
        let course = await Course.findOne({ title: courseTitle });

        if (!course) {
            console.log('Course not found, creating a new one...');
            course = new Course({
                title: courseTitle,
                subject: 'Physics',
                category: 'Science',
                classLevel: 'Class 10',
                description: 'A masterclass for Physics.',
                accessType: 'paid',
                chapters: [{ title: 'Chapter 1: Introduction', recordedClasses: [] }]
            });
        }

        if (course.chapters.length === 0) {
            course.chapters.push({ title: 'Chapter 1: Introduction', recordedClasses: [] });
        }

        const chapter = course.chapters[0];
        
        // Add 20 fake videos
        const fakeVideos = [];
        for (let i = 1; i <= 20; i++) {
            fakeVideos.push({
                title: `Lesson ${i}: Advanced Physics Intelligence ${i}`,
                videoPath: 'https://example.com/video' + i,
                duration: `${10 + i}:00`
            });
        }

        chapter.recordedClasses = fakeVideos;
        
        await course.save();

        console.log(`✅ Success: 20 fake video lessons added to "${courseTitle}".`);
        process.exit(0);
    } catch (err) {
        console.error('Error seeding:', err);
        process.exit(1);
    }
}

seed();
