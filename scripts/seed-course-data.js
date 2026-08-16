const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./server/models/User');
const Course = require('./server/models/Course');
const Quiz = require('./server/models/Quiz');

const courseId = '69eb44962daf5d7e5f00590d';

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oddhay');
        console.log('Connected to DB');

        const course = await Course.findById(courseId);
        if (!course) {
            console.log('Course not found');
            process.exit(1);
        }

        // 1. Add 10 fake students
        for (let i = 1; i <= 10; i++) {
            const student = new User({
                name: `Fake Student ${i}`,
                email: `fake_student_${i}_${Date.now()}@test.com`,
                password: 'password123',
                role: 'student',
                profileImage: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`,
                enrolledCourses: [{
                    course: course._id,
                    progress: Math.floor(Math.random() * 100),
                    enrolledAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000))
                }]
            });
            await student.save();
        }
        console.log('✅ Added 10 fake enrolled students');

        // 2. Add 5 fake exams
        const quizIds = [];
        for (let i = 1; i <= 5; i++) {
            const quiz = new Quiz({
                title: `Final Assessment Part ${i}`,
                course: course._id,
                subject: course.subject,
                classLevel: course.classLevel,
                duration: 20 + (i * 10),
                questions: [
                    { questionText: "What is 2+2?", options: ["3", "4", "5", "6"], correctAnswerIndex: 1 }
                ],
                accessType: 'Paid'
            });
            await quiz.save();
            quizIds.push(quiz._id);
        }

        if (course.chapters.length === 0) {
            course.chapters.push({ title: 'Course Modules', quizzes: quizIds });
        } else {
            // Check if quizzes array exists on chapter 0
            if (!course.chapters[0].quizzes) {
                course.chapters[0].quizzes = [];
            }
            course.chapters[0].quizzes.push(...quizIds);
        }
        
        await course.save();
        console.log('✅ Added 5 fake exams to course chapters');
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
