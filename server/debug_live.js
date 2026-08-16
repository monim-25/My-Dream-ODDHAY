require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./models/Course');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const teacher = await User.findOne({ role: 'teacher' }).lean();
    console.log('Teacher:', teacher ? teacher.name + ' id=' + teacher._id : 'NONE');
    if (!teacher) { process.exit(); }

    const courses = await Course.find({
        $or: [{ instructor: teacher._id }, { permittedTeachers: teacher._id }]
    }).lean();
    console.log('Courses count:', courses.length);

    if (courses.length > 0) {
        const c = courses[0];
        console.log('Course title:', c.title);
        console.log('Chapters:', c.chapters.length);
        if (c.chapters.length > 0) {
            const ch = c.chapters[0];
            console.log('Chapter title:', ch.title);
            console.log('liveClasses count:', ch.liveClasses ? ch.liveClasses.length : 0);
            if (ch.liveClasses && ch.liveClasses.length > 0) {
                ch.liveClasses.forEach(lc => {
                    console.log(' -', lc.title, '| date:', lc.date, '| url:', lc.meetingUrl);
                });
            }
        }
    }
    process.exit();
});
