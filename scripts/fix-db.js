const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function fixIndexes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        console.log('Checking current indexes...');
        const indexes = await User.collection.getIndexes();
        console.log('Current indexes:', JSON.stringify(indexes, null, 2));

        if (indexes.email_1) {
            console.log('Dropping email_1 index...');
            await User.collection.dropIndex('email_1');
        }

        if (indexes.phone_1) {
            console.log('Dropping phone_1 index...');
            await User.collection.dropIndex('phone_1');
        }

        console.log('Re-creating indexes with sparse: true...');
        await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
        await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true });

        console.log('Indexes fixed successfully!');

        // Let's also check for existing null emails
        const nullEmails = await User.find({ email: null });
        console.log(`Found ${nullEmails.length} users with email: null`);

        if (nullEmails.length > 0) {
            console.log('Cleaning up null emails (removing the field)...');
            await User.updateMany({ email: null }, { $unset: { email: "" } });
            console.log('Cleanup done.');
        }

        const nullPhones = await User.find({ phone: null });
        console.log(`Found ${nullPhones.length} users with phone: null`);
        if (nullPhones.length > 0) {
            console.log('Cleaning up null phones (removing the field)...');
            await User.updateMany({ phone: null }, { $unset: { phone: "" } });
            console.log('Cleanup done.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error fixing indexes:', err);
        process.exit(1);
    }
}

fixIndexes();
