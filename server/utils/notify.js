const pushNotificationService = require('../services/pushNotificationService');
const User = require('../models/User');

/**
 * Send notification to a single user
 * @param {string|ObjectId} userId 
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.type='system'] - 'payment' | 'course' | 'exam' | 'announcement' | 'system' | 'reminder'
 * @param {string} [options.link='/'] - URL to redirect on click
 * @param {string} [options.icon] - Optional icon
 */
async function notifyUser(userId, { title, message, type = 'system', link = '/', icon = null }) {
    try {
        if (!userId) return null;
        return await pushNotificationService.sendToUser(userId, {
            title,
            body: message,
            message,
            type,
            url: link,
            link,
            icon
        });
    } catch (err) {
        console.error('❌ notifyUser error:', err.message);
        return null;
    }
}

/**
 * Send notification to multiple users
 * @param {Array<string|ObjectId>} userIds 
 * @param {Object} options 
 */
async function notifyMultipleUsers(userIds, { title, message, type = 'system', link = '/', icon = null }) {
    try {
        if (!Array.isArray(userIds) || userIds.length === 0) return [];
        const promises = userIds.map(uid => notifyUser(uid, { title, message, type, link, icon }));
        return await Promise.allSettled(promises);
    } catch (err) {
        console.error('❌ notifyMultipleUsers error:', err.message);
        return [];
    }
}

/**
 * Send notification to all users of a specific role (e.g. 'student', 'teacher')
 * @param {string} role 
 * @param {Object} options 
 */
async function notifyRole(role, { title, message, type = 'system', link = '/', icon = null }) {
    try {
        const users = await User.find({ role, isActive: { $ne: false } }).select('_id').lean();
        const userIds = users.map(u => u._id);
        return await notifyMultipleUsers(userIds, { title, message, type, link, icon });
    } catch (err) {
        console.error('❌ notifyRole error:', err.message);
        return [];
    }
}

module.exports = {
    notifyUser,
    notifyMultipleUsers,
    notifyRole
};
