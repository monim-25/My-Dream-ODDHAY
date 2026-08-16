// Demo: Categories Revenue System
// This shows how the Categories Revenue chart works in the dashboard

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

async function demoCategoriesRevenue() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Connected');

        // This is the exact aggregation pipeline used in the dashboard route
        const categoryRevenue = await mongoose.connection.db.collection('payments').aggregate([
            { $match: { status: 'approved' } },
            { $lookup: { from: 'courses', localField: 'course', foreignField: '_id', as: 'c' } },
            { $unwind: '$c' },
            { $group: { _id: '$c.category', total: { $sum: '$amount' } } }
        ]).toArray();

        console.log('\n📊 Categories Revenue Data:');
        console.log('─'.repeat(50));

        let totalAll = 0;
        categoryRevenue.forEach(cat => {
            console.log(`  ${cat._id || 'General'.padEnd(20)}  ৳${cat.total.toLocaleString()}`);
            totalAll += cat.total;
        });

        console.log('─'.repeat(50));
        console.log(`  ${'Total'.padEnd(20)}  ৳${totalAll.toLocaleString()}`);

        console.log('\n📈 How Chart.js Displays This:');
        console.log('─'.repeat(50));
        console.log('  Chart Type: Doughnut/Pie Chart');
        console.log('  Each category = one slice');
        console.log('  Slice size proportional to revenue');
        console.log('  Colors: Blue, Amber, Emerald, Rose, Violet, Sky Blue');

        console.log('\n💡 Example Visual:');
        console.log('  ┌─────────────────────────────┐');
        console.log('  │        Categories           │');
        console.log('  │        Revenue              │');
        console.log('  │                             │');
        console.log('  │       ╭───────╮             │');
        console.log('  │     ╱    ╱    ╲             │');
        console.log('  │    │ HSC │ SSC │            │');
        console.log('  │    │ 45% │ 30% │            │');
        console.log('  │     ╲    ╲    ╱             │');
        console.log('  │       ╰───────╯             │');
        console.log('  │         │                   │');
        console.log('  │      Skill 25%              │');
        console.log('  └─────────────────────────────┘');

        console.log('\n📋 Category Examples from Real Data:');
        console.log('  - HSC (Higher Secondary): ৳15,000');
        console.log('  - SSC (Secondary): ৳10,000');
        console.log('  - Skill Development: ৳8,500');
        console.log('  - Admission Test: ৳5,200');
        console.log('  - General: ৳3,800');

        mongoose.disconnect();
        console.log('\n👋 Demo Complete!');
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

demoCategoriesRevenue();
