const { MongoClient } = require('mongodb');
require('dotenv').config();

async function check() {
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db();
        const users = await db.collection('users').find({}).toArray();
        console.log('User list:');
        users.forEach(u => {
            console.log(`- ID: ${u._id}, Name: ${u.name}, Email: ${u.email === undefined ? 'UNDEFINED' : (u.email === null ? 'NULL' : (u.email === '' ? 'EMPTY STRING' : u.email))}, Phone: ${u.phone}`);
        });
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
}

check();
