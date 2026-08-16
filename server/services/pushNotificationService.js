const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const NotificationLog = require('../models/NotificationLog');
const Notification = require('../models/Notification');

class PushNotificationService {
    constructor() {
        // VAPID keys should be in environment variables
        // Generate keys using: npx web-push generate-vapid-keys
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
        const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@oddhay.com';

        this.io = null;

        if (vapidPublicKey && vapidPrivateKey) {
            webpush.setVapidDetails(
                vapidSubject,
                vapidPublicKey,
                vapidPrivateKey
            );
            this.isConfigured = true;
            console.log('✅ Web Push configured with VAPID keys');
        } else {
            this.isConfigured = false;
            console.warn('⚠️ VAPID keys not configured. Push notifications will not work.');
            console.warn('   Generate keys with: npx web-push generate-vapid-keys');
        }
    }

    setIo(io) {
        this.io = io;
    }

    // Get VAPID public key
    getPublicKey() {
        return process.env.VAPID_PUBLIC_KEY || '';
    }

    // Save subscription to database
    async saveSubscription(userId, subscription, userAgent = '') {
        try {
            // Detect device type from user agent
            const deviceType = this.detectDeviceType(userAgent);

            // Check if subscription already exists
            let existingSub = await PushSubscription.findOne({ endpoint: subscription.endpoint });

            if (existingSub) {
                // Update existing subscription
                existingSub.user = userId;
                existingSub.keys = subscription.keys;
                existingSub.userAgent = userAgent;
                existingSub.deviceType = deviceType;
                existingSub.isActive = true;
                existingSub.lastUsed = new Date();
                await existingSub.save();
                console.log('✅ Updated existing push subscription');
                return existingSub;
            } else {
                // Create new subscription
                const newSub = new PushSubscription({
                    user: userId,
                    endpoint: subscription.endpoint,
                    keys: subscription.keys,
                    userAgent,
                    deviceType,
                    isActive: true
                });
                await newSub.save();
                console.log('✅ Saved new push subscription');
                return newSub;
            }
        } catch (error) {
            console.error('❌ Error saving subscription:', error);
            throw error;
        }
    }

    // Remove subscription
    async removeSubscription(endpoint) {
        try {
            const result = await PushSubscription.findOneAndUpdate(
                { endpoint },
                { isActive: false },
                { new: true }
            );
            console.log('✅ Deactivated push subscription');
            return result;
        } catch (error) {
            console.error('❌ Error removing subscription:', error);
            throw error;
        }
    }

    // Send notification to a single user
    async sendToUser(userId, notification) {
        try {
            // ALWAYS Create In-App Notification Record FIRST
            const inAppNotification = new Notification({
                user: userId,
                title: notification.title,
                message: notification.body || notification.message || notification.title,
                type: notification.type || 'system',
                link: notification.url || notification.link || '/',
                broadcastId: notification.broadcastId || null
            });
            await inAppNotification.save();

            // Emit Real-time Notification via Socket.io
            if (this.io) {
                this.io.to(`user_${userId}`).emit('notification:new', {
                    _id: inAppNotification._id,
                    title: notification.title,
                    message: notification.body || notification.message,
                    type: inAppNotification.type,
                    link: inAppNotification.link,
                    createdAt: inAppNotification.createdAt
                });
            }

            // Only create individual log if NOT a broadcast
            let notificationLog = null;
            if (!notification.broadcastId) {
                notificationLog = new NotificationLog({
                    user: userId,
                    title: notification.title,
                    body: notification.body || notification.message,
                    type: notification.type || 'custom',
                    icon: notification.icon,
                    url: notification.url || notification.link,
                    data: notification.data,
                    priority: notification.priority || 'normal',
                    campaign: notification.campaign
                });
                await notificationLog.save();
            }

            // Web Push notification attempt (if configured & subscriptions exist)
            if (!this.isConfigured) {
                return { success: true, inAppId: inAppNotification._id, push: 'not_configured' };
            }

            const subscriptions = await PushSubscription.find({
                user: userId,
                isActive: true
            });

            if (subscriptions.length === 0) {
                return { success: true, inAppId: inAppNotification._id, push: 'no_subscriptions' };
            }

            const payload = JSON.stringify({
                title: notification.title,
                body: notification.body || notification.message,
                icon: notification.icon || '/images/icon-192.png',
                badge: notification.badge || '/images/badge-72.png',
                url: notification.url || notification.link || '/',
                tag: notification.tag || 'oddhay-notification',
                requireInteraction: notification.requireInteraction || false,
                data: notification.data || {},
                actions: notification.actions || []
            });

            const results = await Promise.allSettled(
                subscriptions.map(sub =>
                    webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.keys.p256dh,
                            auth: sub.keys.auth
                        }
                    }, payload)
                        .then(() => {
                            sub.markAsUsed();
                            return { success: true, endpoint: sub.endpoint };
                        })
                        .catch(error => {
                            if (error.statusCode === 410 || error.statusCode === 404) {
                                sub.deactivate();
                            }
                            return { success: false, endpoint: sub.endpoint, error: error.message };
                        })
                )
            );

            if (!notification.broadcastId && notificationLog) {
                const successCount = results.filter(r => r.value?.success).length;
                if (successCount > 0) {
                    await notificationLog.markAsSent();
                } else {
                    await notificationLog.markAsFailed('Push subscription failed');
                }
            }

            return {
                success: true,
                total: subscriptions.length,
                inAppId: inAppNotification._id,
                results
            };
        } catch (error) {
            console.error('❌ Error sending notification:', error);
            throw error;
        }
    }

    // Send notification to multiple users
    async sendToMultipleUsers(userIds, notification) {
        const results = await Promise.allSettled(
            userIds.map(userId => this.sendToUser(userId, notification))
        );

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

        return {
            success: successCount > 0,
            total: userIds.length,
            sent: successCount,
            results
        };
    }

    // Send notification to all users with a specific role
    async sendToRole(role, notification) {
        try {
            const User = require('../models/User');
            const users = await User.find({ role }).select('_id');
            const userIds = users.map(u => u._id);

            return await this.sendToMultipleUsers(userIds, notification);
        } catch (error) {
            console.error('❌ Error sending to role:', error);
            throw error;
        }
    }

    // Send notification to all users in a class level
    async sendToClassLevel(classLevel, notification) {
        try {
            const User = require('../models/User');
            const users = await User.find({ classLevel, role: 'student' }).select('_id');
            const userIds = users.map(u => u._id);

            return await this.sendToMultipleUsers(userIds, notification);
        } catch (error) {
            console.error('❌ Error sending to class level:', error);
            throw error;
        }
    }

    // Send notification to all users
    async sendToAll(notification) {
        try {
            const User = require('../models/User');
            const users = await User.find().select('_id');
            const userIds = users.map(u => u._id);

            return await this.sendToMultipleUsers(userIds, notification);
        } catch (error) {
            console.error('❌ Error sending to all users:', error);
            throw error;
        }
    }

    // Detect device type from user agent
    detectDeviceType(userAgent) {
        if (!userAgent) return 'unknown';

        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return 'mobile';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            return 'tablet';
        } else {
            return 'desktop';
        }
    }

    // Get notification statistics
    async getStats(userId = null) {
        try {
            const query = userId ? { user: userId } : {};

            const [total, sent, failed, clicked, subscriptions] = await Promise.all([
                NotificationLog.countDocuments(query),
                NotificationLog.countDocuments({ ...query, status: 'sent' }),
                NotificationLog.countDocuments({ ...query, status: 'failed' }),
                NotificationLog.countDocuments({ ...query, status: 'clicked' }),
                userId
                    ? PushSubscription.countDocuments({ user: userId, isActive: true })
                    : PushSubscription.countDocuments({ isActive: true })
            ]);

            return {
                total,
                sent,
                failed,
                clicked,
                clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(2) : 0,
                activeSubscriptions: subscriptions
            };
        } catch (error) {
            console.error('❌ Error getting stats:', error);
            throw error;
        }
    }
}

module.exports = new PushNotificationService();
