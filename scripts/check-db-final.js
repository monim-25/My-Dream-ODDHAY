const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const User = mongoose.model('User', new mongoose.Schema({}));
        const indexes = await User.collection.getIndexes();
        console.log('INDEXES:', JSON.stringify(indexes, null, 2));

        const users = await User.find({}).lean();
        console.log('USERS COUNT:', users.length);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
