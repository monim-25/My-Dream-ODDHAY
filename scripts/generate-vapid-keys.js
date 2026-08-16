// Generate VAPID keys for Web Push
const webpush = require('web-push');

console.log('\n🔐 Generating VAPID Keys for ODDHAY Push Notifications...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ VAPID Keys Generated Successfully!\n');
console.log('📋 Add these to your .env file:\n');
console.log('─'.repeat(80));
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@oddhay.com`);
console.log('─'.repeat(80));
console.log('\n⚠️  IMPORTANT: Keep the private key secret! Never commit it to version control.\n');
console.log('💡 TIP: Copy the above lines and paste them into your .env file\n');
