// 🔔 ODDHAY Notification System - Quick Test Script
// Copy and paste this in your browser console (F12) on your Vercel site

console.log('🚀 Starting ODDHAY Notification Test...\n');

// Test Configuration
const tests = {
    passed: 0,
    failed: 0,
    total: 0
};

// Helper function to log results
function logTest(name, passed, details = '') {
    tests.total++;
    if (passed) {
        tests.passed++;
        console.log(`✅ ${name}`, details);
    } else {
        tests.failed++;
        console.error(`❌ ${name}`, details);
    }
}

// Test 1: Check Service Worker Support
async function testServiceWorkerSupport() {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    logTest('Service Worker Support', supported, supported ? '' : 'Browser does not support push notifications');
    return supported;
}

// Test 2: Check Service Worker Registration
async function testServiceWorkerRegistration() {
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        const isRegistered = !!registration;
        logTest('Service Worker Registration', isRegistered, 
            isRegistered ? `Scope: ${registration.scope}` : 'Not registered');
        return registration;
    } catch (error) {
        logTest('Service Worker Registration', false, error.message);
        return null;
    }
}

// Test 3: Check Notification Permission
async function testNotificationPermission() {
    const permission = Notification.permission;
    const granted = permission === 'granted';
    logTest('Notification Permission', granted, 
        `Status: ${permission}${!granted ? ' - Click "Allow" when prompted' : ''}`);
    return granted;
}

// Test 4: Check Push Subscription
async function testPushSubscription() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const isSubscribed = !!subscription;
        logTest('Push Subscription', isSubscribed, 
            isSubscribed ? `Endpoint: ${subscription.endpoint.substring(0, 50)}...` : 'Not subscribed');
        return subscription;
    } catch (error) {
        logTest('Push Subscription', false, error.message);
        return null;
    }
}

// Test 5: Check VAPID Public Key
async function testVapidKey() {
    try {
        const response = await fetch('/api/push/vapid-public-key');
        const data = await response.json();
        const hasKey = !!data.publicKey && data.publicKey.length > 0;
        logTest('VAPID Public Key', hasKey, 
            hasKey ? `Key: ${data.publicKey.substring(0, 20)}...` : 'Key not configured');
        return data.publicKey;
    } catch (error) {
        logTest('VAPID Public Key', false, error.message);
        return null;
    }
}

// Test 6: Check Notification Stats API
async function testStatsAPI() {
    try {
        const response = await fetch('/api/push/stats');
        const data = await response.json();
        const success = data.success && data.stats;
        logTest('Stats API', success, 
            success ? `Active Subscriptions: ${data.stats.activeSubscriptions}, Total Sent: ${data.stats.total}` : 'Failed to fetch stats');
        return data;
    } catch (error) {
        logTest('Stats API', false, error.message);
        return null;
    }
}

// Test 7: Send Test Notification
async function testSendNotification() {
    try {
        console.log('\n📤 Sending test notification...');
        const response = await fetch('/api/push/test', { method: 'POST' });
        const data = await response.json();
        const success = data.success;
        logTest('Send Test Notification', success, 
            success ? 'Check your notifications!' : data.error || 'Failed to send');
        return data;
    } catch (error) {
        logTest('Send Test Notification', false, error.message);
        return null;
    }
}

// Test 8: Request Permission (if not granted)
async function requestPermission() {
    if (Notification.permission === 'default') {
        console.log('\n🔔 Requesting notification permission...');
        const permission = await Notification.requestPermission();
        logTest('Permission Request', permission === 'granted', `Result: ${permission}`);
        return permission === 'granted';
    }
    return Notification.permission === 'granted';
}

// Test 9: Subscribe to Push (if not subscribed)
async function subscribeToPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            console.log('\n📝 Subscribing to push notifications...');
            const vapidResponse = await fetch('/api/push/vapid-public-key');
            const { publicKey } = await vapidResponse.json();
            
            const newSubscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: publicKey
            });
            
            // Save subscription to server
            const saveResponse = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSubscription)
            });
            
            const saveData = await saveResponse.json();
            logTest('Push Subscription', saveData.success, 
                saveData.success ? 'Successfully subscribed!' : saveData.error);
            return saveData.success;
        }
        return true;
    } catch (error) {
        logTest('Push Subscription', false, error.message);
        return false;
    }
}

// Main Test Runner
async function runAllTests() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔔 ODDHAY NOTIFICATION SYSTEM TEST');
    console.log('═══════════════════════════════════════════════════\n');
    
    // Phase 1: Basic Checks
    console.log('📋 Phase 1: Basic Compatibility Checks\n');
    const supported = await testServiceWorkerSupport();
    if (!supported) {
        console.error('\n❌ Browser does not support push notifications!');
        console.log('Please use Chrome, Firefox, or Edge (latest versions)');
        return;
    }
    
    await testServiceWorkerRegistration();
    await testNotificationPermission();
    await testVapidKey();
    
    // Phase 2: Subscription Status
    console.log('\n📋 Phase 2: Subscription Status\n');
    const subscription = await testPushSubscription();
    await testStatsAPI();
    
    // Phase 3: Setup (if needed)
    console.log('\n📋 Phase 3: Setup & Configuration\n');
    const hasPermission = await requestPermission();
    if (hasPermission && !subscription) {
        await subscribeToPush();
    }
    
    // Phase 4: Functional Test
    console.log('\n📋 Phase 4: Functional Testing\n');
    if (hasPermission) {
        await testSendNotification();
    } else {
        console.warn('⚠️ Cannot send test notification without permission');
    }
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Total Tests: ${tests.total}`);
    console.log(`✅ Passed: ${tests.passed}`);
    console.log(`❌ Failed: ${tests.failed}`);
    console.log(`Success Rate: ${((tests.passed / tests.total) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════════\n');
    
    if (tests.failed === 0) {
        console.log('🎉 All tests passed! Your notification system is working perfectly!');
        console.log('\n💡 Next Steps:');
        console.log('1. Check your browser notifications');
        console.log('2. Try sending from Admin Panel: /admin/notifications');
        console.log('3. Test on multiple devices');
    } else {
        console.log('⚠️ Some tests failed. Check the errors above.');
        console.log('\n🔧 Common Solutions:');
        console.log('1. Ensure VAPID keys are set in Vercel environment variables');
        console.log('2. Grant notification permission when prompted');
        console.log('3. Check that you are logged in');
        console.log('4. Verify HTTPS is enabled (Vercel auto-enables this)');
    }
}

// Auto-run tests
runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
});

// Export helper functions for manual testing
window.notificationTest = {
    runAll: runAllTests,
    checkSupport: testServiceWorkerSupport,
    checkRegistration: testServiceWorkerRegistration,
    checkPermission: testNotificationPermission,
    checkSubscription: testPushSubscription,
    checkVapid: testVapidKey,
    checkStats: testStatsAPI,
    sendTest: testSendNotification,
    requestPermission: requestPermission,
    subscribe: subscribeToPush
};

console.log('\n💡 Tip: You can run individual tests using:');
console.log('   window.notificationTest.sendTest()');
console.log('   window.notificationTest.checkStats()');
console.log('   etc.\n');
