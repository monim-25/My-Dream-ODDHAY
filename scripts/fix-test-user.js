require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const user = await User.findOne({ name: 'Test Student' });
    if (user) {
        user.role = 'student';
        await user.save();
        console.log('Updated Test Student role to student');
    }
    mongoose.disconnect();
});
