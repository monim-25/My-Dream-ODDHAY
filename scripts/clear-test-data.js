require('dotenv').config();
const mongoose = require('mongoose');
const { Payment } = require('./server/config');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('Connected to DB. Clearing test payment data...');

    // Deleting payments created by the seed script (TRX...)
    const result = await Payment.deleteMany({
        transactionId: /^TRX/
    });

    console.log(`Successfully deleted ${result.deletedCount} test payments.`);
    mongoose.disconnect();
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
