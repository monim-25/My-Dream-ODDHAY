const { connectDB, Course, QA, User } = require('./config');
const mongoose = require('mongoose');

async function check() {
    await connectDB();
    
    const users = await User.find({ role: { $in: ['admin', 'superadmin', 'teacher'] } });
    
    for (let u of users) {
        const courses = await Course.find({
            $or: [{ instructor: u._id }, { permittedTeachers: u._id }]
        });
        
        if (courses.length > 0) {
            const courseIds = courses.map(c => c._id);
            const qas = await QA.countDocuments({ status: 'open', course: { $in: courseIds } });
            console.log(`User: ${u.email} has ${courses.length} courses and ${qas} open QAs`);
        }
    }
    
    console.log('Total Open QAs in DB:', await QA.countDocuments({ status: 'open' }));
    process.exit();
}
check();
