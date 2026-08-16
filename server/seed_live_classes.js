/**
 * Seed script: Adds fake upcoming live classes to teacher's courses
 * Run: node server/seed_live_classes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Course = require('./models/Course');
const User = require('./models/User');

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay');
        console.log('✅ Connected to MongoDB');

        // Find a teacher
        const teacher = await User.findOne({ role: 'teacher' });
        if (!teacher) {
            console.log('❌ No teacher found. Create a teacher account first.');
            process.exit(1);
        }
        console.log(`👤 Teacher found: ${teacher.name} (${teacher.email})`);

        // Find courses assigned to this teacher
        const courses = await Course.find({
            $or: [{ instructor: teacher._id }, { permittedTeachers: teacher._id }]
        });

        if (courses.length === 0) {
            console.log('❌ No courses found for this teacher. Assigning teacher to first available course...');
            const anyCourse = await Course.findOne();
            if (!anyCourse) { console.log('❌ No courses exist at all.'); process.exit(1); }
            anyCourse.instructor = teacher._id;
            // Add a chapter with fake classes if none exist
            if (anyCourse.chapters.length === 0) {
                anyCourse.chapters.push({
                    title: 'Chapter 1: Introduction',
                    recordedClasses: [
                        { title: 'Class 1 - Foundation Concepts', videoPath: '', duration: '45 min', instructor: teacher.name },
                        { title: 'Class 2 - Core Principles', videoPath: '', duration: '52 min', instructor: teacher.name }
                    ],
                    liveClasses: [],
                    notes: [], quizzes: []
                });
            }
            // Add upcoming live classes
            const now = new Date();
            anyCourse.chapters[0].liveClasses.push(
                { title: 'Live Class - Chapter 1 Revision', meetingUrl: `oddhay-live-${anyCourse._id}-${Date.now()}`, date: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
                { title: 'Live Class - Practice Session', meetingUrl: `oddhay-live-${anyCourse._id}-${Date.now() + 1}`, date: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
                { title: 'Live Class - Mock Test Discussion', meetingUrl: `oddhay-live-${anyCourse._id}-${Date.now() + 2}`, date: new Date(now.getTime() + 48 * 60 * 60 * 1000) }
            );
            await anyCourse.save();
            console.log(`✅ Assigned teacher and added fake live classes to: "${anyCourse.title}"`);
        } else {
            const now = new Date();
            for (const course of courses) {
                if (course.chapters.length === 0) {
                    course.chapters.push({
                        title: 'Chapter 1: Foundation',
                        recordedClasses: [
                            { title: 'Recorded Class 1 - Basics', videoPath: '', duration: '40 min', instructor: teacher.name },
                            { title: 'Recorded Class 2 - Deep Dive', videoPath: '', duration: '55 min', instructor: teacher.name }
                        ],
                        liveClasses: [],
                        notes: [], quizzes: []
                    });
                }

                // Remove any old past fake live classes and add fresh upcoming ones
                const ch = course.chapters[0];
                ch.liveClasses = ch.liveClasses.filter(lc => new Date(lc.date) >= now);

                if (ch.liveClasses.length < 2) {
                    ch.liveClasses.push(
                        {
                            title: `Live: ${course.title} - Revision Class`,
                            meetingUrl: `oddhay-live-${course._id}-${Date.now()}`,
                            date: new Date(now.getTime() + 3 * 60 * 60 * 1000) // 3 hours from now
                        },
                        {
                            title: `Live: ${course.title} - Q&A Session`,
                            meetingUrl: `oddhay-live-${course._id}-${Date.now() + 1}`,
                            date: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
                        }
                    );
                }
                await course.save();
                console.log(`✅ Updated "${course.title}" with fake live classes`);
            }
        }

        console.log('\n🎉 Seeding complete! Refresh your teacher dashboard to see live classes.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed Error:', err);
        process.exit(1);
    }
}

seed();
