const mongoose = require('mongoose');
require('dotenv').config();

async function cleanup() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        const User = mongoose.model('User', new mongoose.Schema({}));

        console.log('Dropping all users to ensure a fresh start...');
        await User.collection.drop();
        console.log('Users collection dropped.');

        console.log('Re-creating clean indexes...');
        // These will be recreated by Mongoose on next start, but we can do it now
        await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
        await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
        console.log('Indexes recreated.');

        console.log('✅ Cleanup complete. You can now try registering with a fresh account.');
        process.exit(0);
    } catch (err) {
        if (err.message.includes('ns not found')) {
            console.log('Collection already empty.');
        } else {
            console.error('Error during cleanup:', err);
        }
        process.exit(1);
    }
}

cleanup();
