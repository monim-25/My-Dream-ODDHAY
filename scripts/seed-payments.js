require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');
const Course = require('./server/models/Course');
const Payment = require('./server/models/Payment');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const user = await User.findOne({ role: 'student' });
    const course = await Course.findOne({ accessType: 'paid' });

    if (user && course) {
        // Create payments for the last 5 days
        for (let i = 0; i < 5; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            await Payment.create({
                user: user._id,
                course: course._id,
                amount: 500 + (Math.random() * 500),
                paymentMethod: 'bkash',
                phoneNumber: '01700000000',
                transactionId: 'TRX' + Math.random().toString(36).substring(7).toUpperCase(),
                status: 'approved',
                createdAt: date
            });
        }
        console.log('Seeded 5 dummy approved payments.');
    } else {
        console.log('User or Course not found for seeding.');
    }
    mongoose.disconnect();
});
