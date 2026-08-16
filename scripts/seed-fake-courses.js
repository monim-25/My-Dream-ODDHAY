const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Course = require('./server/models/Course');

const instructorId = '69e7756b0b9b2236cee77c16';

async function seedCourses() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const fakeCourses = [];
        const subjects = ['Physics', 'Chemistry', 'Math', 'Biology', 'ICT', 'English', 'Higher Math'];
        const classes = ['Class 9', 'Class 10', 'SSC 2024', 'HSC 2024', 'HSC 2025'];

        for (let i = 1; i <= 10; i++) {
            fakeCourses.push({
                title: `${subjects[i % subjects.length]} Masterclass - Batch ${String.fromCharCode(64 + i)}`,
                subject: subjects[i % subjects.length],
                classLevel: classes[i % classes.length],
                description: `This is a comprehensive course for ${subjects[i % subjects.length]} designed for ${classes[i % classes.length]} students.`,
                instructor: instructorId,
                addedBy: instructorId,
                category: 'Academic',
                accessType: i % 3 === 0 ? 'free' : 'paid',
                price: i % 3 === 0 ? 0 : 1500 + (i * 100),
                thumbnail: `https://images.unsplash.com/photo-1501503069356-3c6b82a17d89?w=800&auto=format&fit=crop&q=60`,
                chapters: [
                    {
                        title: 'Introduction to the Subject',
                        recordedClasses: [{ title: 'Overview Lecture', videoUrl: 'https://example.com/video' }],
                        notes: [{ title: 'Topic Overview PDF', fileUrl: 'https://example.com/note' }]
                    }
                ],
                createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)) // staggered dates
            });
        }

        await Course.insertMany(fakeCourses);
        console.log('✅ Successfully added 10 fake courses');

        mongoose.disconnect();
    } catch (err) {
        console.error('❌ Seeding Error:', err);
    }
}

seedCourses();
