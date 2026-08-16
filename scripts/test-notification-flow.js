const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const { connectDB, User } = require('./server/config');
const pushNotificationService = require('./server/services/pushNotificationService');

async function RunTest() {
    try {
        await connectDB();
        console.log('📡 Database Connected...');

        // 1. Find a test student (or any user)
        const testUser = await User.findOne({ role: 'student' });
        if (!testUser) {
            console.error('❌ No student found in database to test with!');
            process.exit(1);
        }

        console.log(`🎯 Targeting User: ${testUser.name} (${testUser.email})`);

        // 2. Prepare Payload
        const payload = {
            title: 'টেস্ট নোটিফিকেশন!',
            body: 'আপনার নোটিফিকেশন সিস্টেম এখন পুরোপুরি কাজ করছে। অভিনন্দন!',
            url: '/',
            type: 'system'
        };

        // 3. Send via Service
        console.log('🚀 Sending notification...');
        const result = await pushNotificationService.sendToUser(testUser._id, payload);

        console.log('✅ Result:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n✨ SUCCESS! Check the following:');
            console.log('1. Database: A new document should exist in the "notifications" collection.');
            console.log(`2. Dashboard: If user ${testUser.name} is logged in, they should see a toast/alert.`);
        } else {
            console.log('⚠️ Sent, but there might be no push subscriptions for this user yet.');
            console.log('   (In-App notification should still be created anyway)');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Test Failed:', err);
        process.exit(1);
    }
}

RunTest();
