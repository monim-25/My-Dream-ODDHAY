// ODDHAY Push Notification Manager
class PushNotificationManager {
    constructor() {
        this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
        this.registration = null;
        this.subscription = null;
    }

    // Initialize Push Notifications
    async init() {
        if (!this.isSupported) {
            console.warn('Push notifications are not supported in this browser');
            return false;
        }

        try {
            // Register Service Worker
            this.registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });

            console.log('✅ Service Worker registered:', this.registration);

            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;

            // Check existing subscription
            this.subscription = await this.registration.pushManager.getSubscription();

            if (this.subscription) {
                console.log('✅ Already subscribed to push notifications');
                await this.sendSubscriptionToServer(this.subscription);
            }

            return true;
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            return false;
        }
    }

    // Request notification permission
    async requestPermission() {
        if (!this.isSupported) {
            this.showNotificationUI('error', 'আপনার ব্রাউজার নোটিফিকেশন সাপোর্ট করে না');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                console.log('✅ Notification permission granted');
                await this.subscribe();
                return true;
            } else if (permission === 'denied') {
                console.log('❌ Notification permission denied');
                this.showNotificationUI('error', 'নোটিফিকেশন অনুমতি প্রত্যাখ্যান করা হয়েছে');
                return false;
            } else {
                console.log('⚠️ Notification permission dismissed');
                return false;
            }
        } catch (error) {
            console.error('❌ Error requesting permission:', error);
            return false;
        }
    }

    // Subscribe to push notifications
    async subscribe() {
        if (!this.registration) {
            await this.init();
        }

        try {
            // Get VAPID public key from server
            const response = await fetch('/api/push/vapid-public-key');
            const { publicKey } = await response.json();

            // Convert VAPID key
            const convertedVapidKey = this.urlBase64ToUint8Array(publicKey);

            // Subscribe to push notifications
            this.subscription = await this.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            console.log('✅ Subscribed to push notifications:', this.subscription);

            // Send subscription to server
            await this.sendSubscriptionToServer(this.subscription);

            this.showNotificationUI('success', 'নোটিফিকেশন চালু করা হয়েছে! 🔔');
            return this.subscription;
        } catch (error) {
            console.error('❌ Failed to subscribe:', error);
            this.showNotificationUI('error', 'নোটিফিকেশন চালু করতে ব্যর্থ হয়েছে');
            return null;
        }
    }

    // Unsubscribe from push notifications
    async unsubscribe() {
        if (!this.subscription) {
            this.subscription = await this.registration.pushManager.getSubscription();
        }

        if (this.subscription) {
            try {
                await this.subscription.unsubscribe();
                await this.removeSubscriptionFromServer(this.subscription);
                this.subscription = null;
                console.log('✅ Unsubscribed from push notifications');
                this.showNotificationUI('success', 'নোটিফিকেশন বন্ধ করা হয়েছে');
                return true;
            } catch (error) {
                console.error('❌ Failed to unsubscribe:', error);
                return false;
            }
        }
        return false;
    }

    // Check subscription status
    async isSubscribed() {
        if (!this.registration) {
            await this.init();
        }

        this.subscription = await this.registration.pushManager.getSubscription();
        return this.subscription !== null;
    }

    // Send subscription to server
    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });

            if (response.ok) {
                console.log('✅ Subscription sent to server');
                return true;
            } else {
                console.error('❌ Failed to send subscription to server');
                return false;
            }
        } catch (error) {
            console.error('❌ Error sending subscription:', error);
            return false;
        }
    }

    // Remove subscription from server
    async removeSubscriptionFromServer(subscription) {
        try {
            const response = await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });

            if (response.ok) {
                console.log('✅ Subscription removed from server');
                return true;
            }
        } catch (error) {
            console.error('❌ Error removing subscription:', error);
            return false;
        }
    }

    // Test notification
    async testNotification() {
        if (Notification.permission === 'granted' && this.registration) {
            this.registration.showNotification('ODDHAY পরীক্ষা নোটিফিকেশন', {
                body: 'আপনার নোটিফিকেশন সঠিকভাবে কাজ করছে! ✅',
                icon: '/images/icon-192.png',
                badge: '/images/badge-72.png',
                vibrate: [200, 100, 200],
                tag: 'test-notification',
                requireInteraction: false
            });
        }
    }

    // Helper: Convert VAPID key
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // Show notification UI feedback
    showNotificationUI(type, message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl transform transition-all duration-300 translate-y-0 ${type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`;
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined">
                    ${type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span class="font-bold">${message}</span>
            </div>
        `;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('translate-y-0'), 10);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Global instance
window.pushManager = new PushNotificationManager();

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.pushManager.init();
});
