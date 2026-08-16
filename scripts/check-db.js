require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const User = require('./server/models/User');
    const Course = require('./server/models/Course');
    const Quiz = require('./server/models/Quiz');
    const Payment = require('./server/models/Payment');
    const Note = require('./server/models/Note');

    const [u, c, q, p, n] = await Promise.all([
        User.countDocuments(),
        Course.countDocuments(),
        Quiz.countDocuments(),
        Payment.countDocuments(),
        Note.countDocuments()
    ]);
    const roles = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
    const courses = await Course.find().select('title accessType plans').lean();

    console.log('\n=== ODDHAY DB Stats ===');
    console.log('Users:', u, '| Courses:', c, '| Quizzes:', q, '| Payments:', p, '| Notes:', n);
    console.log('Roles:', JSON.stringify(roles));
    console.log('\nCourses:');
    courses.forEach(c => console.log(' -', c.title, '|', c.accessType, '| plans:', c.plans?.length || 0));
    mongoose.disconnect();
});
