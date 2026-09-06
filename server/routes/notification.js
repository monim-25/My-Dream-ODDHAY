const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// Middleware to ensure user is logged in
const userProtect = (req, res, next) => {
    const userId = req.session.userId || (req.session.user ? (req.session.user._id || req.session.user.id) : null);
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    req.userId = userId;
    next();
};

// Get unread count
router.get('/unread-count', userProtect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            user: req.userId,
            isRead: false
        });
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get latest notifications (for quick dropdown)
router.get('/latest', userProtect, async (req, res) => {
    try {
        const userId = req.userId;
        const [notifications, unreadCount] = await Promise.all([
            Notification.find({ user: userId })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            Notification.countDocuments({ user: userId, isRead: false })
        ]);
        
        res.json({ success: true, notifications, unreadCount, userId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get paginated list with filters (for full Notification Center)
router.get('/', userProtect, async (req, res) => {
    try {
        const userId = req.userId;
        const { type, filter, search, page = 1, limit = 20 } = req.query;

        const query = { user: userId };

        if (type && type !== 'all') {
            query.type = type;
        }

        if (filter === 'unread') {
            query.isRead = false;
        } else if (filter === 'read') {
            query.isRead = true;
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [{ title: regex }, { message: regex }];
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit, 10))
                .lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({ user: userId, isRead: false })
        ]);

        res.json({
            success: true,
            notifications,
            total,
            unreadCount,
            page: parseInt(page, 10),
            pages: Math.ceil(total / parseInt(limit, 10))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark all as read
router.post('/mark-all-read', userProtect, async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.userId, isRead: false },
            { isRead: true, readAt: new Date() }
        );
        res.json({ success: true, message: 'All marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark specific as read
router.post('/:id/read', userProtect, async (req, res) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { isRead: true, readAt: new Date() }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete specific notification
router.delete('/:id', userProtect, async (req, res) => {
    try {
        await Notification.findOneAndDelete({
            _id: req.params.id,
            user: req.userId
        });
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear all read notifications
router.delete('/clear/read', userProtect, async (req, res) => {
    try {
        const result = await Notification.deleteMany({
            user: req.userId,
            isRead: true
        });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

