const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function checkDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({ email: null });
        console.log(`Users with email: null: ${users.length}`);

        const allUsers = await User.find({});
        console.log(`Total users: ${allUsers.length}`);

        const indexes = await User.collection.getIndexes();
        console.log('Indexes:', JSON.stringify(indexes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDB();
