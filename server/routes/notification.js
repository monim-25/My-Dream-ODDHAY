const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../routes/auth'); // Assuming protect middleware exists

// Middleware to ensure user is logged in
const userProtect = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Get unread count
router.get('/unread-count', userProtect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            user: req.session.user._id,
            isRead: false
        });
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get latest notifications
router.get('/latest', userProtect, async (req, res) => {
    try {
        const notifications = await Notification.find({
            user: req.session.user._id
        })
        .sort({ createdAt: -1 })
        .limit(10);
        
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark all as read
router.post('/mark-all-read', userProtect, async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.session.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark specific as read
router.post('/:id/read', userProtect, async (req, res) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.session.user._id },
            { isRead: true }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
