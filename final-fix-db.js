const { MongoClient } = require('mongodb');
require('dotenv').config();

async function fix() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(); // Uses the DB from the URI
        const users = db.collection('users');

        console.log('1. Cleaning up users with null/missing emails/phones...');
        await users.updateMany({ email: null }, { $unset: { email: "" } });
        await users.updateMany({ phone: null }, { $unset: { phone: "" } });

        console.log('2. Dropping all unique indexes to start fresh...');
        try { await users.dropIndex('email_1'); console.log('Dropped email_1'); } catch (e) { }
        try { await users.dropIndex('phone_1'); console.log('Dropped phone_1'); } catch (e) { }

        console.log('3. Re-creating indexes with UNIQUE and SPARSE flags...');
        await users.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
        await users.createIndex({ phone: 1 }, { unique: true, sparse: true, name: 'phone_1' });

        console.log('4. Verification...');
        const indexes = await users.indexes();
        console.log('New Indexes:', JSON.stringify(indexes, null, 2));

        const nullEmails = await users.countDocuments({ email: null });
        console.log(`Documents matched as "email: null" (includes missing): ${nullEmails}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
