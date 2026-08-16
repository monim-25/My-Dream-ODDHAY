const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { connectDB, protect, parentProtect, adminProtect, User, Course, Quiz, Book, Note, QuestionBank, QA, Notification, RoutineTask, Question, Message, VideoAsset, Setting } = require('../config');

// ---- Dashboard ----
router.get('/dashboard', protect, async (req, res) => {
    try {
        await connectDB();
        const userId = req.session.userId;
        const User = require('../models/User'); // Ensure Model is loaded
        const Course = require('../models/Course');
        const RoutineTask = require('../models/RoutineTask');
        const Notification = require('../models/Notification');

        const dbUser = await User.findById(userId).populate('enrolledCourses.course').populate('lastWatchedLesson.course');
        if (!dbUser) return res.redirect('/login');

        if (dbUser.lastWatchedLesson && dbUser.lastWatchedLesson.course) {
            const courseObj = dbUser.lastWatchedLesson.course;
            let activeNode = null;
            if (dbUser.lastWatchedLesson.lessonId && courseObj.curriculumNodes && courseObj.curriculumNodes.length > 0) {
                activeNode = courseObj.curriculumNodes.find(n => String(n._id) === String(dbUser.lastWatchedLesson.lessonId));
            }
            if (activeNode && activeNode.thumbnail) {
                dbUser.lastWatchedLesson.thumbnail = activeNode.thumbnail;
            } else if (courseObj.thumbnail) {
                dbUser.lastWatchedLesson.thumbnail = courseObj.thumbnail;
            }
        } else if (dbUser.enrolledCourses && dbUser.enrolledCourses.length > 0) {
            const firstEnrollment = dbUser.enrolledCourses.find(e => e.course);
            if (firstEnrollment && firstEnrollment.course) {
                const courseObj = firstEnrollment.course;
                const firstVideoNode = (courseObj.curriculumNodes || []).find(n => n.type === 'video');
                dbUser.lastWatchedLesson = {
                    course: courseObj,
                    lessonId: firstVideoNode ? String(firstVideoNode._id) : null,
                    lessonTitle: firstVideoNode ? firstVideoNode.name : (courseObj.title || 'Course Lesson'),
                    thumbnail: (firstVideoNode && firstVideoNode.thumbnail) ? firstVideoNode.thumbnail : (courseObj.thumbnail || ''),
                    lastPosition: 0,
                    watchedAt: new Date()
                };
            }
        }

        // --- Device Tracking Logic ---
        await trackUserDevice(req, dbUser);

        console.log('--- DASHBOARD ACCESS ---');
        console.log('User:', dbUser ? dbUser.name : 'NULL');
        if (!dbUser) return res.redirect('/login');
        if (dbUser.role === 'parent') return res.redirect('/parent/dashboard');

        // --- Streak Calculation Logic ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastActive = dbUser.lastActive ? new Date(dbUser.lastActive) : null;
        if (lastActive) {
            lastActive.setHours(0, 0, 0, 0);
            const diffTime = today - lastActive;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                dbUser.streak += 1;
                dbUser.lastActive = new Date();
                await dbUser.save();
            } else if (diffDays > 1) {
                dbUser.streak = 1;
                dbUser.lastActive = new Date();
                await dbUser.save();
            }
        } else {
            dbUser.streak = 1;
            dbUser.lastActive = new Date();
            await dbUser.save();
        }
        // --------------------------------

        const isFirstLogin = req.session.isFirstLogin;
        if (isFirstLogin) req.session.isFirstLogin = false;

        const data = { recommendations: [], pendingParents: [], leaderboard: [], notifications: [], todayTasks: [], upcomingTasks: [], priorityAlert: null, classmates: [], motivationalQuote: null };
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);

            const results = await Promise.all([
                Course.find({ classLevel: dbUser.classLevel, _id: { $nin: (dbUser.enrolledCourses || []).map(e => e.course?._id) } }).limit(3).lean().catch(() => []),
                (async () => {
                    const pRequests = (dbUser.parentRequests || []).filter(r => r.status === 'pending');
                    if (!pRequests.length) return [];
                    return User.find({ _id: { $in: pRequests.map(p => p.parent) } }).select('name email phone').lean();
                })().catch(() => []),
                User.find({ role: 'student', classLevel: dbUser.classLevel }).sort({ totalXP: -1 }).limit(10).select('name classLevel profileImage totalXP streak').lean().catch(() => []),
                Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
                RoutineTask.find({
                    user: userId,
                    date: { $gte: today, $lt: tomorrow }
                }).sort({ isCompleted: 1, time: 1 }).lean().catch(() => []),
                RoutineTask.find({
                    user: userId,
                    date: { $gte: tomorrow, $lt: nextWeek }
                }).sort({ date: 1, time: 1 }).limit(3).lean().catch(() => []),
                User.find({ role: 'student', classLevel: dbUser.classLevel, _id: { $ne: userId } })
                    .limit(6)
                    .select('name quizResults profileImage')
                    .lean()
                    .then(users => users.map(u => ({
                        ...u,
                        performanceScore: (u.quizResults || []).reduce((acc, curr) => acc + (curr.score || 0), 0) * 12 + 150
                    })).sort((a, b) => b.performanceScore - a.performanceScore))
            ]);
            [data.recommendations, data.pendingParents, data.leaderboard, data.notifications, data.todayTasks, data.upcomingTasks, data.classmates] = results;

            // Priority Alert Enhancement:
            const now = new Date();
            const h = now.getHours();
            const m = now.getMinutes();
            const currentTimeStr = h.toString().padStart(2, '0') + ":" + m.toString().padStart(2, '0');

            // 1. Check for immediate global notices
            const globalNotice = data.notifications.find(n => (n.type === 'notice' || n.isGlobal) && (new Date() - new Date(n.createdAt) < 24 * 60 * 60 * 1000));

            if (globalNotice) {
                data.priorityAlert = { title: globalNotice.message, type: 'notice' };
            } else {
                // 2. Find the most urgent uncompleted task (Class/Exam) that hasn't passed yet
                const urgentTask = data.todayTasks.find(t => {
                    if (t.isCompleted) return false;
                    if (t.type !== 'exam' && t.type !== 'class') return false;
                    if (!t.time) return true; // No time implies all day
                    return t.time >= currentTimeStr; // Only show if time is upcoming
                });

                if (urgentTask) {
                    data.priorityAlert = urgentTask;
                } else {
                    const quotes = [
                        "সাফল্যের মূল চাবিকাঠি হলো তোমার অধ্যবসায়।",
                        "আজকের ছোট পদক্ষেপ আগামীকালের বড় সাফল্যের শুরু।",
                        "পড়াশোনাকে ভয় নয়, জয়ের নেশায় জয় করো।",
                        "সাফল্যের মূল চাবিকাঠি হলো তোমার অধ্যবসায়۔",
                        "আজকের ছোট পদক্ষেপ আগামীকালের বড় সাফল্যের শুরু۔",
                        "পড়াশোনাকে ভয় নয়, জয়ের নেশায় জয় করো۔",
                        "তুমি যা শিখছো, তা কেউ তোমার থেকে কেড়ে নিতে পারবে না۔"
                    ];
                    data.motivationalQuote = quotes[Math.floor(Math.random() * quotes.length)];
                }
            }

            // --- Smart Level System (Progressive Thresholds) ---
            const currentXP = dbUser.totalXP || 0;
            // Thresholds: Level 1=0, Level 2=100, Level 3=300, Level 4=500, Level 5=1000,
            // Level 6=1600, Level 7=2400, Level 8=3500, Level 9=5000, Level 10=7000+
            const xpThresholds = [0, 100, 300, 500, 1000, 1600, 2400, 3500, 5000, 7000];
            let level = 1;
            for (let i = 1; i < xpThresholds.length; i++) {
                if (currentXP >= xpThresholds[i]) level = i + 1;
                else break;
            }
            const currentThreshold = xpThresholds[level - 1] || 0;
            const nextThreshold = xpThresholds[level] || (xpThresholds[xpThresholds.length - 1] + 3000);
            const xpInLevel = currentXP - currentThreshold;
            const xpNeededForLevel = nextThreshold - currentThreshold;
            const levelProgress = Math.min(100, Math.round((xpInLevel / xpNeededForLevel) * 100));


            // --- Strict Priority Notice Board Display Logic ---
            // Priority 1: Active Exam Notice (Model Test, Course Quiz, Chapter Exam)
            // Priority 2: Ongoing Live Class Notice
            // Priority 3: High-Priority Enrolled Course Notice / High-Priority Admin Notice
            // Priority 4: Smart Recommendation (Next Step)
            // Priority 5: Standard Upcoming Tasks

            let activeExamNotice = null;
            let activeLiveNotice = null;
            let highPriorityNotice = null;

            // 1. Check real active exam from priorityAlert or DB/curriculumNodes
            if (data.priorityAlert && (data.priorityAlert.type === 'exam' || data.priorityAlert.type === 'quiz')) {
                activeExamNotice = {
                    id: 'exam_' + (data.priorityAlert._id || 'active'),
                    title: data.priorityAlert.title,
                    courseTitle: data.priorityAlert.courseTitle || 'পরীক্ষা',
                    subtitle: 'পরীক্ষা চলছে',
                    time: data.priorityAlert.time || 'আজ রাত ১০টা পর্যন্ত',
                    type: 'exam',
                    link: data.priorityAlert.link || '/exams',
                    buttonText: 'Join Exam'
                };
            }

            const formatTimeAgo = (date, isLive = false) => {
                if (!date) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
                const past = new Date(date);
                if (isNaN(past.getTime())) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
                const diffMins = Math.floor(Math.abs(new Date() - past) / (1000 * 60));
                const toBn = num => num.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
                const suffix = isLive ? 'শুরু হয়েছে' : 'পাঠানো হয়েছে';

                if (diffMins < 1) return `এখনই ${suffix}`;
                if (diffMins < 60) return `${toBn(diffMins)} মিনিট আগে ${suffix}`;
                const diffHours = Math.floor(diffMins / 60);
                if (diffHours < 24) return `${toBn(diffHours)} ঘণ্টা আগে ${suffix}`;
                return `${toBn(Math.floor(diffHours / 24))} দিন আগে ${suffix}`;
            };

            // 2. Check real active live class across student's enrolled courses (curriculumNodes + chapters.liveClasses)
            if (dbUser.enrolledCourses && dbUser.enrolledCourses.length > 0) {
                for (const ec of dbUser.enrolledCourses) {
                    if (!ec.course) continue;
                    const fullCourse = await Course.findById(ec.course._id || ec.course).lean();
                    if (!fullCourse) continue;

                    // Check curriculumNodes for liveClass
                    if (fullCourse.curriculumNodes && fullCourse.curriculumNodes.length > 0) {
                        const liveNode = fullCourse.curriculumNodes.find(n => n.type === 'liveClass' && (n.meetingUrl || n.isLive || (n.date && new Date(n.date) >= new Date(Date.now() - 7200000))));
                        if (liveNode) {
                            const mUrl = liveNode.meetingUrl || '';
                            const targetLink = mUrl.startsWith('http') ? mUrl : (mUrl ? '/live/' + mUrl : `/course-details/${fullCourse._id}`);
                            activeLiveNotice = {
                                id: 'live_' + liveNode._id,
                                title: liveNode.name || liveNode.title || 'লাইভ ক্লাস চলছে',
                                courseTitle: fullCourse.title,
                                subtitle: 'লাইভ ক্লাস চলমান',
                                time: formatTimeAgo(liveNode.date, true),
                                type: 'live',
                                link: targetLink,
                                buttonText: 'Join Live'
                            };
                            break;
                        }
                    }

                    // Check chapters.liveClasses
                    if (fullCourse.chapters && fullCourse.chapters.length > 0) {
                        for (const ch of fullCourse.chapters) {
                            if (ch.liveClasses && ch.liveClasses.length > 0) {
                                const activeLive = ch.liveClasses.find(lc => lc.meetingUrl || (lc.date && new Date(lc.date) >= new Date(Date.now() - 7200000)));
                                if (activeLive) {
                                    const mUrl = activeLive.meetingUrl || '';
                                    const targetLink = mUrl.startsWith('http') ? mUrl : (mUrl ? '/live/' + mUrl : `/course-details/${fullCourse._id}`);
                                    activeLiveNotice = {
                                        id: 'live_' + activeLive._id,
                                        title: activeLive.title || 'লাইভ ক্লাস চলছে',
                                        courseTitle: fullCourse.title,
                                        subtitle: 'লাইভ ক্লাস চলমান',
                                        time: formatTimeAgo(activeLive.date, true),
                                        type: 'live',
                                        link: targetLink,
                                        buttonText: 'Join Live'
                                    };
                                    break;
                                }
                            }
                        }
                    }
                    if (activeLiveNotice) break;
                }
            }

            // Check student notifications for liveClass/live/exam alerts
            if (!activeLiveNotice || !activeExamNotice) {
                const unreadNotif = await Notification.findOne({ recipient: dbUser._id, read: false }).sort({ createdAt: -1 }).lean();
                if (unreadNotif) {
                    if ((unreadNotif.type === 'liveClass' || unreadNotif.type === 'live') && !activeLiveNotice) {
                        activeLiveNotice = {
                            id: 'notif_' + unreadNotif._id,
                            title: unreadNotif.title || unreadNotif.message || 'লাইভ ক্লাস চলছে',
                            courseTitle: 'লাইভ ক্লাস',
                            subtitle: 'লাইভ ক্লাস চলমান',
                            time: formatTimeAgo(unreadNotif.createdAt),
                            type: 'live',
                            link: unreadNotif.link || '/courses',
                            buttonText: 'Join Live'
                        };
                    } else if ((unreadNotif.type === 'exam' || unreadNotif.type === 'quiz') && !activeExamNotice) {
                        activeExamNotice = {
                            id: 'notif_' + unreadNotif._id,
                            title: unreadNotif.title || unreadNotif.message || 'পরীক্ষা চলছে',
                            courseTitle: 'পরীক্ষা',
                            subtitle: 'পরীক্ষা চলছে',
                            time: 'আজ রাত ১০টা পর্যন্ত',
                            type: 'exam',
                            link: unreadNotif.link || '/exams',
                            buttonText: 'Join Exam'
                        };
                    }
                }
            }

            if (!activeLiveNotice && data.priorityAlert && data.priorityAlert.type === 'live') {
                activeLiveNotice = {
                    id: 'live_' + (data.priorityAlert._id || 'active_live'),
                    title: data.priorityAlert.title,
                    courseTitle: data.priorityAlert.courseTitle || 'লাইভ ক্লাস',
                    subtitle: 'লাইভ ক্লাস চলমান',
                    time: data.priorityAlert.time || 'এখনই যোগ দিন',
                    type: 'live',
                    link: data.priorityAlert.link || '/courses',
                    buttonText: 'Join Live'
                };
            }

            // 3. Check for course Announcement (Teacher Panel), NotificationLog (Broadcast), or Notification
            const Announcement = require('../models/Announcement');
            const NotificationLog = require('../models/NotificationLog');
            const enrolledCourseIds = (dbUser.enrolledCourses || []).map(ec => ec.course ? (ec.course._id || ec.course) : null).filter(Boolean);
            const attended = dbUser.attendedNotices || [];

            // Query teacher Announcements for student's enrolled courses
            const courseAnnouncements = await Announcement.find({ courseId: { $in: enrolledCourseIds } })
                .populate('courseId', 'title')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const logNoticeQuery = {
                $or: [
                    { user: dbUser._id },
                    { courseId: { $in: enrolledCourseIds } },
                    { target: { $in: ['all', 'student', 'class'] } },
                    { classLevel: dbUser.classLevel }
                ]
            };

            const latestLogNotices = await NotificationLog.find(logNoticeQuery).sort({ createdAt: -1 }).limit(5).lean();
            const latestCourseNotif = await Notification.findOne({ user: dbUser._id }).sort({ createdAt: -1 }).lean();

            // Find candidate notices from each source that have not been attended
            const candidateNotices = [];

            for (const ann of courseAnnouncements) {
                if (!attended.includes('ann_' + ann._id)) {
                    candidateNotices.push({
                        id: 'ann_' + ann._id,
                        title: ann.title,
                        courseTitle: ann.courseId ? ann.courseId.title : null,
                        message: ann.content,
                        subtitle: ann.content,
                        time: formatTimeAgo(ann.createdAt),
                        createdAt: ann.createdAt,
                        type: 'high_notice',
                        link: `/notice-details/${ann._id}?type=ann`,
                        buttonText: 'View Notice',
                        isHighPriority: ann.priority === 'high'
                    });
                }
            }

            for (const logItem of latestLogNotices) {
                if (!attended.includes('notice_' + logItem._id)) {
                    candidateNotices.push({
                        id: 'notice_' + logItem._id,
                        title: logItem.title,
                        courseTitle: 'Announcement',
                        message: logItem.body || logItem.message,
                        subtitle: logItem.body || logItem.message,
                        time: formatTimeAgo(logItem.createdAt || logItem.sentAt),
                        createdAt: logItem.createdAt || logItem.sentAt,
                        type: 'high_notice',
                        link: `/notice-details/${logItem._id}?type=log`,
                        buttonText: 'View Notice',
                        isHighPriority: logItem.priority === 'high' || logItem.priority === 'urgent'
                    });
                }
            }

            if (latestCourseNotif && !attended.includes('notice_' + latestCourseNotif._id)) {
                candidateNotices.push({
                    id: 'notice_' + latestCourseNotif._id,
                    title: latestCourseNotif.title,
                    courseTitle: 'Announcement',
                    message: latestCourseNotif.message,
                    subtitle: latestCourseNotif.message,
                    time: formatTimeAgo(latestCourseNotif.createdAt),
                    createdAt: latestCourseNotif.createdAt,
                    type: 'high_notice',
                    link: `/notice-details/${latestCourseNotif._id}?type=notif`,
                    buttonText: 'View Notice',
                    isHighPriority: true
                });
            }

            // Sort candidate notices: High Priority items first, then by newest createdAt
            candidateNotices.sort((a, b) => {
                if (a.isHighPriority && !b.isHighPriority) return -1;
                if (!a.isHighPriority && b.isHighPriority) return 1;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });

            if (candidateNotices.length > 0) {
                highPriorityNotice = candidateNotices[0];
            } else if (globalNotice) {
                highPriorityNotice = {
                    id: 'notice_' + (globalNotice._id || 'global_notice'),
                    title: globalNotice.title || globalNotice.message || 'সিস্টেম নোটিশ',
                    subtitle: globalNotice.message || 'গুরুত্বপূর্ণ ঘোষণা',
                    time: formatTimeAgo(globalNotice.createdAt),
                    type: 'high_notice',
                    link: globalNotice.link || '/courses',
                    buttonText: 'View Notice'
                };
            }

            // Apply Strict User Hierarchy
            if (activeExamNotice && !attended.includes(activeExamNotice.id)) {
                res.locals.upcomingEvent = activeExamNotice;
            } else if (activeLiveNotice && !attended.includes(activeLiveNotice.id)) {
                res.locals.upcomingEvent = activeLiveNotice;
            } else if (highPriorityNotice && !attended.includes(highPriorityNotice.id)) {
                res.locals.upcomingEvent = highPriorityNotice;
            } else if (data.upcomingTasks && data.upcomingTasks.length > 0 && !attended.includes('task_' + data.upcomingTasks[0]._id)) {
                res.locals.upcomingEvent = {
                    id: 'task_' + data.upcomingTasks[0]._id,
                    title: data.upcomingTasks[0].title,
                    subtitle: 'আসন্ন অ্যাসাইনমেন্ট',
                    time: new Date(data.upcomingTasks[0].date).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }) + " " + (data.upcomingTasks[0].time || ''),
                    type: 'upcoming',
                    link: '/exams',
                    buttonText: 'View Task'
                };
            }

            // Prepare Last Watched Data for "Jump Back In"
            let lastWatched = null;
            if (dbUser.lastWatchedLesson && dbUser.lastWatchedLesson.course) {
                const enrollment = (dbUser.enrolledCourses || []).find(e => e.course && e.course._id.toString() === dbUser.lastWatchedLesson.course._id.toString());
                lastWatched = {
                    courseTitle: dbUser.lastWatchedLesson.course.title,
                    lessonTitle: dbUser.lastWatchedLesson.lessonTitle,
                    thumbnail: dbUser.lastWatchedLesson.course.thumbnail,
                    progress: enrollment ? enrollment.progress : 0,
                    courseId: dbUser.lastWatchedLesson.course._id
                };
            }

            // Smart Learning Graph Logic (Gather Activity XP for last 7 days)
            const chartLabels = [];
            const chartData = [];
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            sevenDaysAgo.setHours(0, 0, 0, 0);

            const QuestionBankAttempt = require('../models/QuestionBankAttempt');

            const [allRecentTasks, userWithQuizzes, recentBankAttempts] = await Promise.all([
                RoutineTask.find({ user: userId, isCompleted: true, updatedAt: { $gte: sevenDaysAgo } }).lean(),
                User.findById(userId).select('quizResults').lean(),
                QuestionBankAttempt.find({ user: userId, createdAt: { $gte: sevenDaysAgo } }).lean()
            ]);

            const todayStr = new Date().toISOString().split('T')[0];
            const todayXp = (dbUser.dailyGoals && dbUser.dailyGoals.date === todayStr) ? (dbUser.dailyGoals.todayXpEarned || 0) : 0;

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayName = days[d.getDay()];
                chartLabels.push(dayName);

                const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(d); endOfDay.setHours(23, 59, 59, 999);

                // 1. Tasks XP (25 per task)
                const dayTasks = allRecentTasks.filter(t => t.updatedAt >= startOfDay && t.updatedAt <= endOfDay).length;

                // 2. Quiz XP (50 per quiz + score/total * 20 bonus)
                const dayQuizzes = (userWithQuizzes?.quizResults || []).filter(q => q.date >= startOfDay && q.date <= endOfDay);
                let quizXP = 0;
                dayQuizzes.forEach(q => {
                    quizXP += 50 + Math.round((q.score / (q.total || 1)) * 20);
                });

                // 3. Question Bank Attempts XP (50 per attempt + score bonus)
                const dayBankAttempts = recentBankAttempts.filter(a => a.createdAt >= startOfDay && a.createdAt <= endOfDay);
                let bankAttemptXP = 0;
                dayBankAttempts.forEach(a => {
                    const totalQ = a.totalBankQuestions || a.mcqTotalQuestions || 1;
                    const scoreRatio = (a.mcqScore || 0) / totalQ;
                    bankAttemptXP += 50 + Math.round(scoreRatio * 20);
                });

                // 4. Saved Notes & Bookmarks XP (15 per saved note/bookmark)
                const daySavedNotes = (dbUser.savedBookmarks || []).filter(b => b.savedAt && new Date(b.savedAt) >= startOfDay && new Date(b.savedAt) <= endOfDay).length;

                let totalXP = (dayTasks * 25) + quizXP + bankAttemptXP + (daySavedNotes * 15);

                // For Today (i === 0), ensure today's full XP from dailyGoals (video watches + notes + exams + active time) is fully represented!
                if (i === 0) {
                    totalXP = Math.max(totalXP, todayXp);
                }

                chartData.push(totalXP);
            }

            // --- Subject-wise Focus Analytics ---
            const enrolledCourses = dbUser.enrolledCourses || [];
            const coursesData = enrolledCourses.filter(e => e.course).map(e => e.course);
            const subjectAnalytics = coursesData.map(course => {
                const enrollment = enrolledCourses.find(e => e.course && e.course._id.toString() === course._id.toString());
                const courseQuizzes = [];
                course.chapters.forEach(ch => {
                    if (ch.quizzes) courseQuizzes.push(...ch.quizzes.map(q => q.toString()));
                });

                const relevantResults = (dbUser.quizResults || []).filter(qr => qr.quiz && courseQuizzes.includes(qr.quiz._id.toString()));
                const avgScore = relevantResults.length > 0
                    ? Math.round(relevantResults.reduce((acc, curr) => acc + (curr.score / (curr.total || 1)), 0) / relevantResults.length * 100)
                    : 0;

                let realProgress = enrollment ? (enrollment.progress || 0) : 0;
                if (enrollment && course) {
                    const courseLessonIds = new Set();

                    if (course.chapters?.length > 0) {
                        course.chapters.forEach(ch => {
                            (ch.recordedClasses || []).forEach(rc => rc._id && courseLessonIds.add(rc._id.toString()));
                            (ch.notes || []).forEach(n => n._id && courseLessonIds.add(n._id.toString()));
                            (ch.quizzes || []).forEach(q => q && courseLessonIds.add(q.toString()));
                        });
                    }

                    if (course.curriculumNodes?.length > 0) {
                        course.curriculumNodes.forEach(n => {
                            if (['video', 'note'].includes(n.type) && n._id) {
                                courseLessonIds.add(n._id.toString());
                            } else if (n.type === 'quiz' && n.quizId) {
                                courseLessonIds.add(n.quizId.toString());
                            }
                        });
                    }

                    const totalLessons = courseLessonIds.size;
                    let completedForCourse = 0;

                    if (totalLessons > 0) {
                        const uniqueCompleted = new Set((dbUser.completedLessons || []).map(id => id.toString()));
                        uniqueCompleted.forEach(id => {
                            if (courseLessonIds.has(id)) {
                                completedForCourse++;
                            }
                        });
                        realProgress = Math.round((completedForCourse / totalLessons) * 100);
                    }
                }

                return {
                    name: course.title,
                    progress: realProgress,
                    score: avgScore,
                    id: course._id
                };
            }).sort((a, b) => b.progress - a.progress);

            // --- Daily Goals & Activity System ---
            let userDailyGoals = dbUser.dailyGoals || {};
            if (userDailyGoals.date !== todayStr) {
                userDailyGoals = {
                    date: todayStr,
                    videosCount: 0,
                    quizzesCount: 0,
                    notesCount: 0,
                    todayXpEarned: 0
                };
                dbUser.dailyGoals = userDailyGoals;
                await dbUser.save();
            }

            const todayVideosCount = userDailyGoals.videosCount || 0;
            const todayQuizzesCount = userDailyGoals.quizzesCount || 0;
            const todayNotesCount = userDailyGoals.notesCount || 0;
            const todayXpEarned = userDailyGoals.todayXpEarned || 0;
            const savedBookmarks = dbUser.savedBookmarks || [];
            const statsPercentages = {};

            res.render('student-dashboard', {
                user: dbUser,
                level,
                levelProgress,
                xpNeeded: nextThreshold - currentXP,
                isFirstLogin,
                ...data,
                promotedCourses: data.recommendations,
                leaderboard: data.leaderboard,
                chartLabels,
                chartData,
                lastWatched,
                statsPercentages,
                subjectAnalytics,
                todayVideosCount,
                todayQuizzesCount,
                todayNotesCount,
                todayXpEarned,
                savedBookmarks
            });
        } catch (err) {
            console.error('Data loading error:', err);
            res.render('student-dashboard', { user: dbUser, isFirstLogin: false, chartLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], chartData: [0, 0, 0, 0, 0, 0, 0], ...data });
        }
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send(`<h1>Error</h1><p>${err.message}</p><a href="/logout">Logout</a>`);
    }
});

// ---- Profile ----
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('quizResults.quiz');
        if (!user) return res.redirect('/login');

        // Calculate Average Score
        let avgScore = 0;
        if (user.quizResults && user.quizResults.length > 0) {
            const totalScore = user.quizResults.reduce((acc, curr) => acc + (curr.score / (curr.total || 1)), 0);
            avgScore = Math.round((totalScore / user.quizResults.length) * 100);
        }

        res.render(user.role === 'parent' ? 'parent-profile' : 'profile', {
            user,
            avgScore: avgScore + '%',
            success: req.query.success
        });
    } catch (err) {
        console.error('Profile Error:', err);
        res.status(500).send('Profile Error');
    }
});

// --- Multer setup for avatar uploads ---
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const primaryDest = path.join(process.cwd(), 'client/public/uploads/avatars');
        const secondaryDest = path.join(process.cwd(), 'public/uploads/avatars');
        try { fs.mkdirSync(primaryDest, { recursive: true }); } catch (e) { }
        try { fs.mkdirSync(secondaryDest, { recursive: true }); } catch (e) { }
        cb(null, primaryDest);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'avatar-' + (req.session.userId || Date.now()) + '-' + Date.now() + ext);
    }
});

const uploadAvatarMulter = multer({
    storage: avatarStorage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

router.get('/profile/edit', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).lean();
        const AcademicClass = require('../models/AcademicClass');

        const dbAcademicClasses = await AcademicClass.find().sort({ order: 1 }).lean();
        let availableClasses = (dbAcademicClasses || []).map(ac => ac.name ? ac.name.trim() : '').filter(Boolean);

        if (availableClasses.length === 0 && res.locals && res.locals.globalAcademicClasses && res.locals.globalAcademicClasses.length > 0) {
            availableClasses = res.locals.globalAcademicClasses.map(ac => ac.name ? ac.name.trim() : '').filter(Boolean);
        }

        if (user.classLevel && !availableClasses.includes(user.classLevel)) {
            availableClasses.push(user.classLevel);
        }

        res.render('profile-edit', {
            user,
            availableClasses,
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error('Profile edit error:', err);
        res.status(500).send('Error');
    }
});

router.post('/profile/update', protect, (req, res, next) => {
    uploadAvatarMulter.single('profilePicture')(req, res, () => next());
}, async (req, res) => {
    try {
        const { name, oldPassword, password, email, phone, classLevel, rollNumber, schoolName, collegeName, presentAddress, permanentAddress } = req.body;
        const user = await User.findById(req.session.userId);

        if (req.file) {
            let filePath = `/uploads/avatars/${req.file.filename}`;
            user.profilePicture = filePath;
            user.profileImage = filePath;
            if (req.session.user) {
                req.session.user.profilePicture = filePath;
                req.session.user.profileImage = filePath;
            }
        }

        if (name) user.name = name;
        if (email && !user.email) user.email = email;
        if (phone !== undefined) user.phone = phone;
        if (classLevel) user.classLevel = classLevel;
        if (rollNumber !== undefined) user.rollNumber = rollNumber;
        if (schoolName !== undefined) user.schoolName = schoolName;
        if (collegeName !== undefined) user.collegeName = collegeName;
        if (presentAddress !== undefined) user.presentAddress = presentAddress;
        if (permanentAddress !== undefined) user.permanentAddress = permanentAddress;

        if (password && password.trim() !== '') {
            if (!oldPassword) return res.redirect('/profile/edit?error=old_password_required');
            const isMatch = await user.comparePassword(oldPassword);
            if (!isMatch) return res.redirect('/profile/edit?error=wrong_old_password');
            user.password = password;
        }
        await user.save();
        req.session.user.name = user.name;
        req.session.user.classLevel = user.classLevel;
        res.redirect('/profile?success=true');
    } catch (err) { res.redirect('/profile/edit?error=update_failed'); }
});



router.post('/profile/upload-picture', protect, (req, res, next) => {
    uploadAvatarMulter.single('profilePicture')(req, res, (err) => {
        if (err) {
            console.error('Multer upload error:', err);
            return res.status(400).json({ success: false, error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        let filePath = `/uploads/avatars/${req.file.filename}`;

        try {
            const secPath = path.join(process.cwd(), 'public/uploads/avatars', req.file.filename);
            fs.copyFileSync(req.file.path, secPath);
        } catch (e) { }

        await User.findByIdAndUpdate(req.session.userId, {
            profilePicture: filePath,
            profileImage: filePath
        });

        if (req.session.user) {
            req.session.user.profilePicture = filePath;
            req.session.user.profileImage = filePath;
        }

        res.json({ success: true, filePath });
    } catch (err) {
        console.error('Avatar Upload Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Device Tracking Helper Functions ---
function parseDeviceDetails(req) {
    const userAgent = req.headers['user-agent'] || '';
    let browser = 'Chrome';
    let os = 'Windows';
    let deviceType = 'Desktop';

    if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
        deviceType = 'Mobile';
    } else if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
        deviceType = 'Tablet';
    }

    if (userAgent.includes('Edg/')) browser = 'Edge';
    else if (userAgent.includes('OPR/') || userAgent.includes('Opera')) browser = 'Opera';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';

    if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    else if (userAgent.includes('Mac OS X')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';

    let rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    if (typeof rawIp === 'string' && rawIp.includes(',')) rawIp = rawIp.split(',')[0].trim();
    let ip = rawIp;
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1 (Localhost)';
    }

    const deviceId = req.sessionID || ('sess_' + Date.now());

    return { deviceId, browser, os, deviceType, ip, lastActive: new Date() };
}

async function trackUserDevice(req, user) {
    if (!user || !req.sessionID) return;
    try {
        const info = parseDeviceDetails(req);
        if (!user.activeDevices) user.activeDevices = [];

        const idx = user.activeDevices.findIndex(d => d.deviceId === info.deviceId);
        if (idx !== -1) {
            user.activeDevices[idx].browser = info.browser;
            user.activeDevices[idx].os = info.os;
            user.activeDevices[idx].deviceType = info.deviceType;
            user.activeDevices[idx].ip = info.ip;
            user.activeDevices[idx].lastActive = info.lastActive;
        } else {
            user.activeDevices.push(info);
        }

        if (user.activeDevices.length > 5) {
            user.activeDevices = user.activeDevices.slice(-5);
        }

        await User.findByIdAndUpdate(user._id, { activeDevices: user.activeDevices });
    } catch (err) {
        console.error('Track Device Error:', err);
    }
}

// --- Security & Device Management Routes ---
router.get('/profile/security', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        await trackUserDevice(req, user);

        const updatedUser = await User.findById(req.session.userId).lean();

        res.render('security', {
            user: updatedUser,
            activeDevices: updatedUser.activeDevices || [],
            currentSessionId: req.sessionID,
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error('Security route error:', err);
        res.status(500).send('Error loading security page');
    }
});

router.post('/profile/change-password', protect, async (req, res) => {
    try {
        const { oldPassword, password, confirmPassword } = req.body;
        if (!oldPassword || !password) {
            return res.redirect('/profile/security?error=fields_required');
        }
        if (confirmPassword && password !== confirmPassword) {
            return res.redirect('/profile/security?error=password_mismatch');
        }

        const user = await User.findById(req.session.userId);
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
            return res.redirect('/profile/security?error=wrong_old_password');
        }

        user.password = password;
        await user.save();
        res.redirect('/profile/security?success=password_changed');
    } catch (err) {
        console.error('Change password error:', err);
        res.redirect('/profile/security?error=update_failed');
    }
});

router.post('/profile/logout-device', protect, async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (deviceId) {
            const user = await User.findById(req.session.userId);
            if (user && user.activeDevices) {
                user.activeDevices = user.activeDevices.filter(d =>
                    d._id.toString() !== deviceId.toString() &&
                    d.deviceId !== deviceId
                );
                await user.save();
            }

            if (deviceId === req.sessionID) {
                return req.session.destroy(() => {
                    res.redirect('/login');
                });
            }
        }
        res.redirect('/profile/security?success=device_logged_out');
    } catch (err) {
        console.error('Logout device error:', err);
        res.redirect('/profile/security?error=logout_failed');
    }
});

router.get('/guardian', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const parents = await User.find({ role: 'parent', children: user._id }).select('name email phone');
        res.render('guardian', { parents });
    } catch (err) { res.status(500).send('Error'); }
});

router.get('/id-card', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('id-card', { user });
    } catch (err) { res.status(500).send('Error'); }
});

router.get('/progress-report/:studentId?', protect, async (req, res) => {
    try {
        await connectDB();
        let studentId = req.params.studentId || req.session.userId;
        if (req.session.user.role === 'parent') {
            const parent = await User.findById(req.session.userId);
            if (!parent || !parent.children || !parent.children.includes(studentId)) return res.status(403).send('Access denied');
        }
        const user = await User.findById(studentId).populate('enrolledCourses.course').populate('quizResults.quiz').lean();
        if (!user) return res.redirect('/login');

        // --- Smart Level System (Matching Student Dashboard) ---
        const currentXP = user.totalXP || 0;
        const xpThresholds = [0, 100, 300, 500, 1000, 1600, 2400, 3500, 5000, 7000];
        let level = 1;
        for (let i = 1; i < xpThresholds.length; i++) {
            if (currentXP >= xpThresholds[i]) level = i + 1;
            else break;
        }
        const currentThreshold = xpThresholds[level - 1] || 0;
        const nextThreshold = xpThresholds[level] || (xpThresholds[xpThresholds.length - 1] + 3000);
        const xpInLevel = currentXP - currentThreshold;
        const xpNeededForLevel = nextThreshold - currentThreshold;
        const xpNeeded = Math.max(0, nextThreshold - currentXP);
        const levelProgress = Math.min(100, Math.round((xpInLevel / xpNeededForLevel) * 100));

        const daysLearning = Math.ceil(Math.abs(new Date() - new Date(user.createdAt || new Date())) / (1000 * 60 * 60 * 24));

        // Fetch QuestionBankAttempt & RoutineTask records for student
        let qbAttempts = [];
        try {
            const QuestionBankAttempt = require('../models/QuestionBankAttempt');
            qbAttempts = await QuestionBankAttempt.find({ user: studentId }).populate('bank').sort({ submittedAt: -1 }).lean();
        } catch(e) {
            qbAttempts = [];
        }

        let routineTasks = [];
        try {
            const RoutineTask = require('../models/RoutineTask');
            routineTasks = await RoutineTask.find({ user: studentId }).sort({ isCompleted: 0, date: 1 }).limit(6).lean();
        } catch (e) {
            routineTasks = [];
        }

        // Combine all exam & question bank quiz attempts
        const allQuizAttempts = [];
        (user.quizResults || []).forEach(r => {
            allQuizAttempts.push({
                quiz: r.quiz,
                title: r.quiz?.title || 'Practice Quiz',
                subject: r.quiz?.subject || r.quiz?.title?.split(' ')[0] || 'General',
                score: r.score || 0,
                total: r.total || (r.quiz?.totalMarks ? r.quiz.totalMarks : 1),
                date: r.date || new Date()
            });
        });
        (qbAttempts || []).forEach(q => {
            allQuizAttempts.push({
                quiz: q.bank,
                title: q.bank?.title ? ('QB: ' + q.bank.title) : 'Question Bank Exam',
                subject: q.bank?.subject || 'Question Bank',
                score: q.mcqScore || q.mcqCorrectCount || 0,
                total: q.maxMcqScore || q.mcqTotalQuestions || 1,
                date: q.submittedAt || new Date()
            });
        });

        const totalQuizzes = allQuizAttempts.length;
        let avgScore = 0;
        if (totalQuizzes > 0) {
            const totalScoreRatio = allQuizAttempts.reduce((acc, curr) => {
                const score = curr.score || 0;
                const total = curr.total > 0 ? curr.total : 1;
                return acc + (score / total);
            }, 0);
            avgScore = (totalScoreRatio / totalQuizzes * 100).toFixed(1);
        }

        // Subject performance breakdown
        const subjectPerformance = {};
        allQuizAttempts.forEach(r => {
            const subject = r.subject || 'General';
            if (!subjectPerformance[subject]) subjectPerformance[subject] = { total: 0, score: 0, count: 0 };
            subjectPerformance[subject].score += r.score || 0;
            subjectPerformance[subject].total += r.total || 1;
            subjectPerformance[subject].count++;
        });

        // Robust Weekly Activity computation (last 7 days using local timezone matching)
        const weeklyActivity = [];
        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const targetYear = d.getFullYear();
            const targetMonth = d.getMonth();
            const targetDay = d.getDate();

            const isSameDay = (dateObj) => {
                if (!dateObj) return false;
                const dt = new Date(dateObj);
                return !isNaN(dt.getTime()) && dt.getFullYear() === targetYear && dt.getMonth() === targetMonth && dt.getDate() === targetDay;
            };

            const quizCount = allQuizAttempts.filter(r => isSameDay(r.date)).length;
            const taskCount = (routineTasks || []).filter(t => t.isCompleted && (isSameDay(t.updatedAt) || isSameDay(t.date))).length;
            const bookmarkCount = (user.savedBookmarks || []).filter(b => isSameDay(b.savedAt)).length;
            const watchCount = (user.lastWatchedLesson && isSameDay(user.lastWatchedLesson.watchedAt)) ? 1 : 0;

            const totalDayActivity = quizCount + taskCount + bookmarkCount + watchCount;

            weeklyActivity.push({
                day: dayLabels[d.getDay()],
                count: totalDayActivity,
                quizCount,
                taskCount
            });
        }

        // Recent quiz attempts (sorted descending by date)
        const recentQuizzes = allQuizAttempts.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 6);

        res.render('report-card', {
            user: { ...user, level },
            level,
            levelProgress,
            currentXP,
            xpInLevel,
            xpNeededForLevel,
            xpNeeded,
            nextLevel: level + 1,
            routineTasks: routineTasks || [],
            weeklyActivity,
            subjectPerformance,
            recentQuizzes,
            stats: {
                totalQuizzes,
                avgScore,
                completedCourses: (user.enrolledCourses || []).length,
                learningHours: ((user.completedLessons || []).length * 0.5).toFixed(1),
                daysLearning,
                completedLessons: (user.completedLessons || []).length
            }
        });
    } catch (err) {
        console.error('Progress Report Route Error:', err);
        res.status(500).send('Error loading progress report: ' + err.message);
    }
});

// Legacy path redirects
router.get('/report-card/:studentId?', protect, (req, res) => {
    res.redirect(req.params.studentId ? `/progress-report/${req.params.studentId}` : '/progress-report');
});
router.get('/profile/report-card/:studentId?', protect, (req, res) => {
    res.redirect(req.params.studentId ? `/progress-report/${req.params.studentId}` : '/progress-report');
});

// ---- Routine ----
router.get('/routine', protect, async (req, res) => {
    try {
        await connectDB();
        const User = require('../models/User');
        const Course = require('../models/Course');
        const RoutineTask = require('../models/RoutineTask');
        const Quiz = require('../models/Quiz');
        const QuestionBank = require('../models/QuestionBank');

        const user = await User.findById(req.session.userId).populate('enrolledCourses.course');
        const tasks = await RoutineTask.find({ user: req.session.userId }).sort({ isCompleted: 1, date: 1 }).lean();

        const userClass = user ? user.classLevel || 'Class 9' : 'Class 9';

        // Query Board Exams / Quizzes and Question Banks for student's class
        const boardQuizzes = await Quiz.find({
            classLevel: userClass,
            $or: [{ accessType: 'Free' }, { accessType: 'Paid' }]
        }).limit(6).lean();

        const questionBanks = await QuestionBank.find({
            classLevel: userClass,
            isCustom: { $ne: true },
            title: { $not: /Personalized Exam|Custom Exam/i }
        }).limit(6).lean();

        res.render('routine', {
            tasks: tasks || [],
            enrolledCourses: user ? (user.enrolledCourses || []) : [],
            user: user || {},
            boardQuizzes: boardQuizzes || [],
            questionBanks: questionBanks || []
        });
    } catch (err) {
        console.error('Routine route error:', err);
        res.status(500).send('Error loading routine page: ' + err.message);
    }
});
router.post('/routine/add', protect, async (req, res) => {
    try {
        await connectDB();
        const RoutineTask = require('../models/RoutineTask');
        const { title, date, time, type } = req.body;

        let taskDate;
        if (date) {
            const parts = String(date).split('-');
            if (parts.length === 3) {
                taskDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
            } else {
                taskDate = new Date(date);
                taskDate.setHours(12, 0, 0, 0);
            }
        } else {
            taskDate = new Date();
            taskDate.setHours(12, 0, 0, 0);
        }

        const task = await new RoutineTask({ user: req.session.userId, title, date: taskDate, time, type: type || 'task' }).save();
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.json({ success: true, task });
        }
        res.redirect('/routine');
    } catch (err) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect('/routine');
    }
});

function formatResourceUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
        return trimmed;
    }
    return '/' + trimmed;
}

router.post('/routine/generate-ai', protect, async (req, res) => {
    try {
        await connectDB();
        const Course = require('../models/Course');
        const RoutineTask = require('../models/RoutineTask');
        const { courseId, targetDays, studyTime } = req.body;

        if (!courseId || !targetDays || !studyTime) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }

        const course = await Course.findById(courseId).populate('chapters.quizzes');
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found.' });
        }

        // Delete all old routine tasks for user to populate a clean AI study plan
        await RoutineTask.deleteMany({ user: req.session.userId });

        let itemsToSchedule = [];
        const courseViewUrl = `/course-details/${course._id}`;

        // 1. Extract Video Classes, Reading Notes, Live Classes, and Quizzes from course chapters
        if (course.chapters && course.chapters.length > 0) {
            course.chapters.forEach((ch, chIdx) => {
                const chTitle = ch.title || ch.name || `Chapter ${chIdx + 1}`;

                // Recorded Video Classes
                (ch.recordedClasses || []).forEach(rc => {
                    if (rc && rc.title) {
                        itemsToSchedule.push({
                            title: `Video Class: ${chTitle} - ${rc.title}`,
                            type: 'class',
                            link: formatResourceUrl(rc.videoPath) || courseViewUrl
                        });
                    }
                });

                // Reading Notes / Handnotes / PDF Materials
                (ch.notes || []).forEach(n => {
                    if (n && (n.title || n.name)) {
                        itemsToSchedule.push({
                            title: `Reading Note: ${chTitle} - ${n.title || n.name}`,
                            type: 'task',
                            link: formatResourceUrl(n.filePath) || courseViewUrl
                        });
                    }
                });

                // Live Classes
                (ch.liveClasses || []).forEach(lc => {
                    if (lc && lc.title) {
                        itemsToSchedule.push({
                            title: `Live Class: ${lc.title}`,
                            type: 'class',
                            link: formatResourceUrl(lc.meetingUrl) || courseViewUrl
                        });
                    }
                });

                // Quizzes / Exams
                (ch.quizzes || []).forEach((q, qIdx) => {
                    const qTitle = (typeof q === 'object' && q.title) ? q.title : `Quiz ${qIdx + 1}`;
                    const qId = (typeof q === 'object' && q._id) ? q._id : null;
                    itemsToSchedule.push({
                        title: `Exam Practice: ${chTitle} - ${qTitle}`,
                        type: 'exam',
                        link: qId ? `/exam/take/${qId}` : `/exams`
                    });
                });
            });
        }

        // 2. Extract Video Classes, Reading Notes, Live Classes, and Quizzes from curriculumNodes
        if (course.curriculumNodes && course.curriculumNodes.length > 0) {
            course.curriculumNodes.forEach(node => {
                if (!node || !node.name) return;

                if (node.type === 'video') {
                    itemsToSchedule.push({
                        title: `Video Class: ${course.title} - ${node.name}`,
                        type: 'class',
                        link: formatResourceUrl(node.videoPath || node.filePath) || courseViewUrl
                    });
                } else if (node.type === 'note') {
                    itemsToSchedule.push({
                        title: `Reading Note: ${course.title} - ${node.name}`,
                        type: 'task',
                        link: formatResourceUrl(node.filePath) || courseViewUrl
                    });
                } else if (node.type === 'liveClass') {
                    itemsToSchedule.push({
                        title: `Live Class: ${course.title} - ${node.name}`,
                        type: 'class',
                        link: formatResourceUrl(node.meetingUrl) || courseViewUrl
                    });
                } else if (node.type === 'quiz') {
                    itemsToSchedule.push({
                        title: `Exam Practice: ${course.title} - ${node.name}`,
                        type: 'exam',
                        link: node.quizId ? `/exam/take/${node.quizId}` : `/exams`
                    });
                }
            });
        }

        const days = Math.max(1, parseInt(targetDays));

        // Fallback if no uploaded files exist yet in course
        if (itemsToSchedule.length === 0) {
            for (let i = 1; i <= days; i++) {
                if (i % 3 === 1) {
                    itemsToSchedule.push({ title: `${course.title} - Day ${i}: Video Class`, type: 'class', link: courseViewUrl });
                } else if (i % 3 === 2) {
                    itemsToSchedule.push({ title: `${course.title} - Day ${i}: Reading Note`, type: 'task', link: courseViewUrl });
                } else {
                    itemsToSchedule.push({ title: `${course.title} - Day ${i}: Model Exam`, type: 'exam', link: `/exams` });
                }
            }
        }

        // Distribute tasks across targetDays
        const itemsPerDay = Math.ceil(itemsToSchedule.length / days);
        let currentDay = 0;
        let itemIndex = 0;
        let generatedTasks = [];
        let startDate = new Date();

        while (itemIndex < itemsToSchedule.length && currentDay < days) {
            const taskDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + currentDay, 12, 0, 0);

            const dailyChunk = itemsToSchedule.slice(itemIndex, itemIndex + itemsPerDay);

            dailyChunk.forEach(item => {
                generatedTasks.push({
                    user: req.session.userId,
                    title: item.title,
                    date: taskDate,
                    time: studyTime.trim(),
                    type: item.type,
                    link: item.link || courseViewUrl,
                    isAiGenerated: true
                });
            });

            itemIndex += itemsPerDay;
            currentDay++;
        }

        if (generatedTasks.length > 0) {
            await RoutineTask.insertMany(generatedTasks);
        }

        return res.json({
            success: true,
            message: `Successfully generated ${generatedTasks.length} study tasks over ${days} days!`
        });
    } catch (err) {
        console.error('AI Routine Error:', err);
        return res.status(500).json({ success: false, error: 'Error generating AI study plan: ' + err.message });
    }
});
router.post('/routine/toggle/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const User = require('../models/User');
        const RoutineTask = require('../models/RoutineTask');
        const task = await RoutineTask.findOne({ _id: req.params.id, user: req.session.userId });
        if (task) {
            task.isCompleted = !task.isCompleted;
            await task.save();

            // Award XP for completion
            if (task.isCompleted) {
                await User.findByIdAndUpdate(req.session.userId, { $inc: { totalXP: 25 } });
            } else {
                await User.findByIdAndUpdate(req.session.userId, { $inc: { totalXP: -25 } });
            }
        }
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            // Get updated user to calculate level
            const updatedUser = await User.findById(req.session.userId).select('totalXP');
            const currentXP = updatedUser.totalXP || 0;
            const level = Math.floor(currentXP / 1000) + 1;
            const xpInLevel = currentXP % 1000;
            const levelProgress = Math.round((xpInLevel / 1000) * 100);
            const xpNeeded = 1000 - xpInLevel;
            // Calculate updated task percentage for the day
            const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
            const todayTasks = await RoutineTask.find({
                user: req.session.userId,
                date: { $gte: startOfDay, $lte: endOfDay }
            });
            const tasksPercentage = todayTasks.length > 0 ? Math.round((todayTasks.filter(t => t.isCompleted).length / todayTasks.length) * 100) : 0;

            return res.json({
                success: true,
                isCompleted: task.isCompleted,
                level,
                levelProgress,
                xpNeeded,
                currentXP,
                tasksPercentage
            });
        }
        res.redirect('/routine');
    } catch (err) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(500).json({ error: err.message });
        }
        res.redirect('/routine');
    }
});
router.post('/routine/delete/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const RoutineTask = require('../models/RoutineTask');
        await RoutineTask.findOneAndDelete({ _id: req.params.id, user: req.session.userId });
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.json({ success: true });
        }
        res.redirect('/routine');
    } catch (err) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect('/routine');
    }
});

router.post('/routine/clear-completed', protect, async (req, res) => {
    try {
        await connectDB();
        const RoutineTask = require('../models/RoutineTask');
        await RoutineTask.deleteMany({ user: req.session.userId, isCompleted: true });
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.json({ success: true });
        }
        res.redirect('/routine');
    } catch (err) {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect('/routine');
    }
});

// ---- Full Leaderboard Page ----
router.get('/leaderboard', protect, async (req, res) => {
    try {
        await connectDB();
        const dbUser = await User.findById(req.session.userId).lean();
        if (!dbUser) return res.redirect('/login');

        const classLevelFilter = req.query.classLevel || dbUser.classLevel || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;

        const filter = { role: 'student' };
        if (classLevelFilter && classLevelFilter !== 'all') {
            filter.classLevel = classLevelFilter;
        }

        // Total students matching filter
        const totalStudents = await User.countDocuments(filter);

        // Fetch paginated students sorted by XP
        const students = await User.find(filter)
            .sort({ totalXP: -1 })
            .skip(skip)
            .limit(limit)
            .select('name classLevel profileImage totalXP streak')
            .lean();

        // Find current user's rank in this filter
        const myXP = dbUser.totalXP || 0;
        const myRank = await User.countDocuments({ ...filter, totalXP: { $gt: myXP } }) + 1;

        const hasMore = (skip + limit) < totalStudents;

        res.render('leaderboard', {
            students,
            myRank,
            totalStudents,
            currentPage: page,
            hasMore,
            classLevelFilter,
            userClassLevel: dbUser.classLevel || 'Class 9',
            myXP,
            myId: dbUser._id.toString(),
            user: dbUser
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading leaderboard');
    }
});

// ---- Leaderboard API (for load more & tab filter) ----
router.get('/api/leaderboard', protect, async (req, res) => {
    try {
        await connectDB();
        const dbUser = await User.findById(req.session.userId).lean();
        const classLevelFilter = req.query.classLevel || dbUser.classLevel || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;

        const filter = { role: 'student' };
        if (classLevelFilter && classLevelFilter !== 'all') {
            filter.classLevel = classLevelFilter;
        }

        const totalStudents = await User.countDocuments(filter);
        const students = await User.find(filter)
            .sort({ totalXP: -1 })
            .skip(skip)
            .limit(limit)
            .select('name classLevel profileImage totalXP streak')
            .lean();

        res.json({
            success: true,
            students,
            hasMore: (skip + limit) < totalStudents,
            currentPage: page,
            totalStudents
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---- My Courses ----
router.get('/my-courses', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate('enrolledCourses.course');
        const courses = user.enrolledCourses.map(enrollment => {
            if (!enrollment.course) return null;
            const course = enrollment.course;
            const courseLessonIds = new Set();

            if (course.chapters?.length > 0) {
                course.chapters.forEach(ch => {
                    (ch.recordedClasses || []).forEach(rc => rc._id && courseLessonIds.add(rc._id.toString()));
                    (ch.notes || []).forEach(n => n._id && courseLessonIds.add(n._id.toString()));
                    (ch.quizzes || []).forEach(q => q && courseLessonIds.add(q.toString()));
                });
            }

            if (course.curriculumNodes?.length > 0) {
                course.curriculumNodes.forEach(n => {
                    if (['video', 'note'].includes(n.type) && n._id) {
                        courseLessonIds.add(n._id.toString());
                    } else if (n.type === 'quiz' && n.quizId) {
                        courseLessonIds.add(n.quizId.toString());
                    }
                });
            }

            const totalLessons = courseLessonIds.size;
            let completedForCourse = 0;
            let realProgress = enrollment.progress || 0;

            if (totalLessons > 0) {
                const uniqueCompleted = new Set((user.completedLessons || []).map(id => id.toString()));
                uniqueCompleted.forEach(id => {
                    if (courseLessonIds.has(id)) {
                        completedForCourse++;
                    }
                });
                realProgress = Math.round((completedForCourse / totalLessons) * 100);
            }

            // we have to use .toObject() or just modify a copy since `enrollment` might be a mongoose document
            return { ...(typeof enrollment.toObject === 'function' ? enrollment.toObject() : enrollment), progress: realProgress };
        }).filter(c => c !== null);

        const dbUser = user.toObject ? user.toObject() : user;
        res.render('my-courses', {
            courses,
            completedCount: courses.filter(c => c.progress === 100).length,
            inProgressCount: courses.filter(c => c.progress < 100 && c.progress > 0).length,
            user: dbUser
        });
    } catch (err) { res.status(500).send('Error'); }
});

// ---- Analytics / Progress ----
router.get('/analytics', protect, (req, res) => {
    res.redirect('/report-card');
});


// ---- Class Hub (Courses, Live, Recorded) ----
router.get('/courses', protect, async (req, res) => {
    try {
        await connectDB();
        const userId = req.session.userId;
        const { search, subject, sort } = req.query;

        // Fetch user with enrolled courses and their class level
        const user = await User.findById(userId).populate({
            path: 'enrolledCourses.course',
            populate: { path: 'instructor', select: 'name' }
        }).populate('lastWatchedLesson.course').lean();

        if (!user) return res.redirect('/login');

        // Fetch notifications
        const notifications = await Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const userClass = user.classLevel || 'Class 10';
        const enrolledCourseIds = user.enrolledCourses.map(ec => ec.course?._id.toString()).filter(id => id);

        // --- Fetch Non-Enrolled Paid Courses ---
        let exploreQuery = {
            classLevel: userClass,
            _id: { $nin: enrolledCourseIds },
            accessType: { $ne: 'free' }
        };
        if (search) exploreQuery.title = { $regex: search, $options: 'i' };
        if (subject && subject !== 'all') exploreQuery.subject = subject;

        const exploreCourses = await Course.find(exploreQuery).sort({ createdAt: -1 }).populate('instructor', 'name').lean();

        // --- Fetch Free Resources (Grouped by Subject later in EJS) ---
        const freeCourses = await Course.find({
            classLevel: userClass,
            accessType: 'free'
        }).populate('instructor', 'name').lean();

        // --- Extract Live Classes & Subjects ---
        const liveClasses = [];
        const AcademicClass = require('../models/AcademicClass');

        // Robust subject extraction: strictly use superadmin assigned subjects for THIS class from AcademicClass
        const classRegex = new RegExp(userClass.replace(/[^a-zA-Z0-9]/g, '.*'), 'i');
        const ac = await AcademicClass.findOne({ name: classRegex }).lean();

        let classSubjects = [];
        if (ac && Array.isArray(ac.subjects) && ac.subjects.length > 0) {
            classSubjects = ac.subjects.map(s => s ? s.trim() : '').filter(Boolean);
        } else {
            const allAc = await AcademicClass.find().lean();
            const matchedAc = allAc.find(c => isClassMatch(c.name, userClass));
            if (matchedAc && Array.isArray(matchedAc.subjects)) {
                classSubjects = matchedAc.subjects.map(s => s ? s.trim() : '').filter(Boolean);
            }
        }

        const subjects = Array.from(new Set(classSubjects));

        user.enrolledCourses.forEach(ec => {
            if (!ec.course) return;
            (ec.course.chapters || []).forEach(chapter => {
                (chapter.liveClasses || []).forEach(live => {
                    liveClasses.push({ ...live, courseTitle: ec.course.title, instructor: ec.course.instructor?.name });
                });
            });
        });

        // Sort live classes by date
        liveClasses.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.render('courses', {
            user,
            enrolledCourses: user.enrolledCourses,
            exploreCourses,
            freeCourses,
            liveClasses,
            subjects,
            search,
            activeSubject: subject || 'all',
            userClass,
            notifications
        });
    } catch (err) {
        console.error('Class Hub Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// ---- Notes (E-Library & Course Folders) ----
router.get('/notes', protect, async (req, res) => {
    try {
        await connectDB();
        const userId = req.session.userId;
        const User = require('../models/User');
        const Note = require('../models/Note');
        const Course = require('../models/Course');
        const Folder = require('../models/Folder');
        const AcademicClass = require('../models/AcademicClass');

        const user = await User.findById(userId).lean();
        if (!user) return res.redirect('/login');

        const { search, subject, courseId } = req.query;
        const userClass = user.classLevel || user.class || 'Class 10';
        const userClassClean = userClass.trim();

        // Class matching helper (Strict class filtering with General/All fallbacks)
        const isClassMatch = (targetClass, studentClass) => {
            if (!targetClass) return true;
            const studentClean = String(studentClass || '').trim().toLowerCase();
            const studentNum = studentClean.replace(/^class\s*/i, '').trim();

            const targetArray = Array.isArray(targetClass) ? targetClass : [targetClass];
            if (targetArray.length === 0) return true;

            return targetArray.some(tc => {
                if (!tc) return true;
                const tcClean = String(tc).trim().toLowerCase();
                if (tcClean === 'general' || tcClean === 'general academic' || tcClean === 'all' || tcClean === 'global') {
                    return true;
                }
                const tcNum = tcClean.replace(/^class\s*/i, '').trim();

                if (tcClean === studentClean) return true;
                if (studentNum && tcNum && studentNum === tcNum) return true;
                if (studentNum && tcClean.includes(studentNum)) return true;
                if (tcClean.includes(studentClean) || studentClean.includes(tcClean)) return true;
                return false;
            });
        };

        const [allDbNotes, allDbCustomFolders, courses] = await Promise.all([
            Note.find({}).populate('addedBy', 'name').populate('course', 'title').sort({ createdAt: -1 }).lean(),
            Folder.find({}).sort({ createdAt: -1 }).lean(),
            Course.find({}).populate('instructor', 'name').lean()
        ]);

        // Build list of user enrolled course IDs & purchased note IDs
        const enrolledCourseIds = (user.enrolledCourses || []).map(ec => {
            if (!ec || !ec.course) return null;
            return (ec.course._id ? ec.course._id.toString() : ec.course.toString());
        }).filter(Boolean);

        const purchasedNoteIds = (user.purchasedNotes || []).map(pn => {
            if (!pn) return null;
            return (pn._id ? pn._id.toString() : pn.toString());
        }).filter(Boolean);

        // Filter standalone notes and custom folders by student class (always include purchased notes)
        const dbNotes = allDbNotes.filter(n => isClassMatch(n.classLevel, userClass) || purchasedNoteIds.includes(n._id.toString()));
        const dbCustomFolders = allDbCustomFolders.filter(f => isClassMatch(f.classLevel, userClass));
        const classCourses = courses.filter(c => isClassMatch(c.classLevel || c.targetClass, userClass));

        // Extracted combined notes list
        const allNotesList = [];
        const courseFolders = [];
        const courseCurriculums = {};

        // Add standalone notes for this student's class
        dbNotes.forEach(n => {
            const rawAccess = (n.accessType || 'free').toLowerCase();
            const noteIdStr = n._id.toString();
            const isPurchased = purchasedNoteIds.some(id => id && (id === noteIdStr || noteIdStr.includes(id) || id.includes(noteIdStr)));
            const isFree = rawAccess === 'free' || isPurchased;

            allNotesList.push({
                _id: noteIdStr,
                title: n.title,
                subject: n.subject || 'General Academic',
                classLevel: Array.isArray(n.classLevel) ? n.classLevel[0] : (n.classLevel || userClass),
                filePath: n.fileUrl || n.filePath || '#',
                accessType: isPurchased ? 'free' : rawAccess,
                price: n.price || 50,
                isPurchased,
                isFree,
                isCourseNote: false,
                chapterTitle: n.chapter ? n.chapter.trim() : 'General Notes',
                chapterOrder: 999,
                author: n.addedBy ? n.addedBy.name : (n.author || n.teacherName || 'Instructor'),
                createdAt: n.createdAt
            });
        });

        // Add Course Notes from Courses matching this student's class
        classCourses.forEach(c => {
            const isEnrolled = enrolledCourseIds.includes(c._id.toString());
            const isFreeCourse = c.accessType === 'free';
            const courseSubject = Array.isArray(c.subject) ? c.subject[0] : (c.subject || 'General Academic');
            const instructorName = c.instructor ? c.instructor.name : 'Academic Instructor';

            let noteCountInCourse = 0;
            const nodes = c.curriculumNodes || [];
            const folderList = [];
            const folderIdSet = new Set();
            const folderMap = {};

            // A. Extract folders and notes from curriculumNodes
            if (nodes.length > 0) {
                nodes.forEach((n, idx) => {
                    const isFolderType = n.type === 'folder' || n.type === 'chapter' || n.type === 'section' || n.type === 'unit';
                    const isPayloadNode = n.type === 'note' || n.type === 'video' || n.type === 'quiz' || n.type === 'liveClass' || n.filePath || n.fileUrl || n.videoPath || n.meetingUrl || n.quizId;
                    
                    if (isFolderType || (!isPayloadNode && n.name)) {
                        const fId = n._id ? n._id.toString() : ('f-' + idx);
                        folderIdSet.add(fId);
                        const fObj = {
                            _id: fId,
                            name: n.name || ('Folder ' + (idx + 1)),
                            parentId: n.parentId ? n.parentId.toString() : null,
                            order: typeof n.order === 'number' ? n.order : idx
                        };
                        folderMap[fId] = fObj;
                        folderList.push(fObj);
                    }
                });

                const noteNodes = nodes.filter(n => n.type === 'note' || n.filePath || n.fileUrl);
                noteNodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                noteNodes.forEach((cn, idx) => {
                    noteCountInCourse++;
                    const pIdStr = cn.parentId ? cn.parentId.toString() : null;
                    const parentFolder = pIdStr && folderMap[pIdStr] ? folderMap[pIdStr] : null;
                    const chapterTitle = parentFolder ? parentFolder.name : 'General Course Notes';
                    const chapterOrder = parentFolder ? parentFolder.order : 999;
                    const noteOrder = typeof cn.order === 'number' ? cn.order : idx;

                    const cnIdStr = cn._id ? cn._id.toString() : (c._id + '-cn-' + idx);
                    const isNotePurchased = purchasedNoteIds.some(id => id && (id === cnIdStr || cnIdStr.includes(id) || id.includes(cnIdStr)));

                    if (!subject || subject === 'all' || subject === courseSubject) {
                        allNotesList.push({
                            _id: cnIdStr,
                            title: cn.name || 'Course Note',
                            subject: courseSubject,
                            classLevel: userClass,
                            filePath: cn.filePath || cn.fileUrl || '#',
                            accessType: (isFreeCourse || isEnrolled || isNotePurchased) ? 'free' : 'paid',
                            isCourseNote: true,
                            courseId: c._id,
                            courseTitle: c.title,
                            parentFolderId: pIdStr,
                            chapterTitle,
                            chapterOrder,
                            noteOrder,
                            isFreeCourse,
                            isEnrolled,
                            isPurchased: isNotePurchased,
                            isFree: isFreeCourse || isEnrolled || isNotePurchased,
                            author: instructorName,
                            createdAt: c.createdAt
                        });
                    }
                });
            }

            // B. Extract folders and notes from legacy chapters array if present
            if (c.chapters && c.chapters.length > 0) {
                c.chapters.forEach((ch, chIdx) => {
                    const chId = ch._id ? ch._id.toString() : ('ch-' + chIdx);
                    const chTitle = ch.title || ch.name || ('Chapter ' + (chIdx + 1));
                    
                    if (!folderIdSet.has(chId) && !folderList.some(f => f.name.trim().toLowerCase() === chTitle.trim().toLowerCase())) {
                        folderIdSet.add(chId);
                        folderList.push({
                            _id: chId,
                            name: chTitle,
                            parentId: null,
                            order: chIdx
                        });
                    }

                    (ch.notes || []).forEach((cn, nIdx) => {
                        noteCountInCourse++;
                        const cnIdStr = cn._id ? cn._id.toString() : (c._id + '-ch-' + chIdx + '-' + nIdx);
                        const isNotePurchased = purchasedNoteIds.some(id => id && (id === cnIdStr || cnIdStr.includes(id) || id.includes(cnIdStr)));

                        if (!subject || subject === 'all' || subject === courseSubject) {
                            allNotesList.push({
                                _id: cnIdStr,
                                title: cn.title || 'Course Note',
                                subject: courseSubject,
                                classLevel: userClass,
                                filePath: cn.filePath || '#',
                                accessType: (isFreeCourse || isEnrolled || isNotePurchased) ? 'free' : 'paid',
                                isCourseNote: true,
                                courseId: c._id,
                                courseTitle: c.title,
                                parentFolderId: chId,
                                chapterTitle: chTitle,
                                chapterOrder: chIdx,
                                noteOrder: nIdx,
                                isFreeCourse,
                                isEnrolled,
                                isPurchased: isNotePurchased,
                                isFree: isFreeCourse || isEnrolled || isNotePurchased,
                                author: instructorName,
                                createdAt: c.createdAt
                            });
                        }
                    });
                });
            }

            courseCurriculums[c._id.toString()] = folderList;

            courseFolders.push({
                _id: c._id,
                title: c.title,
                subject: courseSubject,
                accessType: c.accessType,
                isFreeCourse,
                isEnrolled,
                noteCount: noteCountInCourse > 0 ? noteCountInCourse : folderList.length,
                thumbnail: c.thumbnail,
                author: instructorName
            });
        });

        // 3. Extract superadmin subjects strictly for THIS student's class from AcademicClass
        const allAcademicClasses = await AcademicClass.find({}).lean();
        const classRegex = new RegExp(userClassClean.replace(/[^a-zA-Z0-9]/g, '.*'), 'i');
        let matchedAc = allAcademicClasses.find(c => classRegex.test(c.name)) || allAcademicClasses.find(c => isClassMatch(c.name, userClassClean));

        let assignedSubjects = (matchedAc && Array.isArray(matchedAc.subjects) && matchedAc.subjects.length > 0)
            ? matchedAc.subjects.map(s => s ? s.trim() : '').filter(Boolean)
            : ['Bangla', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'ICT'];

        const subjects = Array.from(new Set(assignedSubjects)).sort();

        // Filter notes and customFolders by search, courseId, or subject if query parameter provided
        let filteredNotes = allNotesList;
        let filteredCustomFolders = dbCustomFolders || [];

        if (search) {
            const q = search.trim().toLowerCase();
            filteredNotes = allNotesList.filter(n =>
                (n.title && n.title.toLowerCase().includes(q)) ||
                (n.subject && n.subject.toLowerCase().includes(q)) ||
                (n.courseTitle && n.courseTitle.toLowerCase().includes(q))
            );
        } else if (courseId) {
            filteredNotes = allNotesList.filter(n => n.courseId && n.courseId.toString() === courseId.toString());
        } else if (subject && subject !== 'all') {
            const sClean = subject.trim().toLowerCase();
            filteredNotes = allNotesList.filter(n => n.subject && (n.subject.trim().toLowerCase() === sClean || n.subject.trim().toLowerCase() === 'general' || n.subject.trim().toLowerCase() === 'general academic'));
            filteredCustomFolders = dbCustomFolders.filter(f => f.subject && (f.subject.trim().toLowerCase() === sClean || f.subject.trim().toLowerCase() === 'general' || f.subject.trim().toLowerCase() === 'general academic'));
        }

        res.render('notes', {
            notes: filteredNotes,
            customFolders: filteredCustomFolders,
            courseFolders,
            courseCurriculums,
            subjects,
            search,
            activeSubject: subject || 'all',
            activeCourseId: courseId || null,
            user,
            userClass
        });
    } catch (err) {
        console.error('Notes Route Error:', err);
        res.render('notes', { notes: [], customFolders: [], courseFolders: [], subjects: [], search: '', activeSubject: 'all', user: null });
    }
});

// ---- Checkout Standalone & Course Paid Note ----
router.get('/notes/checkout/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const noteIdParam = String(req.params.id || '').trim();
        let note = null;

        // 1. Try finding standalone Note by ID if valid ObjectId
        const isValidId = Boolean(mongoose && mongoose.Types && mongoose.Types.ObjectId && mongoose.Types.ObjectId.isValid(noteIdParam));
        if (isValidId) {
            note = await Note.findById(noteIdParam).lean();
        }

        // 2. If not found in Note collection, search in Course collection
        if (!note) {
            try {
                const courses = await Course.find({}).lean();
                for (const c of courses) {
                    if (!c) continue;
                    const cIdStr = c._id ? c._id.toString() : '';

                    if (c.curriculum && Array.isArray(c.curriculum)) {
                        for (const node of c.curriculum) {
                            if (!node) continue;
                            const nodeIdStr = node._id ? node._id.toString() : '';
                            if ((nodeIdStr && nodeIdStr === noteIdParam) || (cIdStr && noteIdParam.includes(cIdStr))) {
                                note = {
                                    _id: noteIdParam,
                                    title: node.name || node.title || 'Course Note',
                                    subject: c.subject || 'Academic Note',
                                    price: c.price || 50,
                                    classLevel: [c.classLevel || 'General'],
                                    chapter: 'Course Note'
                                };
                                break;
                            }
                        }
                    }
                    if (note) break;
                }
            } catch (err) {
                console.error('Course lookup error in checkout:', err);
            }
        }

        // 3. Fallback note structure if note object not found
        if (!note) {
            note = {
                _id: noteIdParam,
                title: 'Academic Premium Note',
                subject: 'Academic Note',
                price: 50,
                classLevel: ['General'],
                chapter: 'General Note'
            };
        }

        const user = await User.findById(req.session.userId).lean();
        if (!user) return res.redirect('/login');

        // Render checkout page for note
        const siteSettings = await Setting.findOne({ key: 'site_settings' }).lean();

        res.render('checkout-note', {
            note,
            user,
            siteSettings: siteSettings?.value || {},
            error: null
        });
    } catch (err) {
        console.error('Note checkout error stack:', err);
        res.status(500).send('There was an error loading checkout: ' + (err.stack || err.message || err));
    }
});

router.all('/notes/buy/:id', protect, async (req, res) => {
    res.redirect(`/notes/checkout/${req.params.id}`);
});

// ---- Checkout Question Bank ----
router.get('/question-bank/checkout/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const qbId = String(req.params.id || '').trim();
        const bank = await QuestionBank.findById(qbId).lean();

        if (!bank) {
            return res.status(404).send('Question Bank entry not found.');
        }

        const user = await User.findById(req.session.userId).lean();
        if (!user) return res.redirect('/login');

        const siteSettings = await Setting.findOne({ key: 'site_settings' }).lean();

        const noteObj = {
            _id: bank._id,
            title: bank.title || `${bank.subject} ${bank.board ? '- ' + bank.board : ''} (${bank.year || ''}) Question Bank`.trim(),
            subject: bank.subject || 'Academic Question Bank',
            price: bank.price || 0,
            classLevel: Array.isArray(bank.classLevel) ? bank.classLevel : [bank.classLevel || 'General'],
            chapter: bank.board || 'Question Bank',
            itemType: 'question_bank'
        };

        res.render('checkout-note', {
            note: noteObj,
            user,
            siteSettings: siteSettings?.value || {},
            error: null
        });
    } catch (err) {
        console.error('Question Bank checkout error:', err);
        res.status(500).send('Error loading checkout: ' + err.message);
    }
});

router.all('/question-bank/buy/:id', protect, async (req, res) => {
    res.redirect(`/question-bank/checkout/${req.params.id}`);
});



router.get(['/note/:id', '/note-viewer/:id'], async (req, res) => {
    try {
        await connectDB();
        const noteIdParam = String(req.params.id || '').trim();
        let note = null;

        const mongoose = require('mongoose');
        const isValidId = Boolean(mongoose && mongoose.Types && mongoose.Types.ObjectId && mongoose.Types.ObjectId.isValid(noteIdParam));
        if (isValidId) {
            note = await Note.findById(noteIdParam).lean();
        }

        // If not found in standalone Note collection, search in Course curriculumNodes & chapters
        if (!note) {
            const Course = require('../models/Course');
            const courses = await Course.find({}).lean();
            for (const c of courses) {
                if (c.curriculumNodes && c.curriculumNodes.length > 0) {
                    const node = c.curriculumNodes.find(n => n._id && n._id.toString() === noteIdParam);
                    if (node) {
                        note = {
                            _id: node._id,
                            title: node.title || 'Course Note',
                            subject: c.title || 'Course Material',
                            classLevel: c.classLevel || 'General',
                            fileUrl: node.fileUrl || node.filePath || '',
                            description: node.description || ''
                        };
                        break;
                    }
                }
                if (c.chapters && c.chapters.length > 0) {
                    for (const ch of c.chapters) {
                        if (ch.notes && ch.notes.length > 0) {
                            const cn = ch.notes.find(n => n._id && n._id.toString() === noteIdParam);
                            if (cn) {
                                note = {
                                    _id: cn._id,
                                    title: cn.title || 'Chapter Note',
                                    subject: ch.title || c.title || 'Course Material',
                                    classLevel: c.classLevel || 'General',
                                    fileUrl: cn.fileUrl || cn.filePath || '',
                                    description: cn.description || ''
                                };
                                break;
                            }
                        }
                    }
                }
                if (note) break;
            }
        }

        // Fallback note object if note ID is synthetic or custom
        if (!note) {
            note = {
                _id: noteIdParam,
                title: 'Note Reader',
                subject: 'General',
                classLevel: 'All',
                fileUrl: '',
                description: 'নোট কন্টেন্ট লোড হচ্ছে না বা কন্টেন্ট নেই।'
            };
        }

        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId);
            if (user) {
                const todayStr = new Date().toISOString().split('T')[0];
                if (!user.dailyGoals || user.dailyGoals.date !== todayStr) {
                    user.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, todayXpEarned: 0, todayWatchedLessons: [] };
                }
                user.dailyGoals.notesCount = (user.dailyGoals.notesCount || 0) + 1;
                user.dailyGoals.todayXpEarned = (user.dailyGoals.todayXpEarned || 0) + 20;
                user.totalXP = (user.totalXP || 0) + 20;
                user.markModified('dailyGoals');
                await user.save();
            }
        }

        res.render('note-viewer', { note, user: req.session.user || null });
    } catch (err) {
        console.error('Note Viewer Error:', err);
        res.status(500).send('Error loading note');
    }
});

router.get('/question-bank', async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const User = require('../models/User');
        const AcademicClass = require('../models/AcademicClass');

        let dbUser = null;
        if (req.session && req.session.userId) {
            dbUser = await User.findById(req.session.userId).lean().catch(() => null);
        }

        const userClass = dbUser ? (dbUser.classLevel || 'General') : 'General';
        const { search, board, subject, year } = req.query;

        const isClassMatch = (targetClass, studentClass) => {
            if (!targetClass || !studentClass) return true;
            const targetArr = Array.isArray(targetClass) ? targetClass : [targetClass];
            const studentClean = String(studentClass).toLowerCase().replace(/class\s*/i, '').trim();
            const studentNum = studentClean.match(/\d+/)?.[0];

            return targetArr.some(tc => {
                if (!tc) return false;
                const tcClean = String(tc).toLowerCase().replace(/class\s*/i, '').trim();
                const tcNum = tcClean.match(/\d+/)?.[0];

                if (tcClean === studentClean) return true;
                if (studentNum && tcNum && studentNum === tcNum) return true;
                if (studentNum && tcClean.includes(studentNum)) return true;
                if (tcClean.includes(studentClean) || studentClean.includes(tcClean)) return true;
                return false;
            });
        };

        const allQuestions = await QuestionBank.find({
            $or: [{ status: 'approved' }, { status: { $exists: false } }],
            isCustom: { $ne: true },
            title: { $not: /Personalized Exam|Custom Exam/i }
        }).sort({ year: -1, createdAt: -1 }).lean();
        const linkedQuestions = await Question.find({}).lean();
        const academicClasses = await AcademicClass.find({}).lean().catch(() => []);

        // Strict class level filtering: ONLY show student's own class question banks
        const classFilteredRaw = allQuestions.filter(q => isClassMatch(q.classLevel, userClass));
        const questionsListToUse = classFilteredRaw.length > 0 ? classFilteredRaw : allQuestions;

        // User bookmark & purchase arrays
        const savedBankIds = (dbUser && Array.isArray(dbUser.savedQuestionBanks)) 
            ? dbUser.savedQuestionBanks.map(id => id ? id.toString() : '') 
            : [];
        const purchasedBankIds = (dbUser && Array.isArray(dbUser.purchasedQuestionBanks)) 
            ? dbUser.purchasedQuestionBanks.map(id => id ? id.toString() : '') 
            : [];
        const enrolledCourseIds = (dbUser && Array.isArray(dbUser.enrolledCourses)) 
            ? dbUser.enrolledCourses.map(e => e.course ? e.course.toString() : '').filter(Boolean) 
            : [];
        const userRole = dbUser ? dbUser.role : (req.session.user ? req.session.user.role : 'student');

        // Attach linked question counts and access flags to question bank items
        const questions = questionsListToUse.map(q => {
            const qIdStr = q._id.toString();
            const questionCount = linkedQuestions.filter(lq => lq.bankId && lq.bankId.toString() === qIdStr).length;
            const pdfUrl = q.fileUrl || q.filePath || '';
            const isPdfFile = Boolean(pdfUrl && pdfUrl.toLowerCase().endsWith('.pdf'));

            const isFree = !q.accessType || q.accessType === 'Free';
            const isSaved = savedBankIds.includes(qIdStr);
            const isBought = isFree || purchasedBankIds.includes(qIdStr) || (q.course && enrolledCourseIds.includes(q.course.toString())) || (userRole !== 'student');

            return {
                ...q,
                title: q.title || `${q.subject || 'Subject'} - ${q.board || 'Board Exam'} (${q.year || ''})`.trim(),
                questionCount,
                hasPractice: questionCount > 0,
                isPdfFile,
                isFree,
                isSaved,
                isBought,
                price: q.price || 0
            };
        });

        // 1. DYNAMIC SUBJECTS: Strictly use superadmin assigned class subjects for THIS class from AcademicClass
        const classRegex = new RegExp(userClass.replace(/[^a-zA-Z0-9]/g, '.*'), 'i');
        let matchedClassDoc = academicClasses.find(c => classRegex.test(c.name)) || academicClasses.find(c => isClassMatch(c.name, userClass));

        let assignedSubjects = (matchedClassDoc && Array.isArray(matchedClassDoc.subjects) && matchedClassDoc.subjects.length > 0) 
            ? matchedClassDoc.subjects.map(s => s ? s.trim() : '').filter(Boolean) 
            : [];

        if (assignedSubjects.length === 0) {
            const subSet = new Set();
            questions.forEach(q => q.subject && subSet.add(q.subject.trim()));
            assignedSubjects = Array.from(subSet);
        }

        const mergedSubjects = Array.from(new Set(assignedSubjects)).sort();

        // 2. BOARDS IN ENGLISH: Standard Bangladesh boards + DB boards
        const standardBoards = [
            'Dhaka Board', 'Chittagong Board', 'Comilla Board', 'Rajshahi Board',
            'Jessore Board', 'Dinajpur Board', 'Sylhet Board', 'Barisal Board',
            'Mymensingh Board', 'Madrasah Board', 'Technical Board'
        ];
        const rawBoards = questions.map(q => (q.board || '').trim()).filter(Boolean);
        const mergedBoards = Array.from(new Set([
            ...standardBoards,
            ...rawBoards
        ].map(b => String(b || '').trim()).filter(Boolean))).sort();

        // 3. YEARS (1980 to 2026 + any custom year in DB)
        const defaultYears = [];
        for (let y = 2026; y >= 1980; y--) {
            defaultYears.push(String(y));
        }
        const rawYears = questions.map(q => (q.year || '').trim()).filter(Boolean);
        const mergedYears = Array.from(new Set([
            ...defaultYears,
            ...rawYears
        ].map(y => String(y || '').trim()).filter(Boolean))).sort((a, b) => Number(b) - Number(a));

        res.render('question-bank', {
            questions,
            boards: mergedBoards,
            subjects: mergedSubjects,
            years: mergedYears,
            userClass,
            search: search || '',
            activeBoard: board || 'all',
            activeSubject: subject || 'all',
            activeYear: year || 'all',
            user: dbUser || req.session.user || null
        });
    } catch (err) {
        console.error('Question Bank route error:', err);
        res.render('question-bank', {
            questions: [],
            boards: [],
            subjects: [],
            years: [],
            classes: [],
            userClass: 'General',
            search: '',
            activeBoard: 'all',
            activeSubject: 'all',
            activeYear: 'all',
            user: req.session.user || null
        });
    }
});

// GET /question-bank/view/:id - Detailed Question Bank View Page with Questions, Answers & Explanations
router.get('/question-bank/view/:id', async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const bankId = req.params.id;
        const bank = await QuestionBank.findById(bankId).lean();

        if (!bank) {
            return res.status(404).render('404', { message: 'Question Bank not found' });
        }

        let dbUser = null;
        let isBought = false;
        let isSaved = false;

        const isFree = Boolean(bank.isFree || !bank.accessType || String(bank.accessType).toLowerCase() === 'free');

        if (req.session && req.session.userId) {
            dbUser = await User.findById(req.session.userId).lean();
            if (dbUser) {
                const purchasedBankIds = (dbUser.purchasedQuestionBanks || []).map(id => id ? id.toString() : '');
                const boughtBankIds = (dbUser.boughtQuestionBanks || []).map(id => id ? id.toString() : '');
                const enrolledCourseIds = (dbUser.enrolledCourses || []).map(ec => ec && ec.course ? ec.course.toString() : '');
                const userRole = dbUser.role || 'student';

                const isPurchased = purchasedBankIds.includes(bankId.toString()) || boughtBankIds.includes(bankId.toString());
                const isEnrolled = bank.course && enrolledCourseIds.includes(bank.course.toString());
                const isNonStudent = userRole !== 'student';

                isBought = isFree || isPurchased || isEnrolled || isNonStudent;

                const savedBanks = dbUser.savedQuestionBanks || [];
                isSaved = savedBanks.some(sId => sId && sId.toString() === bankId.toString());
            }
        } else {
            isBought = isFree;
        }

        if (!isFree && !isBought) {
            return res.redirect(`/question-bank/checkout/${bankId}`);
        }

        const questions = await Question.find({ bankId }).sort({ createdAt: 1 }).lean();

        // Increment views counter
        QuestionBank.findByIdAndUpdate(bankId, { $inc: { views: 1 } }).exec();

        const bSubject = (bank.subject || 'Subject').trim();
        const bBoard = (bank.board || 'Board Exam').trim();
        const bYear = (bank.year || '').trim();
        const boardWithYear = [bBoard, bYear].filter(Boolean).join(' ');
        let pageTitle = bank.title && bank.title.trim() !== '' ? bank.title.trim() : `${bSubject} - ${boardWithYear}`;
        if (bYear && !pageTitle.includes(bYear)) {
            pageTitle = `${pageTitle} ${bYear}`;
        }

        res.render('question-bank-view', {
            bank,
            pageTitle,
            activePage: 'questions',
            questions: questions || [],
            isBought,
            isSaved,
            isFree,
            user: dbUser || req.session.user || null
        });
    } catch (err) {
        console.error('Question Bank View route error:', err);
        res.redirect('/question-bank');
    }
});

// GET /question-bank/solve/:id — Interactive Full-Page Solve Studio
router.get('/question-bank/solve/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const mongoose = require('mongoose');
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const bankId = req.params.id;
        if (!bankId || !mongoose.Types.ObjectId.isValid(bankId)) {
            return res.redirect('/question-bank');
        }

        const bank = await QuestionBank.findById(bankId).lean();
        if (!bank) return res.status(404).render('404', { message: 'Question Bank not found' });

        const user = (req.session && req.session.userId) ? await User.findById(req.session.userId).lean() : null;
        const questions = await Question.find({ bankId }).sort({ createdAt: 1 }).lean();

        const bSubject = (bank.subject || 'Subject').trim();
        const bBoard = (bank.board || 'Board Exam').trim();
        const bYear = (bank.year || '').trim();
        const boardWithYear = [bBoard, bYear].filter(Boolean).join(' ');
        let pageTitle = bank.title && bank.title.trim() !== '' ? bank.title.trim() : `${bSubject} - ${boardWithYear}`;
        if (bYear && !pageTitle.includes(bYear)) {
            pageTitle = `${pageTitle} ${bYear}`;
        }

        res.render('question-bank-solve', {
            bank,
            pageTitle,
            questions: questions || [],
            user: user || req.session.user || null
        });
    } catch (err) {
        console.error('Question Bank Solve Route Error:', err);
        res.redirect('/question-bank');
    }
});

// POST /question-bank/solve/:id — Submit Solve Exam Session
router.post('/question-bank/solve/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');

        const bankId = req.params.id;
        const bank = await QuestionBank.findById(bankId).lean();
        if (!bank) return res.status(404).send('Question Bank not found');

        const questions = await Question.find({ bankId }).sort({ createdAt: 1 }).lean();
        const body = req.body || {};

        let mcqScore = 0;
        let maxMcqScore = 0;
        let mcqTotalQuestions = 0;
        let mcqCorrectCount = 0;
        let wrongMcqCount = 0;
        let negativeMarksDeducted = 0;
        let nonMcqCount = 0;

        const isNegativeMarking = !!bank.negativeMarking;
        const negVal = (typeof bank.negativeMarkValue === 'number' && bank.negativeMarkValue > 0) ? bank.negativeMarkValue : 0.25;

        const userAnswers = [];

        for (const q of questions) {
            const qIdStr = q._id.toString();
            const qType = q.questionType || 'MCQ';
            const defaultMark = (qType === 'Medium') ? 2 : ((qType === 'Comprehension') ? 10 : 1);
            const qMaxMark = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : defaultMark;

            if (qType === 'MCQ') {
                mcqTotalQuestions++;
                maxMcqScore += qMaxMark;

                const selectedIdx = body[`mcq_${qIdStr}`] !== undefined ? parseInt(body[`mcq_${qIdStr}`]) : -1;
                const opts = Array.isArray(q.options) ? q.options : [];
                const selectedText = (selectedIdx >= 0 && opts[selectedIdx]) ? opts[selectedIdx] : '';

                let isCorrect = false;
                if (typeof q.correctAnswerIndex === 'number' && q.correctAnswerIndex >= 0) {
                    isCorrect = (selectedIdx === q.correctAnswerIndex);
                } else if (q.correctAnswer && selectedText) {
                    isCorrect = (selectedText.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase());
                }

                let marksObtained = 0;
                if (isCorrect) {
                    marksObtained = qMaxMark;
                    mcqScore += qMaxMark;
                    mcqCorrectCount++;
                } else if (selectedIdx >= 0) {
                    wrongMcqCount++;
                    if (isNegativeMarking) {
                        marksObtained = -negVal;
                        mcqScore -= negVal;
                        negativeMarksDeducted += negVal;
                    }
                }

                userAnswers.push({
                    questionId: q._id,
                    questionType: 'MCQ',
                    selectedOptionIndex: selectedIdx,
                    selectedOptionText: selectedText,
                    isCorrect,
                    marksObtained,
                    maxMarks: qMaxMark
                });
            } else {
                nonMcqCount++;
                const written = body[`written_${qIdStr}`] ? String(body[`written_${qIdStr}`]).trim() : '';
                userAnswers.push({
                    questionId: q._id,
                    questionType: qType,
                    writtenAnswer: written,
                    isCorrect: false,
                    marksObtained: 0,
                    maxMarks: qMaxMark
                });
            }
        }

        mcqScore = parseFloat(mcqScore.toFixed(2));
        negativeMarksDeducted = parseFloat(negativeMarksDeducted.toFixed(2));

        const timeTakenSeconds = parseInt(body.timeTakenSeconds) || 0;

        const attempt = await new QuestionBankAttempt({
            user: req.session.userId,
            bank: bank._id,
            userAnswers,
            mcqScore,
            maxMcqScore,
            mcqTotalQuestions,
            mcqCorrectCount,
            wrongMcqCount,
            negativeMarksDeducted,
            totalBankQuestions: questions.length,
            nonMcqCount,
            timeTakenSeconds
        }).save();

        // Increment bank exam takers
        await QuestionBank.findByIdAndUpdate(bank._id, { $inc: { examTakers: 1 } });

        // Update user's daily activity & XP stats
        const User = require('../models/User');
        const userDoc = await User.findById(req.session.userId);
        if (userDoc) {
            const todayStr = new Date().toISOString().split('T')[0];
            if (!userDoc.dailyGoals || userDoc.dailyGoals.date !== todayStr) {
                userDoc.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, todayXpEarned: 0 };
            }
            userDoc.dailyGoals.quizzesCount = (userDoc.dailyGoals.quizzesCount || 0) + 1;
            userDoc.dailyGoals.todayXpEarned = (userDoc.dailyGoals.todayXpEarned || 0) + 50;
            userDoc.totalXP = (userDoc.totalXP || 0) + 50;
            userDoc.markModified('dailyGoals');
            await userDoc.save();
        }

        res.redirect(`/question-bank/result/${attempt._id}`);
    } catch (err) {
        console.error('Question Bank Solve Submit Error:', err);
        res.redirect('/question-bank');
    }
});

// GET /question-bank/result/:attemptId — Exam Result Summary Dashboard
router.get('/question-bank/result/:attemptId', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const User = require('../models/User');

        const attempt = await QuestionBankAttempt.findById(req.params.attemptId)
            .populate('bank')
            .lean();

        if (!attempt) return res.status(404).send('Attempt result not found');

        const user = await User.findById(req.session.userId).lean();
        const bank = attempt.bank || {};
        const bSubject = (bank.subject || 'Subject').trim();
        const bBoard = (bank.board || 'Board Exam').trim();
        const bYear = (bank.year || '').trim();
        const boardWithYear = [bBoard, bYear].filter(Boolean).join(' ');
        let examTitle = bank.title && bank.title.trim() !== '' ? bank.title.trim() : `${bSubject} - ${boardWithYear}`;
        if (bYear && !examTitle.includes(bYear)) {
            examTitle = `${examTitle} ${bYear}`;
        }
        const pageTitle = `${examTitle} - Result`;

        res.render('question-bank-result', {
            attempt,
            bank,
            pageTitle,
            activePage: 'questions',
            user: user || req.session.user
        });
    } catch (err) {
        console.error('Question Bank Result Route Error:', err);
        res.redirect('/question-bank');
    }
});

// GET /question-bank/review/:attemptId — Detailed Exam Review & Feedback Page
router.get('/question-bank/review/:attemptId', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const attempt = await QuestionBankAttempt.findById(req.params.attemptId)
            .populate('bank')
            .lean();

        if (!attempt) return res.status(404).send('Attempt result not found');

        const questions = await Question.find({ bankId: attempt.bank._id }).sort({ createdAt: 1 }).lean();
        const user = await User.findById(req.session.userId).lean();

        const bank = attempt.bank || {};
        const bSubject = (bank.subject || 'Subject').trim();
        const bBoard = (bank.board || 'Board Exam').trim();
        const bYear = (bank.year || '').trim();
        const boardWithYear = [bBoard, bYear].filter(Boolean).join(' ');
        let examTitle = bank.title && bank.title.trim() !== '' ? bank.title.trim() : `${bSubject} - ${boardWithYear}`;
        if (bYear && !examTitle.includes(bYear)) {
            examTitle = `${examTitle} ${bYear}`;
        }
        const pageTitle = `${examTitle} - Review`;

        // Map questions with attempt userAnswers
        const answerMap = {};
        (attempt.userAnswers || []).forEach(ua => {
            if (ua.questionId) answerMap[ua.questionId.toString()] = ua;
        });

        const questionsWithReview = questions.map(q => {
            const ua = answerMap[q._id.toString()] || {};
            return {
                ...q,
                userAnswer: ua
            };
        });

        res.render('question-bank-review', {
            attempt,
            bank,
            pageTitle,
            activePage: 'questions',
            questions: questionsWithReview,
            user: user || req.session.user
        });
    } catch (err) {
        console.error('Question Bank Review Route Error:', err);
        res.redirect('/question-bank');
    }
});

// GET /question-bank/written-answers/:attemptId — Student Written Questions & Marks Page
router.get('/question-bank/written-answers/:attemptId', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const attempt = await QuestionBankAttempt.findById(req.params.attemptId)
            .populate('bank')
            .lean();

        if (!attempt) return res.status(404).send('Attempt result not found');

        const questions = await Question.find({ bankId: attempt.bank._id, questionType: { $ne: 'MCQ' } }).sort({ createdAt: 1 }).lean();
        const bank = attempt.bank || {};
        const bSubject = (bank.subject || 'Subject').trim();
        const bBoard = (bank.board || 'Board Exam').trim();
        const bYear = (bank.year || '').trim();
        const boardWithYear = [bBoard, bYear].filter(Boolean).join(' ');
        let examTitle = bank.title && bank.title.trim() !== '' ? bank.title.trim() : `${bSubject} - ${boardWithYear}`;
        if (bYear && !examTitle.includes(bYear)) {
            examTitle = `${examTitle} ${bYear}`;
        }
        const pageTitle = `${examTitle} - Written Answers`;

        res.render('question-bank-written', {
            attempt,
            bank,
            pageTitle,
            activePage: 'questions',
            questions: questionsWithReview,
            user: user || req.session.user
        });
    } catch (err) {
        console.error('Question Bank Written Answers Route Error:', err);
        res.redirect('/question-bank');
    }
});

// Toggle Save/Bookmark for a Question Bank
router.post('/api/question-bank/:id/save', protect, async (req, res) => {
    try {
        await connectDB();
        const User = require('../models/User');
        const qbId = req.params.id;
        const user = await User.findById(req.session.userId);

        if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

        if (!user.savedQuestionBanks) user.savedQuestionBanks = [];
        const index = user.savedQuestionBanks.findIndex(id => id && id.toString() === qbId);
        let isSaved = false;

        if (index > -1) {
            user.savedQuestionBanks.splice(index, 1);
            isSaved = false;
        } else {
            user.savedQuestionBanks.push(qbId);
            isSaved = true;
        }

        await user.save();
        req.session.user = user.toObject();

        res.json({ success: true, isSaved });
    } catch (err) {
        console.error('Save Question Bank error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Endpoint to fetch interactive practice questions for a specific Question Bank
router.get('/api/question-bank/:id/questions', async (req, res) => {
    try {
        await connectDB();
        const Question = require('../models/Question');
        const QuestionBank = require('../models/QuestionBank');
        const bankId = req.params.id;

        const bank = await QuestionBank.findById(bankId).lean();
        const questions = await Question.find({ bankId }).sort({ createdAt: 1 }).lean();

        // Increment views: a real student opened this bank
        QuestionBank.findByIdAndUpdate(bankId, { $inc: { views: 1 } }).exec();

        res.json({
            success: true,
            bank: bank || null,
            questions: questions || []
        });
    } catch (err) {
        console.error('Fetch practice questions error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


router.get('/notice-details/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const dbUser = await User.findById(req.session.userId).lean();
        if (!dbUser) return res.redirect('/login');

        const { type } = req.query;
        const id = req.params.id;

        const Announcement = require('../models/Announcement');
        const NotificationLog = require('../models/NotificationLog');

        let noticeData = null;

        const formatTimeAgo = (date, isLive = false) => {
            if (!date) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
            const past = new Date(date);
            if (isNaN(past.getTime())) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
            const diffMins = Math.floor(Math.abs(new Date() - past) / (1000 * 60));
            const toBn = num => num.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
            const suffix = isLive ? 'শুরু হয়েছে' : 'পাঠানো হয়েছে';
            if (diffMins < 1) return `এখনই ${suffix}`;
            if (diffMins < 60) return `${toBn(diffMins)} মিনিট আগে ${suffix}`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${toBn(diffHours)} ঘণ্টা আগে ${suffix}`;
            return `${toBn(Math.floor(diffHours / 24))} দিন আগে ${suffix}`;
        };

        if (type === 'ann' || id.startsWith('ann_')) {
            const cleanId = id.replace('ann_', '');
            const ann = await Announcement.findById(cleanId).populate('courseId', 'title instructor').populate('authorId', 'name profileImage').lean();
            if (ann) {
                noticeData = {
                    id: 'ann_' + ann._id,
                    title: ann.title,
                    message: ann.content,
                    courseTitle: ann.courseId ? ann.courseId.title : null,
                    senderName: ann.authorId ? ann.authorId.name : 'কোর্স টিচার',
                    senderImage: ann.authorId?.profileImage || '/images/default-avatar.png',
                    timeAgo: formatTimeAgo(ann.createdAt, false),
                    formattedDate: new Date(ann.createdAt).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }),
                    isHighPriority: ann.priority === 'high',
                    category: ann.priority === 'high' ? 'Important Notice' : 'Course Notice',
                    link: ann.courseId ? `/course-details/${ann.courseId._id}` : '/courses',
                    buttonText: 'কোর্স পেজে যান'
                };
            }
        } else if (type === 'log' || id.startsWith('notice_')) {
            const cleanId = id.replace('notice_', '');
            const logItem = await NotificationLog.findById(cleanId).lean();
            if (logItem) {
                noticeData = {
                    id: 'notice_' + logItem._id,
                    title: logItem.title,
                    message: logItem.body || logItem.message,
                    courseTitle: 'Announcement',
                    senderName: 'এডুকেশন অ্যাডমিন',
                    senderImage: '/images/default-avatar.png',
                    timeAgo: formatTimeAgo(logItem.createdAt || logItem.sentAt, false),
                    formattedDate: new Date(logItem.createdAt || logItem.sentAt || Date.now()).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }),
                    isHighPriority: logItem.priority === 'high' || logItem.priority === 'urgent',
                    category: 'System Announcement',
                    link: logItem.url || logItem.link || '/dashboard',
                    buttonText: 'গন্তব্যে যান'
                };
            }
        }

        if (!noticeData) {
            const notif = await Notification.findById(id.replace('notice_', '')).lean();
            if (notif) {
                noticeData = {
                    id: 'notice_' + notif._id,
                    title: notif.title,
                    message: notif.message,
                    courseTitle: 'Announcement',
                    senderName: 'সিস্টেম',
                    senderImage: '/images/default-avatar.png',
                    timeAgo: formatTimeAgo(notif.createdAt, false),
                    formattedDate: new Date(notif.createdAt).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }),
                    isHighPriority: true,
                    category: 'Notice',
                    link: notif.link || '/dashboard',
                    buttonText: 'গন্তব্যে যান'
                };
            }
        }

        if (!noticeData) {
            noticeData = {
                id: 'notice_fallback',
                title: 'নোটিশ বিস্তারিত',
                message: 'নোটিশটি পাওয়া যায়নি বা মুছে ফেলা হয়েছে।',
                courseTitle: 'নোটিশ',
                senderName: 'সিস্টেম',
                timeAgo: 'সম্প্রতি',
                formattedDate: new Date().toLocaleDateString('bn-BD'),
                isHighPriority: false,
                category: 'Notice',
                link: '/dashboard',
                buttonText: 'ড্যাশবোর্ডে ফিরে যান'
            };
        }

        res.render('notice-details', {
            notice: noticeData,
            user: dbUser
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading notice details');
    }
});

router.get('/notices', protect, async (req, res) => {
    try {
        await connectDB();
        const dbUser = await User.findById(req.session.userId).lean();
        if (!dbUser) return res.redirect('/login');

        const Announcement = require('../models/Announcement');
        const NotificationLog = require('../models/NotificationLog');

        const enrolledCourseIds = (dbUser.enrolledCourses || []).map(ec => ec.course ? (ec.course._id || ec.course) : null).filter(Boolean);
        const attended = dbUser.attendedNotices || [];

        // 1. Course Announcements from Teachers
        const announcements = await Announcement.find({ courseId: { $in: enrolledCourseIds } })
            .populate('courseId', 'title instructor')
            .populate('authorId', 'name profileImage')
            .sort({ createdAt: -1 })
            .lean();

        // 2. Broadcast Notifications from Admins / Teachers
        const logNotices = await NotificationLog.find({
            $or: [
                { user: dbUser._id },
                { courseId: { $in: enrolledCourseIds } },
                { target: { $in: ['all', 'student', 'class'] } },
                { classLevel: dbUser.classLevel }
            ]
        }).sort({ createdAt: -1 }).lean();

        // 3. Direct Notifications
        const directNotifs = await Notification.find({ user: dbUser._id }).sort({ createdAt: -1 }).lean();

        const formatTimeAgo = (date, isLive = false) => {
            if (!date) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
            const past = new Date(date);
            if (isNaN(past.getTime())) return isLive ? 'এখনই যোগ দিন' : 'সম্প্রতি';
            const diffMins = Math.floor(Math.abs(new Date() - past) / (1000 * 60));
            const toBn = num => num.toString().replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
            const suffix = isLive ? 'শুরু হয়েছে' : 'পাঠানো হয়েছে';
            if (diffMins < 1) return `এখনই ${suffix}`;
            if (diffMins < 60) return `${toBn(diffMins)} মিনিট আগে ${suffix}`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${toBn(diffHours)} ঘণ্টা আগে ${suffix}`;
            return `${toBn(Math.floor(diffHours / 24))} দিন আগে ${suffix}`;
        };

        const allNotices = [];

        announcements.forEach(ann => {
            allNotices.push({
                id: 'ann_' + ann._id,
                rawId: String(ann._id),
                title: ann.title,
                message: ann.content,
                courseTitle: ann.courseId ? ann.courseId.title : 'কোর্স নোটিশ',
                senderName: ann.authorId ? ann.authorId.name : 'কোর্স টিচার',
                senderImage: ann.authorId?.profileImage || '/images/default-avatar.png',
                timeAgo: formatTimeAgo(ann.createdAt, false),
                date: ann.createdAt,
                isHighPriority: ann.priority === 'high',
                category: ann.priority === 'high' ? 'Important' : 'Course Notice',
                isAttended: attended.includes('ann_' + ann._id),
                link: ann.courseId ? `/course-details/${ann.courseId._id}` : '/courses'
            });
        });

        logNotices.forEach(log => {
            allNotices.push({
                id: 'notice_' + log._id,
                rawId: String(log._id),
                title: log.title,
                message: log.body || log.message || '',
                courseTitle: 'সিস্টেম ঘোষণা',
                senderName: 'এডুকেশন অ্যাডমিন',
                senderImage: '/images/default-avatar.png',
                timeAgo: formatTimeAgo(log.createdAt || log.sentAt, false),
                date: log.createdAt || log.sentAt,
                isHighPriority: log.priority === 'high' || log.priority === 'urgent',
                category: log.type === 'exam' ? 'Exam Alert' : 'System Update',
                isAttended: attended.includes('notice_' + log._id),
                link: log.url || log.link || '/dashboard'
            });
        });

        directNotifs.forEach(notif => {
            if (!allNotices.some(n => n.rawId === String(notif._id))) {
                allNotices.push({
                    id: 'notice_' + notif._id,
                    rawId: String(notif._id),
                    title: notif.title,
                    message: notif.message,
                    courseTitle: 'পার্সোনাল নোটিফিকেশন',
                    senderName: 'সিস্টেম',
                    senderImage: '/images/default-avatar.png',
                    timeAgo: formatTimeAgo(notif.createdAt, false),
                    date: notif.createdAt,
                    isHighPriority: notif.type === 'exam',
                    category: notif.type === 'exam' ? 'Exam Alert' : 'Notification',
                    isAttended: attended.includes('notice_' + notif._id),
                    link: notif.link || '/dashboard'
                });
            }
        });

        allNotices.sort((a, b) => {
            if (a.isHighPriority && !b.isHighPriority) return -1;
            if (!a.isHighPriority && b.isHighPriority) return 1;
            return new Date(b.date || 0) - new Date(a.date || 0);
        });

        res.render('notices', {
            notices: allNotices,
            user: dbUser,
            activePage: 'notices',
            highlightId: req.query.id || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading notices page');
    }
});

// --- Academic Q&A Community Routes ---
router.get('/qa-forum', protect, (req, res) => res.redirect('/qa'));

router.get('/qa', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).lean();
        const rawQAs = await QA.find()
            .populate('askedBy', 'name profilePicture profileImage classLevel role')
            .populate('answeredBy', 'name profilePicture profileImage title designation role')
            .populate('replies.user', 'name profilePicture profileImage role')
            .sort({ createdAt: -1 })
            .lean();

        const userClass = (user && user.classLevel) ? user.classLevel.trim() : null;
        const userNormClass = userClass ? userClass.toLowerCase().replace(/class/g, '').trim() : '';

        const isClassMatch = (q) => {
            if (!userNormClass) return true;
            if (!q.askedBy || !q.askedBy.classLevel) return true;
            const qNormClass = q.askedBy.classLevel.toString().toLowerCase().replace(/class/g, '').trim();
            return qNormClass === userNormClass || q.askedBy.classLevel === userClass;
        };

        const classScopedQAs = rawQAs.filter(isClassMatch);

        const statusFilter = req.query.status || 'all';
        const subjectFilter = req.query.subject || 'all';
        const searchQuery = (req.query.search || '').trim().toLowerCase();

        const totalCount = classScopedQAs.length;
        const resolvedCount = classScopedQAs.filter(q => q.status === 'resolved' || q.answer).length;
        const openCount = classScopedQAs.filter(q => q.status !== 'resolved' && !q.answer).length;
        const myCount = classScopedQAs.filter(q => q.askedBy && q.askedBy._id && q.askedBy._id.toString() === req.session.userId.toString()).length;

        let filteredQAs = classScopedQAs.filter(q => {
            if (statusFilter === 'resolved' && (q.status !== 'resolved' && !q.answer)) return false;
            if (statusFilter === 'open' && (q.status === 'resolved' || q.answer)) return false;
            if (statusFilter === 'my' && (!q.askedBy || !q.askedBy._id || q.askedBy._id.toString() !== req.session.userId.toString())) return false;
            if (subjectFilter !== 'all' && q.subject !== subjectFilter) return false;
            if (searchQuery) {
                const text = (q.question || '') + ' ' + (q.answer || '') + ' ' + (q.askedBy?.name || '');
                if (!text.toLowerCase().includes(searchQuery)) return false;
            }
            return true;
        });

        const AcademicClass = require('../models/AcademicClass');
        const allClasses = await AcademicClass.find().lean().catch(() => []);
        const matchedClass = allClasses.find(c => (c.name || '').trim().toLowerCase() === (userClass || '').toLowerCase()) || allClasses.find(c => (userClass || '').toLowerCase().includes((c.name || '').toLowerCase()));
        
        let assignedSubjects = (matchedClass && Array.isArray(matchedClass.subjects) && matchedClass.subjects.length > 0)
            ? matchedClass.subjects.map(s => s ? s.trim() : '').filter(Boolean)
            : ['Bangla', 'English', 'Math', 'Physics', 'Chemistry', 'Biology', 'ICT'];

        const availableSubjects = Array.from(new Set(assignedSubjects)).sort();

        res.render('qa', {
            user,
            qas: filteredQAs,
            userClass: userClass || 'All Classes',
            stats: { totalCount, resolvedCount, openCount, myCount },
            availableSubjects,
            filters: { status: statusFilter, subject: subjectFilter, search: req.query.search || '' },
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error('QA page error:', err);
        res.render('qa', { user: req.session.user || null, qas: [], stats: { totalCount: 0, resolvedCount: 0, openCount: 0, myCount: 0 }, availableSubjects: [], filters: { status: 'all', subject: 'all', search: '' } });
    }
});

// --- Multer setup for Q&A image attachments ---
const qaImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const primaryDest = path.join(process.cwd(), 'client/public/uploads/qa');
        const secondaryDest = path.join(process.cwd(), 'public/uploads/qa');
        try { fs.mkdirSync(primaryDest, { recursive: true }); } catch (e) { }
        try { fs.mkdirSync(secondaryDest, { recursive: true }); } catch (e) { }
        cb(null, primaryDest);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'qa-' + Date.now() + '-' + Math.round(Math.random() * 1e4) + ext);
    }
});

const uploadQAMulter = multer({
    storage: qaImageStorage,
    limits: { fileSize: 25 * 1024 * 1024 }
});

router.post('/qa-ask', protect, (req, res, next) => {
    uploadQAMulter.single('image')(req, res, (err) => {
        if (err) console.error('QA Image upload error:', err);
        next();
    });
}, async (req, res) => {
    try {
        const { question, subject, courseId, redirectUrl } = req.body;
        if (!question || question.trim() === '') {
            if (redirectUrl) return res.redirect(redirectUrl);
            return res.redirect('/qa?error=empty_question');
        }

        let imageUrl = null;
        if (req.file) {
            imageUrl = '/uploads/qa/' + req.file.filename;
        }

        await new QA({
            question: question.trim(),
            subject: subject || 'General Academic',
            image: imageUrl,
            askedBy: req.session.userId,
            askedByName: req.session.user ? req.session.user.name : 'Student',
            course: courseId || null,
            status: 'open'
        }).save();

        if (redirectUrl) return res.redirect(redirectUrl);
        res.redirect('/qa?success=asked');
    } catch (err) {
        console.error('QA ask error:', err);
        res.redirect(req.body.redirectUrl || '/qa?error=ask_failed');
    }
});

router.post('/qa/upvote/:id', protect, async (req, res) => {
    try {
        const qa = await QA.findById(req.params.id);
        if (!qa) return res.status(404).json({ success: false, error: 'Question not found' });

        if (!qa.upvotes) qa.upvotes = [];
        const userIdStr = req.session.userId.toString();
        const index = qa.upvotes.findIndex(id => id.toString() === userIdStr);

        let upvoted = false;
        if (index > -1) {
            qa.upvotes.splice(index, 1);
        } else {
            qa.upvotes.push(req.session.userId);
            upvoted = true;
        }

        await qa.save();
        res.json({ success: true, count: qa.upvotes.length, upvoted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/qa/reply/:id', protect, (req, res, next) => {
    uploadQAMulter.single('image')(req, res, (err) => {
        if (err) console.error('QA Reply Image upload error:', err);
        next();
    });
}, async (req, res) => {
    try {
        const { replyText } = req.body;
        if ((!replyText || replyText.trim() === '') && !req.file) {
            return res.redirect(`/qa?error=empty_reply#qa-${req.params.id}`);
        }

        const qa = await QA.findById(req.params.id);
        if (!qa) return res.redirect('/qa?error=not_found');

        let imageUrl = null;
        if (req.file) {
            imageUrl = '/uploads/qa/' + req.file.filename;
        }

        if (!qa.replies) qa.replies = [];
        qa.replies.push({
            user: req.session.userId,
            userName: req.session.user ? req.session.user.name : 'Student',
            userRole: req.session.user ? req.session.user.role : 'student',
            userAvatar: req.session.user ? (req.session.user.profileImage || req.session.user.profilePicture) : null,
            text: (replyText || '').trim(),
            image: imageUrl,
            createdAt: new Date()
        });

        await qa.save();
        res.redirect(`/qa?success=replied#qa-${req.params.id}`);
    } catch (err) {
        console.error('QA Reply Error:', err);
        res.redirect(`/qa?error=reply_failed#qa-${req.params.id}`);
    }
});

router.get('/library', protect, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.session.userId).lean();
        const userClass = (user && user.classLevel) ? user.classLevel.trim() : 'Class 10';

        const AcademicClass = require('../models/AcademicClass');
        const allClasses = await AcademicClass.find().sort({ order: 1 }).lean();

        const isClassMatch = (targetClass, studentClass) => {
            if (!targetClass || !studentClass) return true;
            const targetArr = Array.isArray(targetClass) ? targetClass : [targetClass];
            const studentClean = String(studentClass).toLowerCase().replace(/class\s*/i, '').trim();
            const studentNum = studentClean.match(/\d+/)?.[0];

            return targetArr.some(tc => {
                if (!tc) return false;
                const tcClean = String(tc).toLowerCase().replace(/class\s*/i, '').trim();
                const tcNum = tcClean.match(/\d+/)?.[0];

                if (tcClean === studentClean) return true;
                if (studentNum && tcNum && studentNum === tcNum) return true;
                if (studentNum && tcClean.includes(studentNum)) return true;
                if (tcClean.includes(studentClean) || studentClean.includes(tcClean)) return true;
                return false;
            });
        };

        let matchedClass = allClasses.find(c => (c.name || '').trim().toLowerCase() === userClass.toLowerCase());
        if (!matchedClass) {
            matchedClass = allClasses.find(c => isClassMatch(c.name, userClass));
        }

        let assignedSubjects = (matchedClass && Array.isArray(matchedClass.subjects) && matchedClass.subjects.length > 0)
            ? matchedClass.subjects.map(s => s ? s.trim() : '').filter(Boolean)
            : [];

        if (assignedSubjects.length === 0) {
            const subSet = new Set();
            allClasses.forEach(c => (c.subjects || []).forEach(s => s && subSet.add(s.trim())));
            assignedSubjects = Array.from(subSet);
        }

        const subjects = Array.from(new Set(assignedSubjects)).sort();

        let books = await Book.find({ classLevel: userClass }).sort({ createdAt: -1 }).lean();
        if (!books || books.length === 0) {
            books = await Book.find().sort({ createdAt: -1 }).lean();
        }

        const rawBookmarks = user ? (user.savedBookmarks || []) : [];
        const bookUrls = new Set((books || []).map(b => b.fileUrl).filter(Boolean));
        const bookTitles = new Set((books || []).map(b => b.title ? b.title.trim().toLowerCase() : '').filter(Boolean));
        
        const savedBookmarks = rawBookmarks.filter(b => 
            b.itemType === 'book' || 
            (b.link && bookUrls.has(b.link)) || 
            (b.title && bookTitles.has(b.title.trim().toLowerCase()))
        );

        res.render('library', {
            pageTitle: 'Library',
            books,
            savedBookmarks,
            subjects,
            userClass,
            user: req.session.user || user
        });
    } catch (err) {
        console.error('Error in /library:', err);
        res.status(500).send('Library Loading Error');
    }
});

router.get('/mock-tests', protect, async (req, res) => {
    try {
        await connectDB();
        const quizzes = await Quiz.find().populate('course').lean();
        res.render('mock-tests', { user: req.session.user, quizzes });
    } catch (err) { res.render('mock-tests', { user: req.session.user, quizzes: [] }); }
});

// ---- Course Details & Checkout ----
router.get('/course-details/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findById(req.params.id)
            .populate('instructor', 'name profileImage bio')
            .populate('chapters.quizzes');
        if (!course) return res.status(404).render('404');

        const user = await User.findById(req.session.userId);
        let hasAccess = false, trialExpired = false, subscriptionExpired = false;

        if (course.accessType === 'free') hasAccess = true;
        else if (course.instructor?.toString() === user._id.toString() || user.role === 'admin' || user.role === 'superadmin') {
            hasAccess = true;
        } else {
            const enrollment = user.enrolledCourses.find(e => e.course?.toString() === course._id.toString());
            if (enrollment) {
                if (!enrollment.expiresAt || new Date(enrollment.expiresAt) > new Date()) hasAccess = true;
                else subscriptionExpired = true;
            }
            if (!hasAccess && course.accessType === 'trial') {
                const trial = user.trialEnrollments.find(t => t.course?.toString() === course._id.toString());
                if (trial) {
                    const diffDays = Math.ceil(Math.abs(new Date() - trial.startedAt) / (1000 * 60 * 60 * 24));
                    if (diffDays <= (course.trialPeriod || 7)) hasAccess = true;
                    else trialExpired = true;
                }
            }
        }

        // If has access, show player; otherwise show details page
        if (hasAccess) {
            // Fetch QAs for this course
            const qas = await QA.find({ course: course._id }).populate('askedBy answeredBy', 'name profileImage').sort({ createdAt: -1 });
            res.render('lesson-player', { course: course.toObject(), similarCourses: [], hasAccess, trialExpired, subscriptionExpired, user, qas });
        } else {
            res.render('course-details', { course: course.toObject(), user, success: req.query.success });
        }
    } catch (err) { res.status(500).send('Error loading course'); }
});

router.post('/api/attend-notice', protect, async (req, res) => {
    try {
        const { noticeId } = req.body;
        if (!noticeId) return res.json({ success: false });
        const user = await User.findById(req.session.userId);
        if (user && !user.attendedNotices.includes(noticeId)) {
            user.attendedNotices.push(noticeId);
            await user.save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/checkout/:id', protect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findById(req.params.id).lean();
        if (!course) return res.status(404).send('Course not found');
        const user = await User.findById(req.session.userId).lean();
        const siteSettings = await Setting.findOne({ key: 'site_settings' }).lean();
        res.render('checkout', { course, user, siteSettings: siteSettings?.value || {}, error: null });
    } catch (err) {
        console.error('Course checkout error stack:', err);
        res.status(500).send('There was an error loading checkout: ' + (err.stack || err.message || err));
    }
});

router.post('/enroll-trial/:id', protect, async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user.trialEnrollments.find(t => t.course.toString() === req.params.id)) {
            user.trialEnrollments.push({ course: req.params.id, startedAt: new Date() });
            user.save();
        }
        res.redirect(`/course-details/${req.params.id}`);
    } catch (err) { res.status(500).send('Error'); }
});



// ---- Quiz / Mock Test Solve Route ----
router.get(['/quiz/:id', '/quizzes/:id'], protect, async (req, res) => {
    try {
        await connectDB();
        const Quiz = require('../models/Quiz');
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');

        if (req.session.user && ['admin', 'superadmin'].includes(req.session.user.role)) {
            return res.redirect(`/superadmin/quiz-details/${req.params.id}`);
        }

        const quiz = await Quiz.findById(req.params.id).lean();
        if (!quiz) return res.status(404).send('Quiz / Mock Test not found');

        // Find or auto-generate a QuestionBank for this quiz so it uses the unified Exam Solve Studio
        const qSubject = (quiz.subject || 'General').trim();
        const qClassLevel = (quiz.classLevel || (req.session.user && req.session.user.classLevel) || 'Class 10').trim();
        const addedById = quiz.addedBy || req.session.userId;

        const rawTitle = (quiz.title || 'Practice Quiz').trim();
        const cleanTitle = rawTitle.replace(/^(mock test|model test)\s*-\s*/i, '');
        const mockTitle = `Mock Test - ${cleanTitle}`;

        let bank = await QuestionBank.findById(quiz._id);
        if (!bank) {
            bank = await QuestionBank.findOne({ title: mockTitle, subject: qSubject });
        }

        if (bank) {
            if (bank.title !== mockTitle) {
                bank.title = mockTitle;
                await bank.save();
            }
            bank = bank.toObject();
        } else {
            const newBank = new QuestionBank({
                _id: quiz._id,
                title: mockTitle,
                subject: qSubject,
                classLevel: [qClassLevel],
                duration: quiz.duration || 15,
                status: 'approved',
                addedBy: addedById
            });
            await newBank.save();
            bank = newBank.toObject();

            if (Array.isArray(quiz.questions) && quiz.questions.length > 0) {
                const questionDocs = quiz.questions.map((q, idx) => ({
                    bankId: newBank._id,
                    subject: qSubject,
                    classLevel: qClassLevel,
                    questionText: q.questionText || `Question ${idx + 1}`,
                    questionType: q.questionType || 'MCQ',
                    options: Array.isArray(q.options) ? q.options : [],
                    correctAnswerIndex: typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0,
                    correctAnswer: q.correctAnswer || '',
                    explanation: q.explanation || '',
                    marks: q.marks || (q.questionType === 'Medium' ? 2 : (q.questionType === 'Comprehension' ? 10 : 1)),
                    addedBy: addedById
                }));
                await Question.insertMany(questionDocs);
            }
        }

        return res.redirect(`/question-bank/solve/${bank._id}`);
    } catch (err) {
        console.error('Error launching quiz exam:', err);
        res.status(500).send('Server Error launching exam session');
    }
});

router.post('/submit-quiz/:id', protect, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).send('Quiz not found');

        let score = 0;
        quiz.questions.forEach((q, index) => {
            if (parseInt(req.body[`question_${index}`]) === q.correctAnswerIndex) score++;
        });

        const student = await User.findById(req.session.userId);
        if (!student) return res.status(404).send('User not found');

        // --- Daily Goals: Track quiz completion ---
        const todayStr = new Date().toISOString().split('T')[0];
        if (!student.dailyGoals || student.dailyGoals.date !== todayStr) {
            student.dailyGoals = { date: todayStr, videosCount: 0, quizzesCount: 0, notesCount: 0, todayXpEarned: 0, todayWatchedLessons: [] };
        }
        student.dailyGoals.quizzesCount = (student.dailyGoals.quizzesCount || 0) + 1;
        student.dailyGoals.todayXpEarned = (student.dailyGoals.todayXpEarned || 0) + 50;

        // Award XP: 50 base + (correct answers * 10)
        const xpEarned = 50 + (score * 10);
        student.totalXP = (student.totalXP || 0) + xpEarned;

        student.quizResults.push({ quiz: quiz._id, score, total: quiz.questions.length, date: new Date() });

        if (!student.completedLessons.includes(quiz._id.toString())) {
            student.completedLessons.push(quiz._id.toString());
        }

        student.markModified('dailyGoals');
        await student.save();

        // Behavioral Trigger: Low Score Warning
        const percentage = (score / quiz.questions.length) * 100;
        if (percentage < 50) {
            await new Notification({
                user: student._id,
                title: 'পড়ালেখায় মনোযোগ দিন!',
                message: `আপনি "${quiz.title}" কুইজে মাত্র ${percentage.toFixed(0)}% নাম্বার পেয়েছেন। বিষয়গুলো আরও ভালো করে পড়া প্রয়োজন।`,
                type: 'exam',
                link: `/quiz/${quiz._id}`
            }).save();
        }

        res.render('quiz-result', { score, total: quiz.questions.length });
    } catch (err) {
        console.error('Quiz Submission Error:', err);
        res.status(500).send('Error');
    }
});

router.get('/create-self-quiz', protect, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.session.userId).lean();
        const userClass = (user && user.classLevel) ? user.classLevel.trim() : 'Class 10';

        const AcademicClass = require('../models/AcademicClass');
        const allClasses = await AcademicClass.find().lean().catch(() => []);
        const matchedClass = allClasses.find(c => (c.name || '').trim().toLowerCase() === userClass.toLowerCase()) || allClasses.find(c => userClass.toLowerCase().includes((c.name || '').toLowerCase()));

        let assignedSubjects = (matchedClass && Array.isArray(matchedClass.subjects) && matchedClass.subjects.length > 0)
            ? matchedClass.subjects.map(s => s ? s.trim() : '').filter(Boolean)
            : await Question.distinct('subject');

        const subjects = Array.from(new Set(assignedSubjects)).sort();
        const classes = (allClasses || []).map(c => c.name).filter(Boolean);

        res.render('create-self-quiz', { subjects, classes: classes.length > 0 ? classes : ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'] });
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/api/generate-quiz', protect, async (req, res) => {
    try {
        const { subject, classLevel, count } = req.body;
        const questions = await Question.aggregate([{ $match: { subject, classLevel } }, { $sample: { size: parseInt(count) || 10 } }]);
        if (!questions.length) return res.status(404).json({ message: 'No questions' });
        req.session.tempQuiz = { title: `Custom ${subject} Quiz`, questions: questions.map(q => ({ questionText: q.questionText, options: q.options, correctAnswerIndex: q.correctAnswerIndex })), duration: 10 };
        res.json({ success: true, redirect: '/take-temp-quiz' });
    } catch (err) { res.status(500).json({ message: 'Error' }); }
});

router.get('/take-temp-quiz', protect, (req, res) => {
    if (!req.session.tempQuiz) return res.redirect('/dashboard');
    res.render('quiz', { quiz: req.session.tempQuiz });
});

// ---- Parent ----
router.get('/parent/dashboard', parentProtect, async (req, res) => {
    try {
        await connectDB();
        const parent = await User.findById(req.session.userId);
        if (!parent) return res.redirect('/login');
        const students = await User.find({ 'parentRequests': { $elemMatch: { parent: parent._id, status: 'accepted' } } })
            .populate({ path: 'quizResults.quiz', populate: { path: 'course' } })
            .populate('enrolledCourses.course').populate('lastWatchedLesson.course');
        const childIds = students.map(s => s._id);
        const childMessages = await QA.find({ askedBy: { $in: childIds } }).populate('answeredBy', 'name').sort({ createdAt: -1 });
        res.render('parent-dashboard', { user: parent, confirmedChildren: students || [], messages: childMessages || [], events: [] });
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/parent/add-child', parentProtect, async (req, res) => {
    try {
        const identifier = req.body.childIdentifier.trim();
        const student = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }], role: 'student' });
        if (!student) return res.send('এই ইমেইল বা ফোন নম্বর দিয়ে কোনো শিক্ষার্থী পাওয়া যায়নি।');
        if (student.parentRequests.some(r => r.parent.toString() === req.session.userId)) return res.send('ইতিমধ্যে একটি অনুরোধ পাঠানো হয়েছে।');
        student.parentRequests.push({ parent: req.session.userId, status: 'pending' });
        await student.save();
        res.redirect('/parent/dashboard?success=requested');
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/student/approve-parent/:parentId', protect, async (req, res) => {
    try {
        const student = await User.findById(req.session.userId);
        if (!student) return res.redirect('/login');
        const request = student.parentRequests.find(r => r.parent.toString() === req.params.parentId);
        if (request) { request.status = 'accepted'; await student.save(); }
        res.redirect('/dashboard?success=parent_approved');
    } catch (err) { res.status(500).send('Error'); }
});



// ---- Save Bookmark API ----
router.post('/api/save-bookmark', protect, async (req, res) => {
    try {
        await connectDB();
        const { title, link, itemType } = req.body;
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// ---- Remove Bookmark API ----
router.post('/api/remove-bookmark', protect, async (req, res) => {
    try {
        await connectDB();
        const { bookmarkId, link } = req.body;
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

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
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.post('/student/reject-parent/:parentId', protect, async (req, res) => {
    try {
        const student = await User.findById(req.session.userId);
        if (!student) return res.redirect('/login');
        student.parentRequests = student.parentRequests.filter(r => r.parent.toString() !== req.params.parentId);
        await student.save();
        res.redirect('/dashboard?success=parent_rejected');
    } catch (err) { res.status(500).send('Error'); }
});

// ---- Feature pages ----
router.get('/feature/:type', protect, async (req, res) => {
    try {
        const subjects = await Course.distinct('subject', { classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-subjects', { type: req.params.type, subjects });
    } catch (err) { res.status(500).send('Error'); }
});

router.get('/feature/:type/:subject', protect, async (req, res) => {
    try {
        const courses = await Course.find({ subject: req.params.subject, classLevel: req.session.user.classLevel || 'Class 10' });
        res.render('feature-chapters', { type: req.params.type, subject: req.params.subject, courses });
    } catch (err) { res.status(500).send('Error'); }
});

// ---- Search API ----
router.get('/api/search', async (req, res) => {
    try {
        await connectDB();
        const rawQuery = (req.query.q || '').trim();
        if (!rawQuery) return res.json({ courses: [], notes: [], videos: [], questionBanks: [], quizzes: [], qa: [] });

        let userClassLevel = null;
        if (req.session && req.session.userId) {
            const currentUser = await User.findById(req.session.userId).select('classLevel role').lean();
            if (currentUser && currentUser.role === 'student' && currentUser.classLevel) {
                userClassLevel = currentUser.classLevel;
            }
        } else if (req.session && req.session.user && req.session.user.role === 'student' && req.session.user.classLevel) {
            userClassLevel = req.session.user.classLevel;
        }

        const words = rawQuery.split(/\s+/).filter(w => w.length > 0);
        const safeQuery = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fullRegex = new RegExp(safeQuery, 'i');
        const wordRegexes = words.map(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

        const buildCondition = (fields) => {
            const orConditions = [];
            fields.forEach(f => orConditions.push({ [f]: fullRegex }));
            wordRegexes.forEach(wRegex => {
                fields.forEach(f => orConditions.push({ [f]: wRegex }));
            });

            const matchQuery = { $or: orConditions };

            if (userClassLevel) {
                const classRegex = new RegExp(userClassLevel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                return {
                    $and: [
                        matchQuery,
                        {
                            $or: [
                                { classLevel: classRegex },
                                { classLevel: { $exists: false } },
                                { classLevel: null },
                                { classLevel: '' },
                                { classLevel: 'All' },
                                { classLevel: 'General' }
                            ]
                        }
                    ]
                };
            }
            return matchQuery;
        };

        const [courses, notes, videos, questionBanks, quizzes, qaList] = await Promise.all([
            Course.find(buildCondition(['title', 'subject', 'classLevel', 'description', 'category'])).limit(50).select('title thumbnail subject classLevel').lean(),
            Note.find(buildCondition(['title', 'subject', 'classLevel', 'description'])).limit(50).select('title subject classLevel description fileUrl').lean(),
            VideoAsset ? VideoAsset.find(buildCondition(['title', 'subject', 'classLevel', 'category'])).limit(50).select('title subject classLevel videoUrl category').lean() : Promise.resolve([]),
            QuestionBank.find(buildCondition(['subject', 'board', 'year', 'classLevel'])).limit(50).select('subject board year classLevel fileUrl').lean(),
            Quiz.find(buildCondition(['title', 'subject', 'classLevel'])).limit(50).select('title subject classLevel').lean(),
            QA ? QA.find(buildCondition(['question', 'askedByName'])).limit(50).select('question askedByName status').lean() : Promise.resolve([])
        ]);

        res.json({ courses, notes, videos: videos || [], questionBanks, quizzes, qa: qaList || [] });
    } catch (err) {
        console.error('Search API error:', err);
        res.json({ courses: [], notes: [], videos: [], questionBanks: [], quizzes: [], qa: [] });
    }
});

// GET /messages — Dedicated Direct Student-to-Teacher Messaging Portal
router.get('/messages', protect, async (req, res) => {
    try {
        await connectDB();
        const Payment = require('../models/Payment');
        const user = await User.findById(req.session.userId).populate('enrolledCourses.course').lean();

        if (!user) return res.redirect('/login');

        // Check if user is eligible (has paid course or paid package)
        const hasPaidCourse = (user.enrolledCourses || []).some(ec => {
            const c = ec.course;
            return c && (c.accessType === 'paid' || c.price > 0 || c.discountPrice > 0 || (c.plans && c.plans.length > 0 && c.plans[0].price > 0));
        });

        const hasPaidPayment = await Payment.exists({
            user: user._id,
            status: { $in: ['success', 'approved'] },
            itemType: { $in: ['course', 'package'] }
        });

        const isEligible = Boolean(hasPaidCourse || hasPaidPayment);

        // Fetch teachers
        let teachers = [];
        let activeTeacher = null;
        let recentConversations = [];

        if (isEligible) {
            teachers = await User.find({ role: 'teacher', status: 'active' })
                .select('name teachingSubject designation profilePicture profileImage email lastActive classLevel')
                .lean();

            // Find all direct messages between this student and teachers
            const allMessages = await Message.find({
                $or: [
                    { sender: user._id },
                    { receiver: user._id }
                ]
            }).sort({ createdAt: -1 }).lean();

            // Build map of latest message and unread count per teacher
            const teacherMap = {};
            teachers.forEach(t => {
                teacherMap[t._id.toString()] = {
                    teacher: t,
                    latestMessage: null,
                    unreadCount: 0
                };
            });

            allMessages.forEach(msg => {
                const otherId = msg.sender.toString() === user._id.toString() 
                    ? (msg.receiver ? msg.receiver.toString() : null)
                    : msg.sender.toString();

                if (otherId && teacherMap[otherId]) {
                    if (!teacherMap[otherId].latestMessage) {
                        teacherMap[otherId].latestMessage = msg;
                    }
                    if (msg.receiver && msg.receiver.toString() === user._id.toString() && !msg.isRead) {
                        teacherMap[otherId].unreadCount++;
                    }
                }
            });

            recentConversations = Object.values(teacherMap);
            // Default active teacher to requested query teacher or first in list
            const requestedTeacherId = req.query.teacherId;
            if (requestedTeacherId) {
                activeTeacher = teachers.find(t => t._id.toString() === requestedTeacherId) || teachers[0] || null;
            } else {
                activeTeacher = teachers[0] || null;
            }
        }

        res.render('messages', {
            user,
            pageTitle: 'Messages',
            isEligible,
            teachers,
            activeTeacher,
            recentConversations
        });
    } catch (err) {
        console.error('Messages route error:', err);
        res.render('messages', {
            user: req.session.user,
            pageTitle: 'Messages',
            isEligible: false,
            teachers: [],
            activeTeacher: null,
            recentConversations: []
        });
    }
});

router.get('/notifications', protect, (req, res) => res.render('notifications', { user: req.session.user }));
router.get('/settings', protect, (req, res) => res.render('profile', { user: req.session.user, success: null }));

// GET /exams/mock-tests — Dedicated All Mock Tests Page for Student's Class & Subjects
router.get('/exams/mock-tests', protect, async (req, res) => {
    try {
        await connectDB();
        const Quiz = require('../models/Quiz');
        const AcademicClass = require('../models/AcademicClass');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const user = await User.findById(req.session.userId).lean();
        const userClassLevel = (user && user.classLevel) ? user.classLevel : 'Class 10';

        // 1. Fetch class config to get superadmin assigned subjects
        const classConfig = await AcademicClass.findOne({ name: userClassLevel }).lean();
        const assignedSubjects = (classConfig && classConfig.subjects && classConfig.subjects.length > 0)
            ? classConfig.subjects
            : await Question.distinct('subject');

        // 2. Fetch all Quizzes / Mock Tests
        const allMockTests = await Quiz.find()
            .populate('course')
            .sort({ createdAt: -1 })
            .lean();

        res.render('mock-tests', {
            pageTitle: 'Mock Test',
            user: user || req.session.user,
            userClassLevel,
            assignedSubjects: assignedSubjects || [],
            mockTests: allMockTests || []
        });
    } catch (err) {
        console.error('Error loading mock tests page:', err);
        res.redirect('/exams');
    }
});

// GET /exams/model-tests — Dedicated All Model Tests Page for Student's Class & Subjects
router.get('/exams/model-tests', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const AcademicClass = require('../models/AcademicClass');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const user = await User.findById(req.session.userId).lean();
        const userClassLevel = (user && user.classLevel) ? user.classLevel : 'Class 10';

        // 1. Fetch class config to get superadmin assigned subjects
        const classConfig = await AcademicClass.findOne({ name: userClassLevel }).lean();
        const assignedSubjects = (classConfig && classConfig.subjects && classConfig.subjects.length > 0)
            ? classConfig.subjects
            : await Question.distinct('subject');

        // 2. Fetch all approved official Model Tests (QuestionBanks)
        const allModelTests = await QuestionBank.find({
            status: 'approved',
            isCustom: { $ne: true },
            title: { $not: /Personalized Exam|Custom Exam/i }
        })
            .sort({ createdAt: -1 })
            .lean();

        res.render('model-tests', {
            pageTitle: 'Model Test',
            user: user || req.session.user,
            userClassLevel,
            assignedSubjects: assignedSubjects || [],
            modelTests: allModelTests || []
        });
    } catch (err) {
        console.error('Error loading model tests page:', err);
        res.redirect('/exams');
    }
});

// GET /exams/history — Lifetime Exam History Page
router.get('/exams/history', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const User = require('../models/User');

        const user = await User.findById(req.session.userId).lean();
        const attempts = await QuestionBankAttempt.find({ user: req.session.userId })
            .populate('bank')
            .sort({ submittedAt: -1, _id: -1 })
            .lean();

        res.render('exam-history', {
            pageTitle: 'Exam History',
            user: user || req.session.user,
            attempts: attempts || []
        });
    } catch (err) {
        console.error('Error loading exam history page:', err);
        res.redirect('/exams');
    }
});

// GET /exams/subject-tests — Dedicated Subject Exams Page
router.get('/exams/subject-tests', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Quiz = require('../models/Quiz');
        const AcademicClass = require('../models/AcademicClass');
        const Question = require('../models/Question');
        const User = require('../models/User');

        const user = await User.findById(req.session.userId).lean();
        const userClassLevel = (user && user.classLevel) ? user.classLevel : 'Class 10';
        const selectedSubject = (req.query.subject || '').trim();

        // 1. Fetch class config to get superadmin assigned subjects
        const classConfig = await AcademicClass.findOne({ name: userClassLevel }).lean();
        const qSubjects = await Question.distinct('subject');
        const qbSubjects = await QuestionBank.distinct('subject');
        const rawAllSubjects = Array.from(new Set([...(qSubjects || []), ...(qbSubjects || [])])).filter(Boolean);

        const assignedSubjects = (classConfig && classConfig.subjects && classConfig.subjects.length > 0)
            ? classConfig.subjects
            : rawAllSubjects;

        // 2. Fetch distinct topics for the selected subject
        let subjectTopics = [];
        if (selectedSubject && selectedSubject !== 'all') {
            const subRegex = new RegExp(`^${selectedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            const qTopics = await Question.distinct('topic', { subject: subRegex, topic: { $ne: '' } });
            const qbTopics = await QuestionBank.distinct('topic', { subject: subRegex, topic: { $ne: '' } });
            subjectTopics = Array.from(new Set([...(qTopics || []), ...(qbTopics || [])])).filter(Boolean);
        } else {
            subjectTopics = await Question.distinct('topic', { topic: { $ne: '' } });
        }

        // 3. Fetch all approved official QuestionBanks & Quizzes
        const [questionBanks, quizzes] = await Promise.all([
            QuestionBank.find({
                status: 'approved',
                isCustom: { $ne: true },
                title: { $not: /Personalized Exam|Custom Exam/i }
            }).sort({ createdAt: -1 }).lean(),
            Quiz.find().populate('course').sort({ createdAt: -1 }).lean()
        ]);

        const examList = [];

        questionBanks.forEach(qb => {
            examList.push({
                _id: qb._id,
                title: qb.title || `${qb.subject || 'Practice'} Exam`,
                subject: (qb.subject || 'General').trim(),
                topic: (qb.topic || '').trim(),
                duration: qb.duration || 30,
                solveUrl: `/question-bank/solve/${qb._id}`,
                subtitle: [qb.topic, qb.board, qb.year].filter(Boolean).join(' • ') || 'Practice Exam'
            });
        });

        quizzes.forEach(qz => {
            examList.push({
                _id: qz._id,
                title: qz.title || `${qz.subject || 'Mock'} Test`,
                subject: (qz.subject || 'General').trim(),
                topic: (qz.topic || '').trim(),
                duration: qz.duration || 15,
                solveUrl: `/quiz/${qz._id}`,
                subtitle: [qz.topic, qz.course ? qz.course.title : 'Mock Test'].filter(Boolean).join(' • ') || 'Mock Test'
            });
        });

        const pageTitleText = (selectedSubject && selectedSubject !== 'all') 
            ? `Subject Tests / ${selectedSubject}` 
            : 'Subject Tests';

        res.render('subject-tests', {
            pageTitle: pageTitleText,
            user: user || req.session.user,
            userClassLevel,
            selectedSubject: selectedSubject || 'all',
            assignedSubjects: assignedSubjects || [],
            subjectTopics: subjectTopics || [],
            examList: examList || []
        });
    } catch (err) {
        console.error('Error loading subject tests page:', err);
        res.redirect('/exams');
    }
});

router.get('/exams', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const Quiz = require('../models/Quiz');
        const User = require('../models/User');
        const AcademicClass = require('../models/AcademicClass');

        const user = await User.findById(req.session.userId).lean();
        const userClassLevel = (user && user.classLevel) ? user.classLevel : 'Class 10';

        // 1. Fetch official Model Tests, Mock Tests, and Question Banks
        const modelTestsList = await QuestionBank.find({
            status: 'approved',
            isCustom: { $ne: true },
            title: { $not: /Personalized Exam|Custom Exam/i }
        })
            .sort({ createdAt: -1 })
            .lean();

        const mockTestsList = await Quiz.find()
            .populate('course')
            .sort({ createdAt: -1 })
            .lean();

        const questionBanksList = await QuestionBank.find({
            status: 'approved',
            isCustom: { $ne: true },
            title: { $not: /Personalized Exam|Custom Exam/i }
        })
            .sort({ views: -1, createdAt: -1 })
            .lean();

        // 2. Fetch distinct subjects & class assigned subjects
        const qSubjects = await Question.distinct('subject');
        const qbSubjects = await QuestionBank.distinct('subject');
        const rawAllSubjects = Array.from(new Set([...(qSubjects || []), ...(qbSubjects || [])])).filter(Boolean);

        const classConfig = await AcademicClass.findOne({ name: userClassLevel }).lean();
        const assignedSubjects = (classConfig && classConfig.subjects && classConfig.subjects.length > 0)
            ? classConfig.subjects
            : rawAllSubjects;

        // 3. Fetch Subject & Topic Breakdown with Question Counts
        const subjectBreakdown = await Question.aggregate([
            {
                $group: {
                    _id: '$subject',
                    totalQuestions: { $sum: 1 },
                    mcqCount: { $sum: { $cond: [{ $eq: ['$questionType', 'MCQ'] }, 1, 0] } },
                    writtenCount: { $sum: { $cond: [{ $ne: ['$questionType', 'MCQ'] }, 1, 0] } },
                    topics: { $addToSet: '$topic' }
                }
            }
        ]);

        const subjectTopicMap = {};
        subjectBreakdown.forEach(sb => {
            if (sb._id) {
                subjectTopicMap[sb._id] = {
                    totalQuestions: sb.totalQuestions,
                    mcqCount: sb.mcqCount,
                    writtenCount: sb.writtenCount,
                    topics: (sb.topics || []).filter(Boolean)
                };
            }
        });

        // 4. Fetch raw topics for dynamic client-side dropdown filtering
        const rawTopics = await Question.aggregate([
            { $match: { topic: { $ne: '' } } },
            { $group: { _id: { subject: '$subject', topic: '$topic' }, count: { $sum: 1 } } }
        ]);

        // 5. Fetch Global Stats for header metrics bar
        const typeAggregation = await Question.aggregate([
            { $group: { _id: '$questionType', count: { $sum: 1 } } }
        ]);

        const globalTypeCounts = { MCQ: 0, Short: 0, Medium: 0, Comprehension: 0 };
        let grandTotalQuestions = 0;
        typeAggregation.forEach(item => {
            if (item._id && globalTypeCounts.hasOwnProperty(item._id)) {
                globalTypeCounts[item._id] = item.count;
            }
            grandTotalQuestions += item.count;
        });

        const totalQuestionBanksCount = questionBanksList.length;
        const totalMockTestsCount = await Quiz.countDocuments({ isMockTest: true });

        const globalStats = {
            totalQuestions: grandTotalQuestions,
            totalBanks: totalQuestionBanksCount,
            totalModelTests: modelTestsList.length,
            totalMockTests: totalMockTestsCount || 0,
            mcq: globalTypeCounts.MCQ,
            short: globalTypeCounts.Short,
            medium: globalTypeCounts.Medium,
            comprehension: globalTypeCounts.Comprehension
        };

        // 6. Fetch Student's Lifetime Solved & Gained Metrics
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const userAttempts = await QuestionBankAttempt.find({ user: req.session.userId }).lean();

        let studentStats = {
            mcqSolved: 0,
            writtenSolved: 0,
            marksGained: 0,
            negativeMarks: 0,
            rightTicked: 0,
            wrongTicked: 0
        };

        (userAttempts || []).forEach(att => {
            studentStats.rightTicked += (att.mcqCorrectCount || 0);
            studentStats.wrongTicked += (att.wrongMcqCount || 0);
            studentStats.negativeMarks += (att.negativeMarksDeducted || 0);
            studentStats.marksGained += (att.mcqScore || 0);

            const userAnswers = att.userAnswers || [];
            userAnswers.forEach(ua => {
                const qType = ua.questionType || 'MCQ';
                if (qType === 'MCQ') {
                    if (ua.selectedOptionIndex !== undefined && ua.selectedOptionIndex !== null && ua.selectedOptionIndex >= 0) {
                        studentStats.mcqSolved++;
                    }
                } else {
                    if (ua.writtenAnswer && String(ua.writtenAnswer).trim() !== '') {
                        studentStats.writtenSolved++;
                    }
                    if (ua.marksObtained !== undefined && ua.marksObtained !== null && typeof ua.marksObtained === 'number') {
                        studentStats.marksGained += ua.marksObtained;
                    }
                }
            });
        });

        studentStats.negativeMarks = Math.round(studentStats.negativeMarks * 100) / 100;
        studentStats.marksGained = Math.round(studentStats.marksGained * 100) / 100;

        res.render('exams', {
            user: user || req.session.user,
            mockTests: mockTestsList || [],
            modelTests: modelTestsList || [],
            questionBanks: questionBanksList || [],
            allSubjects: assignedSubjects || rawAllSubjects,
            subjectTopicMap,
            rawTopics,
            globalStats,
            studentStats
        });
    } catch (err) {
        console.error('Exams page route error:', err);
        res.status(500).send('Error loading exams page');
    }
});

// GET /exams/custom-test — Dedicated Custom Exam Builder Page
router.get('/exams/custom-test', protect, async (req, res) => {
    try {
        await connectDB();
        const Question = require('../models/Question');
        const QuestionBank = require('../models/QuestionBank');
        const AcademicClass = require('../models/AcademicClass');
        const User = require('../models/User');

        const user = await User.findById(req.session.userId).lean();
        const userClassStr = (user && user.classLevel) ? user.classLevel.trim() : '';

        // 1. Fetch assigned subjects for student's class level from AcademicClass (Superadmin configured)
        let classSubjects = [];
        if (userClassStr) {
            const escapedClass = userClassStr.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
            const ac = await AcademicClass.findOne({ 
                name: { $regex: new RegExp(`^${escapedClass}$`, 'i') } 
            }).lean();
            if (ac && ac.subjects && ac.subjects.length > 0) {
                classSubjects = ac.subjects.filter(Boolean);
            }
        }

        // Fallback: If no specific class match found or user has no classLevel, query AcademicClass + Question
        if (classSubjects.length === 0) {
            const allAc = await AcademicClass.find().lean();
            const acSubs = allAc.flatMap(a => a.subjects || []);
            const qSubjects = await Question.distinct('subject');
            classSubjects = Array.from(new Set([...acSubs, ...qSubjects])).filter(Boolean);
        }

        const allSubjects = Array.from(new Set(classSubjects)).filter(Boolean).sort();

        // 2. Fetch Subject & Topic Breakdown with Question Counts
        const subjectBreakdown = await Question.aggregate([
            {
                $group: {
                    _id: '$subject',
                    totalQuestions: { $sum: 1 },
                    mcqCount: { $sum: { $cond: [{ $eq: ['$questionType', 'MCQ'] }, 1, 0] } },
                    writtenCount: { $sum: { $cond: [{ $ne: ['$questionType', 'MCQ'] }, 1, 0] } },
                    topics: { $addToSet: '$topic' }
                }
            }
        ]);

        const subjectTopicMap = {};
        subjectBreakdown.forEach(sb => {
            if (sb._id) {
                subjectTopicMap[sb._id] = {
                    totalQuestions: sb.totalQuestions,
                    mcqCount: sb.mcqCount,
                    writtenCount: sb.writtenCount,
                    topics: (sb.topics || []).filter(Boolean)
                };
            }
        });

        // 3. Raw topics mapped to subjects
        const rawTopics = await Question.aggregate([
            { $match: { topic: { $ne: '' } } },
            { $group: { _id: { subject: '$subject', topic: '$topic' }, count: { $sum: 1 } } }
        ]);

        res.render('custom-test', {
            pageTitle: 'Custom Quiz',
            user: user || req.session.user,
            allSubjects,
            subjectTopicMap,
            rawTopics
        });
    } catch (err) {
        console.error('Custom test page error:', err);
        res.status(500).send('Error loading CustomTest Builder page');
    }
});

// GET /api/questions/count — Dynamic Question Count API for real-time validation (supports multi-subject, multi-topic, multi-type)
router.get('/api/questions/count', protect, async (req, res) => {
    try {
        await connectDB();
        const Question = require('../models/Question');
        const { subject, topic, questionType, questionTypes } = req.query;

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            return String(val).split(',').map(s => s.trim()).filter(Boolean);
        };

        const subjects = parseList(subject);
        const topics = parseList(topic);
        const types = parseList(questionTypes || questionType);

        const filter = {};
        if (subjects.length > 0) filter.subject = { $in: subjects };
        if (topics.length > 0) filter.topic = { $in: topics };

        const typeCounts = {
            MCQ: await Question.countDocuments({ ...filter, questionType: 'MCQ' }),
            Short: await Question.countDocuments({ ...filter, questionType: 'Short' }),
            Medium: await Question.countDocuments({ ...filter, questionType: 'Medium' }),
            Comprehension: await Question.countDocuments({ ...filter, questionType: 'Comprehension' })
        };

        if (types.length > 0 && !types.includes('All')) {
            filter.questionType = { $in: types };
        }

        const count = await Question.countDocuments(filter);

        res.json({ success: true, count, typeCounts });
    } catch (err) {
        console.error('API Question count error:', err);
        res.status(500).json({ success: false, count: 0, typeCounts: { MCQ: 0, Short: 0, Medium: 0, Comprehension: 0 } });
    }
});

// GET /api/questions/preview — Fetch question set preview for custom test modal
router.get('/api/questions/preview', protect, async (req, res) => {
    try {
        await connectDB();
        const Question = require('../models/Question');
        const { subject, topic, questionType, questionTypes } = req.query;

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            return String(val).split(',').map(s => s.trim()).filter(Boolean);
        };

        const subjects = parseList(subject);
        const topics = parseList(topic);
        const types = parseList(questionTypes || questionType);

        const filter = {};
        if (subjects.length > 0) filter.subject = { $in: subjects };
        if (topics.length > 0) filter.topic = { $in: topics };
        if (types.length > 0 && !types.includes('All')) filter.questionType = { $in: types };

        const questions = await Question.find(filter)
            .select('questionText questionType marks subject topic options')
            .limit(10)
            .lean();

        res.json({ success: true, questions });
    } catch (err) {
        console.error('API Question preview error:', err);
        res.status(500).json({ success: false, questions: [] });
    }
});

// POST /exams/custom-start — Create and start a custom exam session
router.post('/exams/custom-start', protect, async (req, res) => {
    try {
        await connectDB();
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');

        const { subject, topic, questionType, questionTypes, questionCount, duration, durationUnit, negativeMarking } = req.body;
        
        const rawDur = parseFloat(duration) || 15;
        const unit = (durationUnit || 'mins').toLowerCase();
        const examDuration = (unit === 'hours' || unit === 'hour') ? Math.round(rawDur * 60) : Math.round(rawDur);

        const isNegativeMarking = (negativeMarking === 'on' || negativeMarking === 'true' || negativeMarking === true);

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            return String(val).split(',').map(s => s.trim()).filter(Boolean);
        };

        const subjects = parseList(subject);
        const topics = parseList(topic);
        let selectedTypes = parseList(questionTypes || questionType);
        if (selectedTypes.length === 0 || selectedTypes.includes('All')) {
            selectedTypes = ['MCQ', 'Short', 'Medium', 'Comprehension'];
        }

        // Base query filter
        const baseFilter = {};
        if (subjects.length > 0) baseFilter.subject = { $in: subjects };
        if (topics.length > 0) baseFilter.topic = { $in: topics };

        let finalSelectedQuestions = [];

        // For each selected type, fetch requested count
        for (const type of selectedTypes) {
            const countForType = parseInt(req.body[`count_${type}`] || questionCount) || 10;
            const filterForType = { ...baseFilter, questionType: type };
            
            let questionsForType = await Question.find(filterForType).lean();
            if (questionsForType.length > 0) {
                questionsForType = questionsForType.sort(() => 0.5 - Math.random()).slice(0, countForType);
                finalSelectedQuestions.push(...questionsForType);
            }
        }

        // Fallback: If no type-specific questions found, search base filter
        if (finalSelectedQuestions.length === 0) {
            let fallbackQuestions = await Question.find(baseFilter).lean();
            const requestedCount = parseInt(questionCount) || 10;
            finalSelectedQuestions = fallbackQuestions.sort(() => 0.5 - Math.random()).slice(0, requestedCount);
        }

        if (finalSelectedQuestions.length === 0) {
            return res.redirect('/exams/custom-test');
        }

        // Create temporary Question Bank for this custom session ([Subjects] Personalized Exam - )
        const subjectTitleStr = subjects.length > 0 ? subjects.join(', ') : 'General Practice';
        const customTitle = `${subjectTitleStr} Personalized Exam - `;

        const newBank = await new QuestionBank({
            title: customTitle.slice(0, 120),
            subject: subjects[0] || 'General Practice',
            topic: topics[0] || 'Custom Quiz',
            classLevel: ['SSC', 'HSC'],
            accessType: 'Free',
            duration: examDuration,
            negativeMarking: isNegativeMarking,
            negativeMarkValue: 0.25,
            status: 'approved',
            isCustom: true,
            addedBy: req.session.userId
        }).save();

        // Attach selected question copies to this new bankId
        for (const q of finalSelectedQuestions) {
            await new Question({
                subject: q.subject,
                topic: q.topic,
                classLevel: q.classLevel,
                questionText: q.questionText,
                options: q.options,
                correctAnswerIndex: q.correctAnswerIndex,
                correctAnswer: q.correctAnswer,
                questionType: q.questionType,
                explanation: q.explanation,
                marks: q.marks || 1,
                bankId: newBank._id,
                addedBy: req.session.userId
            }).save();
        }

        res.redirect(`/question-bank/solve/${newBank._id}`);
    } catch (err) {
        console.error('Custom Exam Start Error:', err);
        res.redirect('/exams/custom-test');
    }
});

// Join Live Class (Shared for Teachers and Students)
router.get('/live/:roomId', protect, async (req, res) => {
    try {
        await connectDB();
        const roomId = req.params.roomId;
        const isModerator = req.session.user.role === 'teacher' || req.session.user.role === 'admin' || req.session.user.role === 'superadmin';

        // Try to find the course that has this live class
        let course = null;
        try {
            course = await Course.findOne({ 'curriculumNodes.meetingUrl': roomId })
                .populate('instructor', 'name profileImage profilePicture bio role')
                .populate('curriculumNodes.quizId')
                .lean();

            // If not found in curriculumNodes, try old chapters format
            if (!course) {
                course = await Course.findOne({ 'chapters.liveClasses.meetingUrl': roomId })
                    .populate('instructor', 'name profileImage profilePicture bio role')
                    .lean();
            }
        } catch (e) {
            console.error('[Live] Failed to find course for room:', roomId, e.message);
        }

        // Pre-flatten curriculum nodes (avoids recursive EJS functions)
        function flattenNodes(nodes, parentId, depth, result) {
            const children = nodes.filter(n => String(n.parentId || '') === String(parentId || ''));
            children.forEach(n => {
                const obj = { ...n, _depth: depth };
                result.push(obj);
                if (n.type === 'folder') {
                    flattenNodes(nodes, String(n._id), depth + 1, result);
                }
            });
            return result;
        }

        let flatNodes = [];
        if (course && course.curriculumNodes) {
            flattenNodes(course.curriculumNodes, null, 0, flatNodes);
        }

        // Extract the specific title of this live class
        let liveTitle = '';
        let liveDescription = '';
        let liveNodeId = '';
        let isRecorded = false;
        let videoPath = '';

        if (course) {
            if (course.curriculumNodes) {
                const liveNode = course.curriculumNodes.find(n => n.meetingUrl === roomId && n.type === 'liveClass');
                if (liveNode) {
                    liveTitle = liveNode.name || liveNode.title;
                    liveDescription = liveNode.description || '';
                    liveNodeId = liveNode._id.toString();
                    isRecorded = !!liveNode.isRecorded || !!liveNode.videoPath;
                    videoPath = liveNode.videoPath || '';
                }
            }
            if (!liveTitle && course.chapters) {
                for (const ch of course.chapters) {
                    if (ch.liveClasses) {
                        const lc = ch.liveClasses.find(l => l.meetingUrl === roomId);
                        if (lc) {
                            liveTitle = lc.title || lc.name;
                            break;
                        }
                    }
                }
            }
        }

        res.render('teacher/live-classroom', {
            roomId,
            user: req.session.user,
            isModerator,
            course: course || null,
            courseId: course ? course._id.toString() : '',
            liveNodeId,
            liveTitle: liveTitle || (course ? course.title : 'Live Class'),
            liveDescription,
            isRecorded,
            videoPath,
            flatNodes,
            playlist: flatNodes.filter(node => node.type === 'video' || (node.type === 'liveClass' && (node.isRecorded || node.videoPath))),
            agoraAppId: process.env.AGORA_APP_ID || ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading live class');
    }
});



const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../client/public/uploads/videos');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = file.originalname.endsWith('.mp4') ? '.mp4' : '.webm';
        cb(null, Date.now() + '-live-recording-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const uploadVideo = multer({ storage: videoStorage });

// Upload Live Class Recording
router.post('/api/live/upload-recording', protect, uploadVideo.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file provided' });
        res.json({ success: true, videoPath: '/uploads/videos/' + req.file.filename });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

// Video streaming route with proper Range request support (needed for seekable WebM/MP4)
router.get('/api/video/stream', protect, async (req, res) => {
    try {
        const { p } = req.query; // e.g. /uploads/videos/filename.webm
        if (!p || !p.startsWith('/uploads/')) {
            return res.status(400).json({ error: 'Invalid path' });
        }
        const filePath = path.join(__dirname, '../../client/public', p);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/mp4' };
        const contentType = mimeTypes[ext] || 'video/webm';

        const range = req.headers.range;
        if (range) {
            // Parse Range header
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024 - 1, fileSize - 1);
            const chunkSize = end - start + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
            });
            fileStream.pipe(res);
        } else {
            // No Range header - send full file
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (err) {
        console.error('Video stream error:', err);
        res.status(500).json({ error: 'Stream failed' });
    }
});

// End Live Class and save as recorded video
router.post('/api/live/end', protect, async (req, res) => {
    try {
        await connectDB();
        const { roomId, duration, isRecorded, videoPath: uploadedVideoPath } = req.body;
        if (!roomId) {
            return res.status(400).json({ error: 'Room ID is required' });
        }

        const user = req.session.user;
        const isModerator = ['teacher', 'admin', 'superadmin'].includes(user.role);
        if (!isModerator) {
            return res.status(403).json({ error: 'Only instructors can end live classes' });
        }

        // Find the course that has this live class
        const course = await Course.findOne({
            $or: [
                { 'curriculumNodes.meetingUrl': roomId },
                { 'chapters.liveClasses.meetingUrl': roomId }
            ]
        });

        if (!course) {
            return res.status(404).json({ error: 'Course or live class not found' });
        }

        let updated = false;
        let savedNodeId = null;
        let savedVideoPath = null;
        let savedFolderId = null;

        // Use the actual uploaded recording path from the client, or fallback if nothing was uploaded
        const recordingVideoPath = (uploadedVideoPath && uploadedVideoPath.startsWith('/uploads/'))
            ? uploadedVideoPath
            : (isRecorded ? '/uploads/videos/1779038199944-Flow_delpmaspu_.mp4' : null);
        const recordingDuration = duration || '00:00:00';

        // 1. Try curriculumNodes (new format)
        if (course.curriculumNodes && course.curriculumNodes.length > 0) {
            const node = course.curriculumNodes.find(n => n.meetingUrl === roomId && n.type === 'liveClass');
            if (node) {
                savedNodeId = node._id.toString();
                savedVideoPath = recordingVideoPath;
                savedFolderId = node.parentId ? node.parentId.toString() : null;

                // Keep type as 'liveClass' with isRecorded=true if recorded, else remove node
                if (isRecorded) {
                    await Course.updateOne(
                        { _id: course._id, 'curriculumNodes._id': node._id },
                        {
                            $set: {
                                'curriculumNodes.$.isRecorded': true,
                                'curriculumNodes.$.videoPath': recordingVideoPath,
                                'curriculumNodes.$.duration': recordingDuration
                            }
                        }
                    );
                } else {
                    await Course.updateOne(
                        { _id: course._id },
                        { $pull: { curriculumNodes: { _id: node._id } } }
                    );
                }
                updated = true;
            }
        }

        // 2. Try chapters (legacy format)
        if (!updated && course.chapters && course.chapters.length > 0) {
            for (let i = 0; i < course.chapters.length; i++) {
                const chapter = course.chapters[i];
                const liveIndex = chapter.liveClasses.findIndex(lc => lc.meetingUrl === roomId);
                if (liveIndex !== -1) {
                    const lc = chapter.liveClasses[liveIndex];

                    const recordedClass = {
                        title: lc.title || 'Recorded Live Class',
                        videoPath: recordingVideoPath,
                        description: 'Recorded live class session.',
                        instructor: user.name || 'Instructor',
                        duration: recordingDuration,
                        accessType: 'paid',
                        views: 0
                    };

                    // Remove from liveClasses and add to recordedClasses if recorded
                    chapter.liveClasses.splice(liveIndex, 1);

                    if (isRecorded) {
                        const recordedClass = {
                            title: lc.title || 'Recorded Live Class',
                            videoPath: recordingVideoPath,
                            description: 'Recorded live class session.',
                            instructor: user.name || 'Instructor',
                            duration: recordingDuration,
                            accessType: 'paid',
                            views: 0
                        };
                        chapter.recordedClasses.push(recordedClass);
                        savedVideoPath = recordingVideoPath;
                    }

                    await course.save();
                    updated = true;
                    break;
                }
            }
        }

        if (!updated) {
            return res.status(404).json({ error: 'Live class not found in course curriculum' });
        }

        res.json({
            success: true,
            courseId: course._id.toString(),
            nodeId: savedNodeId,
            videoPath: savedVideoPath,
            folderId: savedFolderId
        });
    } catch (err) {
        console.error('[Live End Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// AGORA TOKEN GENERATION
// ==========================================
router.get('/api/agora/token', protect, async (req, res) => {
    try {
        const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
        const channelName = req.query.channelName;

        if (!channelName) {
            return res.status(400).json({ error: 'channelName is required' });
        }

        const appId = process.env.AGORA_APP_ID;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE;

        if (!appId || !appCertificate) {
            console.error('[Agora] Missing App ID or Certificate in .env');
            // If missing, return empty token to allow test mode (if App Certificate is not enabled in Agora console)
            return res.json({ token: null, error: 'Credentials missing' });
        }

        // Determine role
        const isModerator = req.session.user.role === 'teacher' || req.session.user.role === 'admin' || req.session.user.role === 'superadmin';
        const role = isModerator ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

        // Ensure uid is an integer (Agora requirement) or 0 for dynamic
        // We will use 0 to let Agora assign a random UID, or pass a random integer.
        let uid = req.query.uid;
        if (!uid || uid === '') {
            uid = 0;
        }

        const expirationTimeInSeconds = 3600; // 1 hour token
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        const token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            uid,
            role,
            privilegeExpiredTs
        );

        res.json({ token });
    } catch (err) {
        console.error('[Agora Token Error]', err);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

module.exports = router;
