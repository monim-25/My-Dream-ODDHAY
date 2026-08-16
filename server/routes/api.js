// ---- Push Notification API ----
const express = require('express');
const router = express.Router();
const { connectDB, protect, adminProtect, superAdminProtect, User, Notification, NotificationLog, Message } = require('../config');
const pushNotificationService = require('../services/pushNotificationService');

// ---- Push Notification API ----
router.get('/push/vapid-public-key', (req, res) => res.json({ publicKey: pushNotificationService.getPublicKey() }));

router.post('/push/subscribe', protect, async (req, res) => {
    try {
        await pushNotificationService.saveSubscription(req.session.userId, req.body, req.headers['user-agent'] || '');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/push/unsubscribe', protect, async (req, res) => {
    try {
        await pushNotificationService.removeSubscription(req.body.endpoint);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/push/test', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const result = await pushNotificationService.sendToUser(req.session.userId, { title: 'ODDHAY পরীক্ষা নোটিফিকেশন', body: `হ্যালো ${user.name}! নোটিফিকেশন কাজ করছে ✅`, icon: '/images/icon-192.png', url: '/dashboard', type: 'system' });
        res.json({ success: true, result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/push/send-to-user', adminProtect, async (req, res) => {
    try {
        const { userId, title, body, url, type, priority } = req.body;
        if (!userId || !title || !body) return res.status(400).json({ error: 'Missing fields' });
        await new Notification({ user: userId, title, message: body, type: type || 'system', link: url || '/dashboard' }).save();
        const result = await pushNotificationService.sendToUser(userId, { title, body, url: url || '/dashboard', type: type || 'custom', priority: priority || 'normal' });
        const io = req.app.get('io');
        if (io) io.emit('new_notice', { target: 'user', userId, title, body, url: url || '/dashboard', type: type || 'system' });
        res.json({ success: true, result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/push/send-to-role', adminProtect, async (req, res) => {
    try {
        const { role, title, body, url, type, priority } = req.body;
        if (!role || !title || !body) return res.status(400).json({ error: 'Missing fields' });
        const users = await User.find({ role });
        if (users.length > 0) await Notification.insertMany(users.map(u => ({ user: u._id, title, message: body, type: type || 'system', link: url || '/dashboard' })));
        const result = await pushNotificationService.sendToRole(role, { title, body, url: url || '/dashboard', type: type || 'custom', priority: priority || 'normal' });
        const io = req.app.get('io');
        if (io) io.emit('new_notice', { target: 'role', role, title, body, url: url || '/dashboard', type: type || 'system' });
        res.json({ success: true, result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/push/send-to-class', adminProtect, async (req, res) => {
    try {
        const { classLevel, title, body, url, type, priority } = req.body;
        if (!classLevel || !title || !body) return res.status(400).json({ error: 'Missing fields' });
        const users = await User.find({ classLevel, role: 'student' });
        if (users.length > 0) await Notification.insertMany(users.map(u => ({ user: u._id, title, message: body, type: type || 'system', link: url || '/dashboard' })));
        const result = await pushNotificationService.sendToClassLevel(classLevel, { title, body, url: url || '/dashboard', type: type || 'custom', priority: priority || 'normal' });
        const io = req.app.get('io');
        if (io) io.emit('new_notice', { target: 'class', classLevel, title, body, url: url || '/dashboard', type: type || 'system' });
        res.json({ success: true, result });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- In-App Notifications ----
router.get('/notifications', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.session.user._id }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, notifications });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/notifications/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, user: req.session.user._id });
        if (!notification) return res.status(404).json({ success: false, error: 'Not found' });
        notification.isRead = true;
        await notification.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/notifications/mark-all-read', protect, async (req, res) => {
    try {
        await Notification.updateMany({ user: req.session.user._id, isRead: false }, { isRead: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/notifications/clear-all', protect, async (req, res) => {
    try {
        await Notification.deleteMany({ user: req.session.user._id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Admin User Search API ----
router.get('/admin/users/search', superAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const query = req.query.q || '';
        if (query.length < 2) return res.json({ success: true, users: [] });

        const users = await User.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        }).limit(20).select('name email role createdAt').lean();

        res.json({ success: true, users });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/chat/unread', protect, async (req, res) => {
    try {
        await connectDB();
        const count = await Message.countDocuments({ receiver: req.session.userId, isRead: false });
        res.json({ success: true, count });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/chat/mark-read', protect, async (req, res) => {
    try {
        await connectDB();
        await Message.updateMany({ room: req.body.room, receiver: req.session.userId, isRead: false }, { isRead: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Student-Teacher Direct Messaging API ----
router.get('/messages/thread/:targetUserId', protect, async (req, res) => {
    try {
        await connectDB();
        const myId = req.session.userId;
        const targetId = req.params.targetUserId;
        const mongoose = require('mongoose');

        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ success: false, error: 'Invalid target user ID' });
        }

        const messages = await Message.find({
            $or: [
                { sender: myId, receiver: targetId },
                { sender: targetId, receiver: myId }
            ]
        }).sort({ createdAt: 1 }).limit(100).lean();

        // Mark incoming messages as read
        await Message.updateMany(
            { sender: targetId, receiver: myId, isRead: false },
            { $set: { isRead: true } }
        );

        res.json({ success: true, messages });
    } catch (err) {
        console.error('Thread fetch error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/messages/send', protect, async (req, res) => {
    try {
        await connectDB();
        const myId = req.session.userId;
        const { targetUserId, text } = req.body;
        const mongoose = require('mongoose');

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: 'Message cannot be empty' });
        }

        if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(400).json({ success: false, error: 'Invalid target recipient' });
        }

        const sender = await User.findById(myId).populate('enrolledCourses.course').lean();
        const receiver = await User.findById(targetUserId).lean();

        if (!sender || !receiver) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Policy: Student <-> Teacher only
        if (sender.role === 'student') {
            if (receiver.role !== 'teacher') {
                return res.status(403).json({ success: false, error: 'Students can only contact instructors.' });
            }

            // Verify student eligibility (paid course or package)
            const Payment = require('../models/Payment');
            const hasPaidCourse = (sender.enrolledCourses || []).some(ec => {
                const c = ec.course;
                return c && (c.accessType === 'paid' || c.price > 0 || c.discountPrice > 0 || (c.plans && c.plans.length > 0 && c.plans[0].price > 0));
            });

            const hasPaidPayment = await Payment.exists({
                user: sender._id,
                status: { $in: ['success', 'approved'] },
                itemType: { $in: ['course', 'package'] }
            });

            if (!hasPaidCourse && !hasPaidPayment) {
                return res.status(403).json({
                    success: false,
                    error: 'Direct instructor messaging is exclusively available for enrolled students in paid courses or packages.'
                });
            }
        } else if (sender.role === 'teacher') {
            if (receiver.role !== 'student') {
                return res.status(403).json({ success: false, error: 'Instructors can only message students.' });
            }
        } else {
            return res.status(403).json({ success: false, error: 'Messaging restricted to students and teachers.' });
        }

        const roomKey = [myId.toString(), targetUserId.toString()].sort().join('_');
        const newMsg = await Message.create({
            sender: sender._id,
            senderName: sender.name,
            senderRole: sender.role,
            userAvatar: sender.profilePicture || sender.profileImage || null,
            receiver: receiver._id,
            room: roomKey,
            text: text.trim().substring(0, 1000),
            isRead: false
        });

        res.json({ success: true, message: newMsg });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/messages/mark-read/:senderId', protect, async (req, res) => {
    try {
        await connectDB();
        const myId = req.session.userId;
        const senderId = req.params.senderId;

        await Message.updateMany(
            { sender: senderId, receiver: myId, isRead: false },
            { $set: { isRead: true } }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---- Curriculum Node Views & Comments ----

router.post('/course/:courseId/progress/:nodeId', protect, async (req, res) => {
    try {
        await connectDB();
        const CourseProgress = require('../models/CourseProgress');
        const { progress, completed } = req.body;
        
        let cp = await CourseProgress.findOne({ userId: req.session.user._id, courseId: req.params.courseId });
        if (!cp) {
            cp = new CourseProgress({
                userId: req.session.user._id,
                courseId: req.params.courseId
            });
        }
        
        if (progress !== undefined) {
            cp.progressMap.set(req.params.nodeId, progress);
        }
        if (completed && !cp.completedNodes.includes(req.params.nodeId)) {
            cp.completedNodes.push(req.params.nodeId);
        }
        
        cp.lastAccessed = Date.now();
        await cp.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/curriculum/node/:nodeId/view', protect, async (req, res) => {
    try {
        await connectDB();
        const Course = require('../models/Course');
        const course = await Course.findOneAndUpdate(
            { "curriculumNodes._id": req.params.nodeId },
            { $inc: { "curriculumNodes.$.views": 1 } },
            { new: true }
        );
        if (!course) return res.status(404).json({ success: false, error: 'Curriculum node not found' });
        
        // Find the specific node to return the updated view count
        const node = course.curriculumNodes.id(req.params.nodeId);
        res.json({ success: true, views: node ? (node.views || 0) : 0 });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/curriculum/node/:nodeId/comments', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const Course = require('../models/Course');
        const limit = parseInt(req.query.limit) || 10;
        const skip = parseInt(req.query.skip) || 0;

        // Check if comments are disabled for students
        const course = await Course.findOne({ "curriculumNodes._id": req.params.nodeId });
        let commentsDisabled = false;
        if (course) {
            const node = course.curriculumNodes.id(req.params.nodeId);
            if (node) commentsDisabled = !!node.commentsDisabled;
        }

        const total = await Comment.countDocuments({ nodeId: req.params.nodeId });
        const comments = await Comment.find({ nodeId: req.params.nodeId })
            .populate('user', 'name profilePicture profileImage role')
            .sort({ highlighted: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.json({ success: true, comments, hasMore: skip + comments.length < total, commentsDisabled });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/curriculum/node/:nodeId/comments', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const Course = require('../models/Course');
        const { text, courseId } = req.body;
        const user = req.session.user;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Comment text cannot be empty' });
        if (!courseId) return res.status(400).json({ success: false, error: 'Course ID is required' });

        // Check if comments are disabled for students
        const course = await Course.findOne({ "curriculumNodes._id": req.params.nodeId });
        if (course) {
            const node = course.curriculumNodes.id(req.params.nodeId);
            if (node && node.commentsDisabled && user.role === 'student') {
                return res.status(403).json({ success: false, error: 'Comments are disabled for this lesson.' });
            }
        }

        const comment = await Comment.create({
            nodeId: req.params.nodeId,
            courseId,
            user: req.session.user._id,
            userName: user.name,
            userAvatar: user.profileImage || user.profilePicture || '/images/default-avatar.png',
            text: text.trim()
        });

        res.json({ success: true, comment });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Toggle comments disabled for a node ----
router.post('/curriculum/node/:nodeId/toggle-comments', protect, async (req, res) => {
    try {
        await connectDB();
        const Course = require('../models/Course');
        const user = req.session.user;

        // Security check: only teacher or admin/superadmin can toggle
        if (!['teacher', 'admin', 'superadmin'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const course = await Course.findOne({ "curriculumNodes._id": req.params.nodeId });
        if (!course) return res.status(404).json({ success: false, error: 'Node not found' });

        const node = course.curriculumNodes.id(req.params.nodeId);
        if (!node) return res.status(404).json({ success: false, error: 'Node not found' });

        // Toggle state
        node.commentsDisabled = !node.commentsDisabled;
        await course.save();

        res.json({ success: true, commentsDisabled: node.commentsDisabled });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Toggle highlight state of a comment ----
router.post('/curriculum/comment/:commentId/toggle-highlight', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const user = req.session.user;

        // Security check: Only teacher or admin can highlight comments
        if (!['teacher', 'admin', 'superadmin'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Unauthorized to highlight comments' });
        }

        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const newState = !comment.highlighted;

        // If trying to highlight, enforce a max limit of 3 highlighted comments per node
        if (newState) {
            const count = await Comment.countDocuments({ nodeId: comment.nodeId, highlighted: true });
            if (count >= 3) {
                return res.status(400).json({ success: false, error: 'Maximum 3 comments can be highlighted at once. Please unhighlight another comment first.' });
            }
        }

        comment.highlighted = newState;
        await comment.save();

        res.json({ success: true, highlighted: comment.highlighted });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/curriculum/comment/:commentId/reply', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const { text } = req.body;
        const user = req.session.user;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Reply text cannot be empty' });

        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = {
            user: user._id,
            userName: user.name,
            userAvatar: user.profileImage || user.profilePicture || '/images/default-avatar.png',
            text: text.trim(),
            createdAt: new Date()
        };

        comment.replies.push(reply);
        await comment.save();

        res.json({ success: true, reply });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Update parent comment text ----
router.put('/curriculum/comment/:commentId', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Text cannot be empty' });

        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        // Security check: Must be the original author
        if (comment.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to edit this comment' });
        }

        comment.text = text.trim();
        await comment.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Update sub-reply text ----
router.put('/curriculum/comment/:commentId/reply/:replyId', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Text cannot be empty' });

        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = comment.replies.id(req.params.replyId);
        if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

        // Security check: Must be the original author of the reply
        if (reply.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to edit this reply' });
        }

        reply.text = text.trim();
        await comment.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Delete parent comment ----
router.delete('/curriculum/comment/:commentId', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        // Security check: Must be the original author
        if (comment.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to delete this comment' });
        }

        await Comment.deleteOne({ _id: req.params.commentId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Delete sub-reply ----
router.delete('/curriculum/comment/:commentId/reply/:replyId', protect, async (req, res) => {
    try {
        await connectDB();
        const Comment = require('../models/Comment');
        const comment = await Comment.findById(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = comment.replies.id(req.params.replyId);
        if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

        // Security check: Must be the original author of the reply
        if (reply.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to delete this reply' });
        }

        comment.replies.pull(req.params.replyId);
        await comment.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==========================================
// LIVE CLASSROOM COMMENT (MESSAGE) API
// ==========================================

// GET all messages for a live room (used to restore comments on page refresh)
router.get('/live-comment', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const room = req.query.room;
        if (!room) return res.status(400).json({ success: false, error: 'Room ID required' });
        const messages = await Message.find({ room })
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.json({ success: true, messages });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST reply to a live comment
router.post('/live-comment/:msgId/reply', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const { text } = req.body;
        const user = req.session.user;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Reply text cannot be empty' });

        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = {
            user: user._id,
            userName: user.name,
            userAvatar: user.profileImage || user.profilePicture || '/images/default-avatar.png',
            userRole: user.role || 'student',
            text: text.trim(),
            createdAt: new Date()
        };

        message.replies.push(reply);
        await message.save();

        // Get full formatted comment to return to client
        const updatedMsg = await Message.findById(req.params.msgId).populate('replies.user', 'role').lean();
        if (updatedMsg && updatedMsg.replies) {
            updatedMsg.replies = updatedMsg.replies.map(r => {
                if (r.user && typeof r.user === 'object') return r;
                return { ...r, user: { _id: r.user, role: r.userRole || 'student' } };
            });
        }

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('reply:new', { commentId: message._id.toString(), reply, comment: updatedMsg });

        res.json({ success: true, reply, comment: updatedMsg });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST toggle highlight state of a live comment
router.post('/live-comment/:msgId/toggle-highlight', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const user = req.session.user;

        // Security check: Only teacher or admin can highlight comments
        if (!['teacher', 'admin', 'superadmin'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Unauthorized to highlight comments' });
        }

        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        message.highlighted = !message.highlighted;
        await message.save();

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('message:highlight', { commentId: message._id.toString(), highlighted: message.highlighted });

        res.json({ success: true, highlighted: message.highlighted });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update live comment text
router.put('/live-comment/:msgId', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Text cannot be empty' });

        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        // Security check: Must be the original author
        if (message.sender.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to edit this comment' });
        }

        message.text = text.trim();
        await message.save();

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('message:update', { commentId: message._id.toString(), text: message.text });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT update live comment reply text
router.put('/live-comment/:msgId/reply/:replyId', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ success: false, error: 'Text cannot be empty' });

        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = message.replies.id(req.params.replyId);
        if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

        // Security check: Must be the original author of the reply
        if (reply.user.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Unauthorized to edit this reply' });
        }

        reply.text = text.trim();
        await message.save();

        const updatedMsg = await Message.findById(req.params.msgId).populate('replies.user', 'role').lean();
        if (updatedMsg && updatedMsg.replies) {
            updatedMsg.replies = updatedMsg.replies.map(r => {
                if (r.user && typeof r.user === 'object') return r;
                return { ...r, user: { _id: r.user, role: r.userRole || 'student' } };
            });
        }

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('reply:update', { commentId: message._id.toString(), replyId: req.params.replyId, updatedComment: updatedMsg });

        res.json({ success: true, comment: updatedMsg });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE live comment
router.delete('/live-comment/:msgId', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        // Security check: Must be the original author or a moderator
        const isModerator = ['teacher', 'admin', 'superadmin'].includes(req.session.user.role);
        if (message.sender.toString() !== req.session.user._id.toString() && !isModerator) {
            return res.status(403).json({ success: false, error: 'Unauthorized to delete this comment' });
        }

        await Message.deleteOne({ _id: req.params.msgId });

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('message:delete', { commentId: req.params.msgId });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE live comment reply
router.delete('/live-comment/:msgId/reply/:replyId', protect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const message = await Message.findById(req.params.msgId);
        if (!message) return res.status(404).json({ success: false, error: 'Comment not found' });

        const reply = message.replies.id(req.params.replyId);
        if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

        // Security check: Must be the original author of the reply or a moderator
        const isModerator = ['teacher', 'admin', 'superadmin'].includes(req.session.user.role);
        if (reply.user.toString() !== req.session.user._id.toString() && !isModerator) {
            return res.status(403).json({ success: false, error: 'Unauthorized to delete this reply' });
        }

        message.replies.pull(req.params.replyId);
        await message.save();

        const updatedMsg = await Message.findById(req.params.msgId).populate('replies.user', 'role').lean();
        if (updatedMsg && updatedMsg.replies) {
            updatedMsg.replies = updatedMsg.replies.map(r => {
                if (r.user && typeof r.user === 'object') return r;
                return { ...r, user: { _id: r.user, role: r.userRole || 'student' } };
            });
        }

        const io = req.app.get('io');
        if (io) io.to(message.room).emit('reply:delete', { commentId: req.params.msgId, replyId: req.params.replyId, updatedComment: updatedMsg });

        res.json({ success: true, comment: updatedMsg });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Daily Activity & Progress Tracking ----
router.get('/daily-stats', protect, async (req, res) => {
    try {
        await connectDB();
        const User = require('../models/User');
        const user = await User.findById(req.session.userId).lean();
        if (!user) return res.status(404).json({ success: false });

        const todayStr = new Date().toISOString().split('T')[0];
        let dailyGoals = user.dailyGoals || {};
        if (dailyGoals.date !== todayStr) {
            dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, savedNotesCount: 0, activeMinutes: 0, todayXpEarned: 0 };
        }

        res.json({
            success: true,
            todayVideosCount: dailyGoals.videosCount || 0,
            todayQuizzesCount: dailyGoals.quizzesCount || 0,
            todayNotesCount: dailyGoals.notesCount || 0,
            todaySavedNotesCount: dailyGoals.savedNotesCount || 0,
            todayActiveMinutes: dailyGoals.activeMinutes || 0,
            todayXpEarned: dailyGoals.todayXpEarned || 0,
            totalXP: user.totalXP || 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Active Time Heartbeat Ping (Triggers every 60s when user is active on site)
router.post('/active-heartbeat', protect, async (req, res) => {
    try {
        await connectDB();
        const User = require('../models/User');
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false });

        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.dailyGoals || user.dailyGoals.date !== todayStr) {
            user.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, savedNotesCount: 0, activeMinutes: 0, todayXpEarned: 0, todayWatchedLessons: [] };
        }

        // Each active minute awards +1 activeMinute and +1 XP
        user.dailyGoals.activeMinutes = (user.dailyGoals.activeMinutes || 0) + 1;
        user.dailyGoals.todayXpEarned = (user.dailyGoals.todayXpEarned || 0) + 1;
        user.totalXP = (user.totalXP || 0) + 1;
        user.markModified('dailyGoals');
        await user.save();

        res.json({
            success: true,
            activeMinutes: user.dailyGoals.activeMinutes,
            todayXpEarned: user.dailyGoals.todayXpEarned,
            totalXP: user.totalXP
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/progress', protect, async (req, res) => {
    try {
        await connectDB();
        const { lessonId, courseId, lessonTitle, lastPosition, isPlayEvent } = req.body;
        const User = require('../models/User');
        const Course = require('../models/Course');
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.dailyGoals || user.dailyGoals.date !== todayStr) {
            user.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, todayXpEarned: 0, todayWatchedLessons: [] };
        }

        // Each video play event adds +30 XP and +1 videosCount
        if (isPlayEvent) {
            user.dailyGoals.videosCount = (user.dailyGoals.videosCount || 0) + 1;
            user.dailyGoals.todayXpEarned = (user.dailyGoals.todayXpEarned || 0) + 30;
            user.totalXP = (user.totalXP || 0) + 30;
            if (lessonId && !user.dailyGoals.todayWatchedLessons.includes(lessonId)) {
                user.dailyGoals.todayWatchedLessons.push(lessonId);
            }
        }

        if (lessonId && !user.completedLessons.includes(lessonId)) {
            user.completedLessons.push(lessonId);
        }

        if (courseId) {
            const currentPos = lastPosition !== undefined ? Number(lastPosition) : (user.lastWatchedLesson?.lastPosition || 0);
            
            let lessonThumbnail = req.body.thumbnail || '';
            if (!lessonThumbnail && lessonId) {
                const courseObj = await Course.findById(courseId).lean();
                if (courseObj && courseObj.curriculumNodes) {
                    const node = courseObj.curriculumNodes.find(n => String(n._id) === String(lessonId));
                    if (node && node.thumbnail) {
                        lessonThumbnail = node.thumbnail;
                    }
                }
            }

            user.lastWatchedLesson = {
                course: courseId,
                lessonId: lessonId || null,
                lessonTitle: lessonTitle || 'Lesson',
                thumbnail: lessonThumbnail || '',
                lastPosition: currentPos,
                watchedAt: new Date()
            };

            const enrollment = user.enrolledCourses.find(e => e.course && e.course.toString() === courseId.toString());
            if (enrollment) {
                const course = await Course.findById(courseId);
                if (course) {
                    let totalLessons = 0, completedForCourse = 0;
                    if (course.chapters?.length > 0) {
                        totalLessons += course.chapters.reduce((acc, ch) => acc + (ch.recordedClasses?.length || 0) + (ch.notes?.length || 0) + (ch.quizzes?.length || 0), 0);
                        completedForCourse += user.completedLessons.filter(cl => course.chapters.some(ch => 
                            ch.recordedClasses?.some(rc => rc._id.toString() === cl.toString()) ||
                            ch.notes?.some(n => n._id.toString() === cl.toString()) ||
                            ch.quizzes?.some(q => q.toString() === cl.toString())
                        )).length;
                    }
                    if (course.curriculumNodes?.length > 0) {
                        const items = course.curriculumNodes.filter(n => ['video', 'note', 'quiz'].includes(n.type));
                        totalLessons += items.length;
                        completedForCourse += user.completedLessons.filter(cl => items.some(i => (i._id && i._id.toString() === cl.toString()) || (i.quizId && i.quizId.toString() === cl.toString()))).length;
                    }
                    enrollment.progress = totalLessons > 0 ? Math.round((completedForCourse / totalLessons) * 100) : 0;
                }
            }
        }

        user.markModified('dailyGoals');
        user.markModified('lastWatchedLesson');
        user.markModified('enrolledCourses');
        await user.save();
        res.json({ success: true, videosCount: user.dailyGoals.videosCount, todayXpEarned: user.dailyGoals.todayXpEarned, totalXP: user.totalXP });
    } catch (err) {
        console.error('Progress save error:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/track-activity', protect, async (req, res) => {
    try {
        await connectDB();
        const { type } = req.body;
        const User = require('../models/User');
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false });

        const todayStr = new Date().toISOString().split('T')[0];
        if (!user.dailyGoals || user.dailyGoals.date !== todayStr) {
            user.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, savedNotesCount: 0, activeMinutes: 0, todayXpEarned: 0, todayWatchedLessons: [] };
        }

        let addedXP = 0;
        if (type === 'video') { user.dailyGoals.videosCount = (user.dailyGoals.videosCount || 0) + 1; addedXP = 30; }
        else if (type === 'quiz' || type === 'exam') { user.dailyGoals.quizzesCount = (user.dailyGoals.quizzesCount || 0) + 1; addedXP = 50; }
        else if (type === 'note') { user.dailyGoals.notesCount = (user.dailyGoals.notesCount || 0) + 1; addedXP = 20; }
        else if (type === 'saved_note') { user.dailyGoals.savedNotesCount = (user.dailyGoals.savedNotesCount || 0) + 1; addedXP = 15; }
        else if (type === 'active_time') { user.dailyGoals.activeMinutes = (user.dailyGoals.activeMinutes || 0) + 1; addedXP = 1; }

        if (addedXP > 0) {
            user.dailyGoals.todayXpEarned = (user.dailyGoals.todayXpEarned || 0) + addedXP;
            user.totalXP = (user.totalXP || 0) + addedXP;
        }

        user.markModified('dailyGoals');
        await user.save();
        res.json({
            success: true,
            videosCount: user.dailyGoals.videosCount,
            quizzesCount: user.dailyGoals.quizzesCount,
            notesCount: user.dailyGoals.notesCount,
            savedNotesCount: user.dailyGoals.savedNotesCount,
            activeMinutes: user.dailyGoals.activeMinutes,
            todayXpEarned: user.dailyGoals.todayXpEarned
        });
    } catch (err) { res.status(500).json({ success: false }); }
});

router.post('/save-bookmark', protect, async (req, res) => {
    try {
        await connectDB();
        const { title, link, itemType } = req.body;
        const User = require('../models/User');
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false });
        if (!user.savedBookmarks) user.savedBookmarks = [];
        const exists = user.savedBookmarks.some(b => b.link === link);
        if (!exists) { 
            user.savedBookmarks.push({ title, link, itemType: itemType || 'resource', savedAt: new Date() });
            
            const todayStr = new Date().toISOString().split('T')[0];
            if (!user.dailyGoals || user.dailyGoals.date !== todayStr) {
                user.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, savedNotesCount: 0, activeMinutes: 0, todayXpEarned: 0, todayWatchedLessons: [] };
            }
            user.dailyGoals.savedNotesCount = (user.dailyGoals.savedNotesCount || 0) + 1;
            user.dailyGoals.todayXpEarned = (user.dailyGoals.todayXpEarned || 0) + 15;
            user.totalXP = (user.totalXP || 0) + 15;

            user.markModified('dailyGoals');
            user.markModified('savedBookmarks');
            await user.save(); 
        }
        res.json({ success: true, bookmarks: user.savedBookmarks });
    } catch (err) { res.status(500).json({ success: false }); }
});

router.post('/remove-bookmark', protect, async (req, res) => {
    try {
        await connectDB();
        const { bookmarkId, link } = req.body;
        const User = require('../models/User');
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false });
        if (user.savedBookmarks) {
            user.savedBookmarks = user.savedBookmarks.filter(b => {
                if (bookmarkId && String(b._id) === String(bookmarkId)) return false;
                if (link && String(b.link) === String(link)) return false;
                return true;
            });
            user.markModified('savedBookmarks');
            await user.save();
        }
        res.json({ success: true, bookmarks: user.savedBookmarks });
    } catch (err) { res.status(500).json({ success: false }); }
});

router.post('/attend-notice', protect, async (req, res) => {
    try {
        await connectDB();
        const { noticeId } = req.body;
        const User = require('../models/User');
        const user = await User.findById(req.session.userId);
        if (user && noticeId && !user.attendedNotices.includes(noticeId)) {
            user.attendedNotices.push(noticeId);
            await user.save();
        }
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

module.exports = router;
