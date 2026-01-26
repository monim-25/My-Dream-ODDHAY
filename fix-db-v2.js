const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function cleanAndFix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Unset null fields FIRST
        console.log('Unsetting email: null fields...');
        await User.updateMany({ email: null }, { $unset: { email: "" } });

        console.log('Unsetting phone: null fields...');
        await User.updateMany({ phone: null }, { $unset: { phone: "" } });

        // 2. Drop existing problematic indexes
        const indexes = await User.collection.getIndexes();
        console.log('Current indexes:', JSON.stringify(indexes, null, 2));

        if (indexes.email_1) {
            console.log('Dropping email_1...');
            await User.collection.dropIndex('email_1');
        }
        if (indexes.phone_1) {
            console.log('Dropping phone_1...');
            await User.collection.dropIndex('phone_1');
        }

        // 3. Handle duplicates manually if any exist before indexing
        // We saw phone "01740335172" was duplicated
        const duplicatePhones = await User.aggregate([
            { $group: { _id: "$phone", count: { $sum: 1 }, ids: { $push: "$_id" } } },
            { $match: { _id: { $ne: null }, count: { $gt: 1 } } }
        ]);

        if (duplicatePhones.length > 0) {
            console.log('Found duplicate phones:', JSON.stringify(duplicatePhones, null, 2));
            for (const group of duplicatePhones) {
                // Keep the first one, delete the rest
                const toDelete = group.ids.slice(1);
                console.log(`Deleting ${toDelete.length} duplicates for phone ${group._id}`);
                await User.deleteMany({ _id: { $in: toDelete } });
            }
        }

        // 4. Create indexes correctly with sparse: true
        console.log('Creating email index with sparse: true...');
        await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });

        console.log('Creating phone index with sparse: true...');
        await User.collection.createIndex({ phone: 1 }, { unique: true, sparse: true });

        console.log('Database cleanup and indexing successful!');
        process.exit(0);
    } catch (err) {
        console.error('Final cleanup error:', err);
        process.exit(1);
    }
}

cleanAndFix();
