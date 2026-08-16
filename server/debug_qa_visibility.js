require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Course = require('./models/Course');
const QA = require('./models/QA');

async function debugQA() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const teachers = await User.find({ role: 'teacher' }).select('name email _id');
        console.log('--- Teachers ---');
        teachers.forEach(t => console.log(`${t.name} (${t.email}) ID: ${t._id}`));

        const qaCount = await QA.countDocuments();
        console.log('\nTotal QAs in DB:', qaCount);

        const qas = await QA.find().limit(5).populate('course').populate('askedBy');
        console.log('\n--- Sample QAs ---');
        qas.forEach(q => {
            console.log(`Q: ${q.question}`);
            console.log(`Course: ${q.course?.title} (${q.course?._id})`);
            console.log(`Asked By: ${q.askedBy?.name}`);
            console.log('---');
        });

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugQA();
