const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./server/models/User');
const Quiz = require('./server/models/Quiz');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const names = ['Rahim Khan', 'Karim Ahmed', 'Jamal Hossain', 'Altaf Sheikh', 'Bablu Mia', 'Chan Mia', 'Kona Begum', 'Laila Akter', 'Nila Islam', 'Mona Khatun'];
const classLevels = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];

const seedAttempts = async () => {
    try {
        console.log('1. Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected.');

        console.log('2. Fetching students and quizzes...');
        let students = await User.find({ role: 'student' }).limit(20);
        const quizzes = await Quiz.find().limit(20);

        if (students.length === 0) {
            console.log('❌ No students found. Creating...');
            for (let i = 0; i < 10; i++) {
                const student = new User({
                    name: names[i] + ' ' + (i + 1),
                    email: `student${i + 1}@test.com`,
                    password: '123456',
                    role: 'student',
                    classLevel: classLevels[i % classLevels.length]
                });
                await student.save();
            }
            console.log('✅ 10 students created.');
            students = await User.find({ role: 'student' }).limit(20);
        }

        console.log(`   Found ${students.length} students, ${quizzes.length} quizzes`);

        console.log('3. Adding quiz results to students...');
        let totalAdded = 0;

        for (const student of students) {
            const attempts = Math.floor(Math.random() * 4) + 2;
            const results = [];

            for (let i = 0; i < attempts; i++) {
                const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
                if (!quiz) continue;

                const total = quiz.questions?.length || 10;
                const score = Math.floor(Math.random() * total) + 1;

                results.push({
                    quiz: quiz._id,
                    score: score,
                    total: total,
                    date: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
                });
            }

            if (results.length > 0) {
                student.quizResults = results;
                student.classLevel = student.classLevel || classLevels[Math.floor(Math.random() * classLevels.length)];
                await student.save();
                totalAdded += results.length;
            }
        }

        console.log(`✅ Added ${totalAdded} quiz attempts!`);
        
        const totalAttempts = await User.aggregate([
            { $match: { role: 'student' } },
            { $unwind: '$quizResults' },
            { $count: 'total' }
        ]);
        
        console.log(`📊 Total attempts: ${totalAttempts[0]?.total || 0}`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
};

seedAttempts();