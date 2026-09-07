const express = require('express');
const router = express.Router();
const path = require('path');
const mongoose = require('mongoose');
const { connectDB, teacherProtect, Course, Quiz, Note, Folder, QuestionBank, QA, User, Question, SystemLog } = require('../config');

// Helper to log system activity
const logActivity = async (req, action, actionDetails, entityType, entityId = null) => {
    try {
        if (!req.session || !req.session.user) return;
        await SystemLog.create({
            action,
            actionDetails,
            performedBy: req.session.user._id,
            entityType,
            entityId
        });
    } catch (e) { console.error('Failed to log activity:', e); }
};

// MongoDB ID Validator Middleware
const validateObjectId = (req, res, next, id) => {
    const mongoose = require('mongoose');
    const cleanId = String(id).trim();
    if (!mongoose.Types.ObjectId.isValid(cleanId)) {
        console.warn(`[Teacher] Invalid ID blocked: "${cleanId}"`);
        return res.status(404).json({ error: `Invalid ID: ${cleanId}. Malformed Database ID.` });
    }
    next();
};
router.param('id', validateObjectId);
router.param('cid', validateObjectId);
router.param('chid', validateObjectId);
router.param('qid', validateObjectId);


// Helper to validate ObjectId
const validateId = (id) => mongoose.Types.ObjectId.isValid(id);

// Teacher Dashboard
router.get('/', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const teacherId = user._id;

        // Find courses where the teacher is primary or permitted
        const courses = await Course.find({ 
            $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }] 
        });
        
        const teacherObjectId = new mongoose.Types.ObjectId(String(teacherId));

        const totalCourses = courses.length;
        
        let totalRecorded = 0;
        let totalLive = 0;
        let totalNotes = 0;
        
        courses.forEach(c => {
            if (c.curriculumNodes && c.curriculumNodes.length > 0) {
                c.curriculumNodes.forEach(n => {
                    if (n.type === 'video') totalRecorded++;
                    if (n.type === 'liveClass') totalLive++;
                    if (n.type === 'note') totalNotes++;
                });
            } else if (c.chapters) {
                c.chapters.forEach(ch => {
                    totalRecorded += ch.recordedClasses?.length || 0;
                    totalLive += ch.liveClasses?.length || 0;
                    totalNotes += ch.notes?.length || 0;
                });
            }
        });
        
        const totalClasses = totalRecorded + totalLive;

        const [answeredQas, totalAddedQuestions, pendingQas] = await Promise.all([
            QA.countDocuments({ answeredBy: teacherObjectId }),
            QuestionBank.countDocuments({ addedBy: teacherObjectId }),
            QA.find({ status: 'open' }).limit(5).populate('askedBy').lean()
        ]);

        // Upcoming Live Classes
        let upcomingLiveClasses = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        courses.forEach(c => {
            if (c.chapters) {
                c.chapters.forEach(ch => {
                    if (ch.liveClasses && ch.liveClasses.length > 0) {
                        ch.liveClasses.forEach(lc => {
                            if (new Date(lc.date) >= today) {
                                upcomingLiveClasses.push({
                                    courseTitle: c.title,
                                    courseId: c._id,
                                    classTitle: lc.title,
                                    date: lc.date,
                                    meetingUrl: lc.meetingUrl
                                });
                            }
                        });
                    }
                });
            }
        });
        upcomingLiveClasses.sort((a, b) => new Date(a.date) - new Date(b.date));
        upcomingLiveClasses = upcomingLiveClasses.slice(0, 5);

        // Course Engagement
        const courseEngagement = await Course.aggregate([
            { $match: { $or: [{ instructor: teacherObjectId }, { permittedTeachers: teacherObjectId }] } },
            { $lookup: { from: 'users', localField: '_id', foreignField: 'enrolledCourses.course', as: 'enrolledStudents' } },
            { $addFields: { studentCount: { $size: { $ifNull: ['$enrolledStudents', []] } } } },
            { $sort: { studentCount: -1 } },
            { $limit: 3 },
            { $project: { title: 1, classLevel: 1, subject: 1, studentCount: 1 } }
        ]);

        res.render('teacher/dashboard', {
            stats: { totalCourses, totalClasses, answeredQas },
            contents: { totalRecorded, totalLive, totalNotes, totalAddedQuestions },
            recentActivity: [],
            pendingQas: pendingQas.map(q => ({ ...q, user: q.askedBy, question: q.question })),
            upcomingLiveClasses,
            courseEngagement,
            user, active: 'dashboard'
        });
    } catch (err) {
        console.error('Teacher Dashboard Error:', err);
        res.status(500).send('টিচার ড্যাশবোর্ড লোড করতে সমস্যা হয়েছে।');
    }
});

// Teacher Messages Portal
router.get('/messages', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const Message = require('../models/Message');
        const teacher = await User.findById(req.session.userId).lean();
        if (!teacher) return res.redirect('/login');

        // Find all direct messages involving this teacher
        const allMessages = await Message.find({
            $or: [
                { sender: teacher._id },
                { receiver: teacher._id }
            ]
        }).sort({ createdAt: -1 }).lean();

        // Collect student IDs who interacted with this teacher
        const studentMap = {};

        allMessages.forEach(msg => {
            const otherId = msg.sender.toString() === teacher._id.toString()
                ? (msg.receiver ? msg.receiver.toString() : null)
                : msg.sender.toString();

            if (otherId) {
                if (!studentMap[otherId]) {
                    studentMap[otherId] = {
                        studentId: otherId,
                        student: null,
                        latestMessage: msg,
                        unreadCount: 0
                    };
                }
                if (msg.receiver && msg.receiver.toString() === teacher._id.toString() && !msg.isRead) {
                    studentMap[otherId].unreadCount++;
                }
            }
        });

        // Also fetch students enrolled in courses taught by this teacher
        const myCourses = await Course.find({
            $or: [{ instructor: teacher._id }, { permittedTeachers: teacher._id }]
        }).select('_id title').lean();
        const myCourseIds = myCourses.map(c => c._id);

        if (myCourseIds.length > 0) {
            const enrolledStudents = await User.find({
                'enrolledCourses.course': { $in: myCourseIds },
                role: 'student'
            }).select('name email classLevel profilePicture profileImage').lean();

            enrolledStudents.forEach(stu => {
                const stuId = stu._id.toString();
                if (!studentMap[stuId]) {
                    studentMap[stuId] = {
                        studentId: stuId,
                        student: stu,
                        latestMessage: null,
                        unreadCount: 0
                    };
                } else {
                    studentMap[stuId].student = stu;
                }
            });
        }

        // Fetch user profiles for any students who aren't yet populated
        const missingStudentIds = Object.keys(studentMap).filter(id => !studentMap[id].student);
        if (missingStudentIds.length > 0) {
            const extraStudents = await User.find({ _id: { $in: missingStudentIds } })
                .select('name email classLevel profilePicture profileImage')
                .lean();
            extraStudents.forEach(stu => {
                if (studentMap[stu._id.toString()]) {
                    studentMap[stu._id.toString()].student = stu;
                }
            });
        }

        let conversations = Object.values(studentMap).filter(c => c.student);

        // Sort by latest message date, or student name
        conversations.sort((a, b) => {
            const dateA = a.latestMessage ? new Date(a.latestMessage.createdAt) : new Date(0);
            const dateB = b.latestMessage ? new Date(b.latestMessage.createdAt) : new Date(0);
            return dateB - dateA;
        });

        const activeStudentId = req.query.studentId;
        let activeStudent = null;
        if (activeStudentId) {
            const found = conversations.find(c => c.studentId === activeStudentId);
            activeStudent = found ? found.student : null;
        } else if (conversations.length > 0) {
            activeStudent = conversations[0].student;
        }

        res.render('teacher/messages', {
            user: teacher,
            active: 'messages',
            conversations,
            activeStudent
        });
    } catch (err) {
        console.error('Teacher messages error:', err);
        res.status(500).render('teacher/messages', {
            user: req.session.user,
            active: 'messages',
            conversations: [],
            activeStudent: null
        });
    }
});

// My Courses List
router.get('/courses', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;
        const teacherObjectId = new mongoose.Types.ObjectId(String(teacherId));
        
        let courses = await Course.aggregate([
            { $match: { $or: [{ instructor: teacherObjectId }, { permittedTeachers: teacherObjectId }] } },
            { $lookup: { from: 'users', localField: '_id', foreignField: 'enrolledCourses.course', as: 'enrolledStudents' } },
            { $addFields: { studentCount: { $size: { $ifNull: ['$enrolledStudents', []] } } } },
            { $project: { enrolledStudents: 0 } }
        ]);

        // Extract assigned classes
        const assignedClasses = [...new Set(courses.flatMap(c => c.classLevel || []))].filter(Boolean).sort();

        // Get filter selections
        const selectedClass = req.query.class || 'all';

        // Filter courses accordingly
        if (selectedClass !== 'all') {
            courses = courses.filter(c => c.classLevel && c.classLevel.includes(selectedClass));
        }

        res.render('teacher/courses', {
            courses,
            assignedClasses,
            filters: {
                class: selectedClass
            },
            user: req.session.user,
            active: 'courses'
        });
    } catch (err) {
        res.status(500).send('Error loading courses');
    }
});

// Curriculum migration helper
const migrateCourseCurriculumIfRequired = async (course) => {
    if ((!course.curriculumNodes || course.curriculumNodes.length === 0) && course.chapters && course.chapters.length > 0) {
        console.log(`[Migration] Migrating chapters to curriculumNodes for course: ${course.title} (${course._id})`);
        const nodes = [];
        course.chapters.forEach(chapter => {
            const chapterId = new mongoose.Types.ObjectId();
            nodes.push({
                _id: chapterId,
                name: chapter.title,
                type: 'folder',
                parentId: null
            });
            if (chapter.recordedClasses) {
                chapter.recordedClasses.forEach(video => {
                    nodes.push({
                        _id: video._id || new mongoose.Types.ObjectId(),
                        name: video.title,
                        type: 'video',
                        parentId: chapterId.toString(),
                        videoPath: video.videoPath,
                        duration: video.duration,
                        description: video.description || ''
                    });
                });
            }
            if (chapter.notes) {
                chapter.notes.forEach(note => {
                    nodes.push({
                        _id: note._id || new mongoose.Types.ObjectId(),
                        name: note.title,
                        type: 'note',
                        parentId: chapterId.toString(),
                        filePath: note.filePath
                    });
                });
            }
            if (chapter.liveClasses) {
                chapter.liveClasses.forEach(live => {
                    nodes.push({
                        _id: live._id || new mongoose.Types.ObjectId(),
                        name: live.title,
                        type: 'liveClass',
                        parentId: chapterId.toString(),
                        meetingUrl: live.meetingUrl,
                        date: live.date
                    });
                });
            }
            if (chapter.quizzes) {
                chapter.quizzes.forEach(quizId => {
                    nodes.push({
                        _id: new mongoose.Types.ObjectId(),
                        name: "Exam Assessment",
                        type: 'quiz',
                        parentId: chapterId.toString(),
                        quizId: quizId
                    });
                });
            }
        });
        course.curriculumNodes = nodes;
        await course.save();
    }
};

// Recursive child node collector
const getRecursiveChildNodeIds = (nodes, parentId) => {
    let childIds = [];
    const children = nodes.filter(n => String(n.parentId || '') === String(parentId));
    children.forEach(child => {
        childIds.push(child._id);
        childIds = childIds.concat(getRecursiveChildNodeIds(nodes, child._id.toString()));
    });
    return childIds;
};

// Course Curriculum Management
router.get('/course/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;
        
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
        })
            .populate('instructor', 'name email profileImage profilePicture bio role')
            .populate('permittedTeachers', 'name email profileImage profilePicture bio role')
            .populate('curriculumNodes.quizId', 'title duration totalMarks')
            .populate('chapters.quizzes', 'title duration totalMarks');

        if (!course) return res.status(403).send('এই কোর্সে আপনার অ্যাক্সেস নেই।');

        // Check for migration
        await migrateCourseCurriculumIfRequired(course);

        // Fetch students and progress
        const enrolledStudents = await User.find({ 'enrolledCourses.course': course._id })
            .select('name email profileImage profilePicture enrolledCourses.course enrolledCourses.enrolledAt enrolledCourses.progress quizResults.quiz')
            .lean();
        const courseQuizIds = (course.curriculumNodes || []).filter(n => n.type === 'quiz' && n.quizId).map(n => String(n.quizId._id || n.quizId));
        const students = enrolledStudents.map(s => {
            const enrollment = (s.enrolledCourses || []).find(ec => String(ec.course) === String(course._id));
            const examAttended = s.quizResults ? s.quizResults.filter(qr => courseQuizIds.includes(String(qr.quiz))).length : 0;
            return {
                name: s.name,
                email: s.email,
                profileImage: s.profileImage || s.profilePicture || '/images/default-avatar.png',
                enrolledAt: enrollment ? enrollment.enrolledAt : new Date(),
                progress: enrollment ? enrollment.progress || 0 : 0,
                examAttended
            };
        });

        const stats = {
            studentCount: students.length,
            examCount: course.curriculumNodes.filter(n => n.type === 'quiz').length
        };

        // Filter chapters based on chapter-level permissions
        let unpermittedChapterTitles = [];
        if (course.chapters && course.chapters.length > 0) {
            unpermittedChapterTitles = course.chapters.filter(chapter => {
                if (!chapter.permittedTeachers || chapter.permittedTeachers.length === 0) return true; // Unpermitted if no teachers assigned
                return !chapter.permittedTeachers.some(tId => String(tId._id || tId) === String(teacherId));
            }).map(ch => ch.title);
        }

        // Add readonly flag to curriculumNodes based on unpermitted chapters
        if (unpermittedChapterTitles.length > 0 && course.curriculumNodes) {
            // Find IDs of root folders that are unpermitted
            const unpermittedFolderIds = course.curriculumNodes
                .filter(n => n.type === 'folder' && !n.parentId && unpermittedChapterTitles.includes(n.name))
                .map(n => String(n._id));
            
            if (unpermittedFolderIds.length > 0) {
                function isDescendant(node) {
                    if (!node.parentId) return false;
                    if (unpermittedFolderIds.includes(String(node.parentId))) return true;
                    const parent = course.curriculumNodes.find(n => String(n._id) === String(node.parentId));
                    return parent ? isDescendant(parent) : false;
                }
                
                course.curriculumNodes = course.curriculumNodes.map(n => {
                    const nodeObj = n.toObject ? n.toObject() : n;
                    if (unpermittedFolderIds.includes(String(nodeObj._id)) || isDescendant(nodeObj)) {
                        nodeObj.isReadonly = true;
                    }
                    return nodeObj;
                });
            }
        }

        res.render('teacher/course-curriculum', {
            course,
            stats,
            students,
            user: req.session.user,
            active: 'courses'
        });
    } catch (err) {
        console.error('Curriculum Load Error:', err);
        res.status(500).send('Error loading curriculum: ' + err.message);
    }
});

// Wrapper to lazily load multer upload field middleware
const lazyUploadMiddleware = (req, res, next) => {
    if (router.upload) {
        return router.upload.fields([
            { name: 'video', maxCount: 1 },
            { name: 'thumbnail', maxCount: 1 },
            { name: 'note', maxCount: 1 }
        ])(req, res, next);
    }
    next();
};

// GET /course/:id/curriculum
router.get('/course/:id/curriculum', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
        })
        .populate('curriculumNodes.quizId', 'title duration totalMarks')
        .populate('curriculumNodes.addedBy', 'name profilePicture profileImage role')
        .lean();
        if (!course) return res.status(403).json({ error: 'Access denied' });
        
        await migrateCourseCurriculumIfRequired(course);
        
        let nodesToReturn = course.curriculumNodes || [];
        const teacherId = req.session.user._id;
        
        let unpermittedChapterTitles = [];
        if (course.chapters && course.chapters.length > 0) {
            unpermittedChapterTitles = course.chapters.filter(chapter => {
                if (!chapter.permittedTeachers || chapter.permittedTeachers.length === 0) return true; // Unpermitted if no teachers assigned
                return !chapter.permittedTeachers.some(tId => String(tId._id || tId) === String(teacherId));
            }).map(ch => ch.title);
        }
        
        if (unpermittedChapterTitles.length > 0 && nodesToReturn.length > 0) {
            const unpermittedFolderIds = nodesToReturn
                .filter(n => n.type === 'folder' && !n.parentId && unpermittedChapterTitles.includes(n.name))
                .map(n => String(n._id));
            
            if (unpermittedFolderIds.length > 0) {
                function isDescendant(node) {
                    if (!node.parentId) return false;
                    if (unpermittedFolderIds.includes(String(node.parentId))) return true;
                    const parent = nodesToReturn.find(n => String(n._id) === String(node.parentId));
                    return parent ? isDescendant(parent) : false;
                }
                
                nodesToReturn = nodesToReturn.map(n => {
                    const nodeObj = n.toObject ? n.toObject() : n;
                    if (unpermittedFolderIds.includes(String(nodeObj._id)) || isDescendant(nodeObj)) {
                        nodeObj.isReadonly = true;
                    }
                    return nodeObj;
                });
            }
        }
        
        res.json({ nodes: nodesToReturn });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /course/:id/quizzes
router.get('/course/:id/quizzes', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quizzes = await Quiz.find({}).select('title duration questions').lean();
        res.json({ quizzes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /course/:id/curriculum/node
router.post('/course/:id/curriculum/node', teacherProtect, lazyUploadMiddleware, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
        });
        if (!course) return res.status(403).json({ error: 'Access denied' });

        let { name, type, parentId, meetingUrl, date, quizId, duration, description } = req.body;
        
        // Fix for multiple fields with same name in frontend form causing array
        if (Array.isArray(description)) description = description.find(d => d.trim() !== '') || '';
        if (Array.isArray(duration)) duration = duration.find(d => d.trim() !== '') || '';
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        const newNode = {
            _id: new mongoose.Types.ObjectId(),
            name,
            type,
            parentId: parentId || null,
            addedBy: req.session.user._id
        };

        if (type === 'video') {
            newNode.duration = duration || '';
            newNode.description = description || '';
            if (req.files && req.files.video && req.files.video[0]) {
                const { processUploadedFile } = require('../services/cloudinaryService');
                newNode.videoPath = await processUploadedFile(req.files.video[0], 'videos');
            } else if (req.body.videoPath) {
                newNode.videoPath = req.body.videoPath;
            } else {
                return res.status(400).json({ error: 'Video file or path is required' });
            }

            if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
                const { processUploadedFile } = require('../services/cloudinaryService');
                newNode.thumbnail = await processUploadedFile(req.files.thumbnail[0], 'thumbnails');
            } else if (req.body.thumbnailPath) {
                newNode.thumbnail = req.body.thumbnailPath;
            }
        } else if (type === 'note') {
            if (req.files && req.files.note && req.files.note[0]) {
                const { processUploadedFile } = require('../services/cloudinaryService');
                newNode.filePath = await processUploadedFile(req.files.note[0], 'notes');
            } else if (req.body.filePath) {
                newNode.filePath = req.body.filePath;
            } else {
                return res.status(400).json({ error: 'Note file or path is required' });
            }
        } else if (type === 'liveClass') {
            const autoUrl = meetingUrl || ('live-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6));
            newNode.meetingUrl = autoUrl;
            newNode.date = date ? new Date(date) : new Date();
            newNode.description = description || '';
            const liveMode = req.body.liveMode || 'instant';
            if (liveMode === 'instant' || !date) {
                newNode.isLive = true;
                newNode.liveStartedAt = new Date();
            }
        } else if (type === 'quiz') {
            const { quizId, bankId, quizName, quizDate, quizMode } = req.body;
            
            // Override the node name with the specific quiz name if provided
            if (quizName) newNode.name = quizName;
            
            newNode.date = quizDate ? new Date(quizDate) : new Date();
            
            if (bankId) {
                const bank = await QuestionBank.findById(bankId);
                if (!bank) return res.status(404).json({ error: 'Question Bank not found' });
                
                const questions = await Question.find({ bankId: bank._id });
                if (!questions.length) return res.status(400).json({ error: 'This bank has no questions to create a quiz' });
                
                // Create new Quiz
                const newQuiz = new Quiz({
                    title: newNode.name || `${bank.subject} Quiz`,
                    questions: questions.map(q => ({
                        questionText: q.questionText,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        explanation: q.explanation,
                        questionType: q.questionType
                    })),
                    addedBy: req.session.user._id,
                    course: course._id
                });
                
                if (quizMode === 'schedule' && quizDate) {
                    newQuiz.scheduledAt = new Date(quizDate);
                    newQuiz.expiresAt = new Date(new Date(quizDate).getTime() + 12 * 60 * 60 * 1000); // 12h window
                } else {
                    newQuiz.scheduledAt = new Date();
                    newQuiz.expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h window
                }
                
                await newQuiz.save();
                newNode.quizId = newQuiz._id;
            } else if (quizId) {
                const quiz = await Quiz.findById(quizId);
                if (quiz) {
                    if (newNode.name) quiz.title = newNode.name;
                    
                    if (quizMode === 'schedule' && quizDate) {
                        quiz.scheduledAt = new Date(quizDate);
                        quiz.expiresAt = new Date(new Date(quizDate).getTime() + 12 * 60 * 60 * 1000); // 12h window
                    } else {
                        quiz.scheduledAt = new Date();
                        quiz.expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h window
                    }
                    await quiz.save();
                }
                newNode.quizId = quizId;
            } else {
                return res.status(400).json({ error: 'Quiz ID or Bank ID is required' });
            }
        }

        course.curriculumNodes.push(newNode);
        course.markModified('curriculumNodes');
        await course.save();

        // Populate quiz details if type is quiz
        let populatedNode = newNode;
        if (type === 'quiz') {
            const freshCourse = await Course.findById(course._id).populate('curriculumNodes.quizId');
            populatedNode = freshCourse.curriculumNodes.id(newNode._id);
        }

        res.json({ success: true, node: populatedNode });
    } catch (err) {
        console.error('Node Creation Error:', err);
        res.status(500).json({ error: err.message });
    }
});



// POST /course/:id/announcement
router.post('/course/:id/announcement', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const Announcement = require('../models/Announcement');
        const Course = require('../models/Course');
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ success: false });
        
        const teacherId = req.session.user._id;
        const isOwner = String(course.instructor) === String(teacherId);
        const isPermitted = course.permittedTeachers && course.permittedTeachers.some(t => String(t) === String(teacherId));
        if (!isOwner && !isPermitted && req.session.user.role !== 'admin') return res.status(403).json({ success: false });

        const { title, content, priority } = req.body;
        
        const ann = new Announcement({
            courseId: course._id,
            authorId: teacherId,
            title,
            content,
            priority
        });
        await ann.save();
        await ann.populate('authorId', 'name profileImage profilePicture role');

        const io = req.app.get('io');
        if (io) {
            const author = ann.authorId || {};
            const payload = {
                _id: String(ann._id),
                courseId: String(course._id),
                title: ann.title,
                content: ann.content,
                priority: ann.priority || 'normal',
                isHighPriority: ann.priority === 'high',
                author: {
                    name: author.name || req.session.user.name || 'Course Instructor',
                    profileImage: author.profileImage || author.profilePicture || '',
                    role: author.role || req.session.user.role || 'teacher'
                },
                createdAt: ann.createdAt,
                timeAgo: 'Just now',
                formattedDate: new Date(ann.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
                type: 'announcement'
            };
            io.to(`course_${course._id}`).emit('course:announcement_new', payload);
            io.emit('course:announcement_new', payload);
        }

        res.json({ success: true, announcement: ann });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// DELETE /course/:id/announcement/:annId
router.delete('/course/:id/announcement/:annId', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const Announcement = require('../models/Announcement');
        const Course = require('../models/Course');
        const course = await Course.findById(req.params.id);
        
        const teacherId = req.session.user._id;
        const isOwner = String(course.instructor) === String(teacherId);
        const isPermitted = course.permittedTeachers && course.permittedTeachers.some(t => String(t) === String(teacherId));
        if (!isOwner && !isPermitted && req.session.user.role !== 'admin') return res.status(403).json({ success: false });

        await Announcement.findByIdAndDelete(req.params.annId);

        const io = req.app.get('io');
        if (io) {
            const payload = {
                courseId: String(course._id),
                announcementId: String(req.params.annId)
            };
            io.to(`course_${course._id}`).emit('course:announcement_deleted', payload);
            io.emit('course:announcement_deleted', payload);
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// PUT /course/:id/curriculum/reorder

router.put('/course/:id/curriculum/reorder', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findById(req.params.id);
        
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
        
        const teacherId = req.session.user._id;
        const isOwner = String(course.instructor) === String(teacherId);
        const isPermitted = course.permittedTeachers && course.permittedTeachers.some(t => String(t) === String(teacherId));
        const isAdmin = req.session.user.role === 'admin';
        if (!isOwner && !isPermitted && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Unauthorized to modify curriculum' });
        }

        const { nodeIds } = req.body;
        if (!Array.isArray(nodeIds)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        // Update the order of nodes
        nodeIds.forEach((id, index) => {
            const node = course.curriculumNodes.id(id);
            if (node) {
                node.order = index;
            }
        });

        await course.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /course/:id/curriculum/node/:nodeId

router.put('/course/:id/curriculum/node/:nodeId', teacherProtect, lazyUploadMiddleware, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
        });
        if (!course) return res.status(403).json({ error: 'Access denied' });

        const node = course.curriculumNodes.id(req.params.nodeId);
        if (!node) return res.status(404).json({ error: 'Node not found' });

        let { name, duration, description, meetingUrl, date, quizId, quizMode, quizDate, videoPath, thumbnailPath } = req.body;
        
        // Fix for multiple fields with same name in frontend form causing array
        if (Array.isArray(description)) description = description.find(d => d.trim() !== '') || '';
        if (Array.isArray(duration)) duration = duration.find(d => d.trim() !== '') || '';

        if (name) node.name = name;
        if (duration !== undefined) node.duration = duration;
        if (description !== undefined) node.description = description;
        if (meetingUrl !== undefined) node.meetingUrl = meetingUrl;
        if (date !== undefined) node.date = date ? new Date(date) : undefined;
        if (quizId !== undefined) node.quizId = quizId || undefined;

        if (node.type === 'video') {
            if (req.files && req.files.video && req.files.video[0]) {
                const { processUploadedFile } = require('../services/cloudinaryService');
                node.videoPath = await processUploadedFile(req.files.video[0], 'videos');
            } else if (videoPath && videoPath.trim()) {
                node.videoPath = videoPath.trim();
            }

            if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
                const { processUploadedFile } = require('../services/cloudinaryService');
                node.thumbnail = await processUploadedFile(req.files.thumbnail[0], 'thumbnails');
            } else if (thumbnailPath && thumbnailPath.trim()) {
                node.thumbnail = thumbnailPath.trim();
            }
        }

        if (node.type === 'quiz') {
            const finalQuizId = quizId !== undefined ? quizId : node.quizId;
            if (finalQuizId) {
                const quiz = await Quiz.findById(finalQuizId);
                if (quiz) {
                    if (name) quiz.title = name;
                    
                    const finalMode = quizMode !== undefined ? quizMode : (quiz.scheduledAt ? 'schedule' : 'instant');
                    const finalDate = quizDate !== undefined ? quizDate : date;
                    
                    if (finalMode === 'schedule' && finalDate) {
                        quiz.scheduledAt = new Date(finalDate);
                        quiz.expiresAt = new Date(new Date(finalDate).getTime() + 12 * 60 * 60 * 1000); // 12h window
                    } else {
                        quiz.scheduledAt = new Date();
                        quiz.expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h window
                    }
                    await quiz.save();
                }
            }
        }

        course.markModified('curriculumNodes');
        await course.save();

        let populatedNode = node;
        if (node.type === 'quiz') {
            const freshCourse = await Course.findById(course._id).populate('curriculumNodes.quizId');
            populatedNode = freshCourse.curriculumNodes.id(node._id);
        }

        res.json({ success: true, node: populatedNode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /course/:id/curriculum/node/:nodeId
router.delete('/course/:id/curriculum/node/:nodeId', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
        });
        if (!course) return res.status(403).json({ error: 'Access denied' });

        const node = course.curriculumNodes.id(req.params.nodeId);
        if (!node) return res.status(404).json({ error: 'Node not found' });

        let idsToDelete = [node._id];
        if (node.type === 'folder') {
            const recursiveIds = getRecursiveChildNodeIds(course.curriculumNodes, node._id.toString());
            idsToDelete = idsToDelete.concat(recursiveIds);
        }

        // Filter out nodes to delete
        course.curriculumNodes = course.curriculumNodes.filter(n => !idsToDelete.some(id => String(id) === String(n._id)));
        
        await course.save();
        res.json({ success: true, deletedCount: idsToDelete.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /course/:id/curriculum/nodes/batch-delete
router.post('/course/:id/curriculum/nodes/batch-delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { nodeIds } = req.body;
        if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty node IDs array' });
        }

        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
        });
        if (!course) return res.status(403).json({ error: 'Access denied' });

        // Collect all IDs to delete including recursive children for any folders in nodeIds
        const idsToDelete = new Set();
        nodeIds.forEach(id => {
            const node = course.curriculumNodes.id(id);
            if (node) {
                idsToDelete.add(String(node._id));
                if (node.type === 'folder') {
                    const recursiveIds = getRecursiveChildNodeIds(course.curriculumNodes, node._id.toString());
                    recursiveIds.forEach(cId => idsToDelete.add(String(cId)));
                }
            }
        });

        course.curriculumNodes = course.curriculumNodes.filter(n => !idsToDelete.has(String(n._id)));
        await course.save();
        res.json({ success: true, deletedCount: idsToDelete.size });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Edit Course Page
router.get('/course/:id/edit', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        const course = await Course.findOne({ _id: req.params.id })
        .populate('instructor', 'name email profileImage profilePicture bio role')
        .populate('permittedTeachers', 'name email profileImage profilePicture');
        
        if (!course) return res.status(404).send('Course not found');
        
        const CourseProgress = require('../models/CourseProgress');
        const Announcement = require('../models/Announcement');
        const progresses = await CourseProgress.find({ courseId: course._id }).populate('userId', 'name email profileImage profilePicture').lean();
        const announcements = await Announcement.find({ courseId: course._id }).populate('authorId', 'name').sort({ createdAt: -1 }).lean();
        
        const User = require('../models/User');
        const enrolledStudents = await User.find({ 'enrolledCourses.course': course._id }).select('name email profileImage profilePicture enrolledCourses quizResults').lean();
        const courseQuizIds = (course.curriculumNodes || []).filter(n => n.type === 'quiz' && n.quizId).map(n => String(n.quizId));
        const students = enrolledStudents.map(s => {
            const enrollment = s.enrolledCourses.find(ec => String(ec.course) === String(course._id));
            const examAttended = s.quizResults ? s.quizResults.filter(qr => courseQuizIds.includes(String(qr.quiz))).length : 0;
            return {
                name: s.name,
                email: s.email,
                profileImage: s.profileImage || s.profilePicture || '/images/default-avatar.png',
                enrolledAt: enrollment ? enrollment.enrolledAt : new Date(),
                progress: enrollment ? enrollment.progress || 0 : 0,
                examAttended
            };
        });
        
        students.forEach(s => {
            const cp = progresses.find(p => p.userId && p.userId.email === s.email);
            if (cp) {
                s.completedNodesCount = cp.completedNodes ? cp.completedNodes.length : 0;
                s.lastAccessed = cp.lastAccessed;
            } else {
                s.completedNodesCount = 0;
            }
        });

        const stats = {
            studentCount: students.length,
            examCount: course.curriculumNodes.filter(n => n.type === 'quiz').length
        };

        const hasEditAccess = course.instructor.equals(teacherId) || 
                              course.permittedTeachers.some(t => t._id.equals(teacherId)) || 
                              req.session.user.role === 'admin';

        res.render('teacher/edit-course', {
            progresses,
            announcements,
            students,
            stats,
            user: req.session.user,
            active: 'courses',
            course,
            hasEditAccess
        });
    } catch (err) {
        console.error('Edit Course GET Error:', err);
        res.status(500).send('Error loading edit page');
    }
});

router.post('/course/:id/edit', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.fields([{ name: 'routineImage', maxCount: 1 }])(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const { routine, chapters } = req.body;
        
        const teacherId = req.session.user._id;
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
        });
        
        if (!course) return res.status(403).send('এই কোর্সে আপনার অ্যাক্সেস নেই।');

        // Handle images
        if (req.files && req.files.routineImage) {
            const { processUploadedFile } = require('../services/cloudinaryService');
            course.routineImage = await processUploadedFile(req.files.routineImage[0], 'routines');
        }
        
        // Update allowed fields
        course.routine = Array.isArray(routine) ? routine.filter(r => r.day) : [];
        
        // Update chapters
        if (chapters) {
            const chapterList = Array.isArray(chapters) ? chapters : Object.values(chapters);
            course.chapters = chapterList.filter(c => c.title).map((c, idx) => {
                const existing = course.chapters[idx];
                return {
                    title: c.title,
                    permittedTeachers: existing ? existing.permittedTeachers : [],
                    recordedClasses: existing ? existing.recordedClasses : [],
                    liveClasses: existing ? existing.liveClasses : [],
                    notes: existing ? existing.notes : [],
                    quizzes: existing ? existing.quizzes : []
                };
            });
        }

        await course.save();
        
        // Log Activity
        await logActivity(req, 'UPDATE', `Updated course: ${course.title}`, 'course', course._id);

        res.redirect(`/teacher/course/${course._id}?success=Course updated successfully`);
    } catch (err) {
        console.error('Update Course Error:', err);
        res.status(500).send('Error updating course: ' + err.message);
    }
});

// Routine Management Page
router.post('/course/:id/course-routine', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.fields([{ name: 'routineImage', maxCount: 1 }])(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const { routine } = req.body;
        
        const teacherId = req.session.user._id;
        const course = await Course.findOne({
            _id: req.params.id,
            $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
        });
        
        if (!course) return res.status(403).send('এই কোর্সে আপনার অ্যাক্সেস নেই।');

        // Handle images
        if (req.files && req.files.routineImage) {
            course.routineImage = `/uploads/routines/${req.files.routineImage[0].filename}`;
        }
        
        // Update allowed fields
        let parsedRoutine = [];
        if (Array.isArray(routine)) {
            parsedRoutine = routine;
        } else if (routine && typeof routine === 'object') {
            parsedRoutine = Object.values(routine);
        }
        course.routine = parsedRoutine.filter(r => r.day);
        
        await course.save();
        
        // Log Activity
        await logActivity(req, 'UPDATE', `Updated routine for course: ${course.title}`, 'course', course._id);

        res.redirect(`/teacher/course/${course._id}?success=Routine updated successfully`);
    } catch (err) {
        console.error('Update Routine Error:', err);
        res.status(500).send('Error updating routine: ' + err.message);
    }
});

// Q&A Hub
router.get('/qa', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        // 1. Find all courses assigned to this teacher
        const myCourses = await Course.find({
            $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
        }).select('_id classLevel subject title');

        // Extract filters (Course schema defines classLevel and subject as Arrays of strings)
        const assignedClasses = [...new Set(myCourses.flatMap(c => c.classLevel || []))].filter(Boolean).sort();
        const assignedSubjects = [...new Set(myCourses.flatMap(c => c.subject || []))].filter(Boolean).sort();
        const assignedCourses = myCourses.map(c => ({ id: c._id.toString(), title: c.title }));

        // Get filter selections
        const selectedClass = req.query.class || 'all';
        const selectedSubject = req.query.subject || 'all';
        const selectedCourse = req.query.course || 'all';

        // Filter courses accordingly
        let filteredCourses = myCourses;
        if (selectedClass !== 'all') {
            filteredCourses = filteredCourses.filter(c => c.classLevel && c.classLevel.includes(selectedClass));
        }
        if (selectedSubject !== 'all') {
            filteredCourses = filteredCourses.filter(c => c.subject && c.subject.includes(selectedSubject));
        }
        if (selectedCourse !== 'all') {
            filteredCourses = filteredCourses.filter(c => c._id.toString() === selectedCourse);
        }
        const courseIds = filteredCourses.map(c => c._id);
        
        // 2. Build query for Q&A
        const qaQuery = { 
            status: 'open',
            course: { $in: courseIds }
        };

        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const totalQAs = await QA.countDocuments(qaQuery);
        const totalPages = Math.ceil(totalQAs / limit) || 1;

        const qas = await QA.find(qaQuery)
        .populate('askedBy')
        .populate('course')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        res.render('teacher/qa-hub', {
            qas,
            assignedClasses,
            assignedSubjects,
            assignedCourses,
            filters: {
                class: selectedClass,
                subject: selectedSubject,
                course: selectedCourse,
                page,
                totalPages,
                totalQAs
            },
            user: req.session.user,
            active: 'qa'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Q&A');
    }
});

// Answer a Q&A
router.post('/qa/:id/answer', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { answer } = req.body;
        const teacherId = req.session.user._id;

        const qa = await QA.findByIdAndUpdate(
            req.params.id,
            { 
                answer, 
                answeredBy: teacherId, 
                status: 'resolved' 
            },
            { new: true }
        );

        if (!qa) return res.status(404).send('Question not found');
        
        res.redirect('/teacher/qa?success=1');
    } catch (err) {
        console.error('Answer QA Error:', err);
        res.status(500).send('Failed to submit answer');
    }
});

// Profile Management
router.get('/profile', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.session.user._id);
        
        // Find assigned courses and group by class
        const assignedCourses = await Course.find({
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }]
        }).select('classLevel subject');
        
        const expertiseMap = {};
        assignedCourses.forEach(c => {
            if (!c.classLevel || !c.subject) return;
            if (!expertiseMap[c.classLevel]) expertiseMap[c.classLevel] = new Set();
            expertiseMap[c.classLevel].add(c.subject);
        });

        const expertise = Object.keys(expertiseMap).map(cls => ({
            classLevel: cls,
            subjects: [...expertiseMap[cls]].join(', ')
        }));

        res.render('teacher/profile', {
            user,
            expertise,
            active: 'profile'
        });
    } catch (err) {
        res.status(500).send('Error loading profile');
    }
});

// Profile Update Action
router.post('/profile/update', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { 
            name, designation, experience, education, bio, 
            achievements, presentAddress, permanentAddress, 
            schoolName, collegeName, universityName, 
            sscGpa, hscGpa, cgpa
        } = req.body;
        
        const user = await User.findById(req.session.user._id);

        user.name = name;
        user.designation = designation;
        user.experience = experience;
        user.education = education;
        user.bio = bio;
        user.achievements = achievements;
        user.presentAddress = presentAddress;
        user.permanentAddress = permanentAddress;
        user.schoolName = schoolName;
        user.collegeName = collegeName;
        user.universityName = universityName;
        user.sscGpa = sscGpa;
        user.hscGpa = hscGpa;
        user.cgpa = cgpa;
        user.socialLinks.facebook = req.body['socialLinks[facebook]'];
        user.socialLinks.linkedin = req.body['socialLinks[linkedin]'];

        await user.save();

        // Update session
        req.session.user.name = name;
        res.redirect('/teacher/profile?success=profile_updated');
    } catch (err) {
        console.error(err);
        res.status(500).send('Profile update failed');
    }
});

// Change Password Action
router.post('/profile/change-password', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { oldPassword, newPassword, confirmPassword } = req.body;
        
        const user = await User.findById(req.session.user._id);

        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) return res.redirect('/teacher/profile?error=invalid_current_password');
        if (newPassword !== confirmPassword) return res.redirect('/teacher/profile?error=password_mismatch');
        if (newPassword.length < 6) return res.redirect('/teacher/profile?error=password_too_short');

        user.password = newPassword; // Pre-save hook will hash it
        await user.save();

        res.redirect('/teacher/profile?success=password_updated');
    } catch (err) {
        console.error(err);
        res.status(500).send('Password update failed');
    }
});

// --- Curriculum Management Actions ---

// Add Chapter
router.post('/course/:id/chapter/add', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { title } = req.body;
        const teacherId = req.session.user._id;

        const course = await Course.findOneAndUpdate(
            { _id: req.params.id, $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }] },
            { $push: { chapters: { title, recordedClasses: [], liveClasses: [], notes: [], quizzes: [] } } },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content`);
    } catch (err) {
        res.status(500).send('Failed to add chapter');
    }
});

// Delete Chapter
router.post('/course/:id/chapter/:chid/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        const course = await Course.findOneAndUpdate(
            { _id: req.params.id, $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }] },
            { $pull: { chapters: { _id: req.params.chid } } },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content`);
    } catch (err) {
        res.status(500).send('Failed to delete chapter');
    }
});

// Add Recorded Class (Video)
router.post('/course/:id/chapter/:chid/video/add', teacherProtect, (req, res, next) => router.upload.single('video')(req, res, next), async (req, res) => {
    try {
        await connectDB();
        const { title, description, accessType } = req.body;
        const teacherId = req.session.user._id;

        const { processUploadedFile } = require('../services/cloudinaryService');
        const videoPath = req.file ? await processUploadedFile(req.file, 'videos') : '';

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $push: { 
                    'chapters.$.recordedClasses': { 
                        title, 
                        description, 
                        videoPath, 
                        accessType: accessType || 'paid',
                        instructor: req.session.user.name 
                    } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content:chapter-${req.body.chapterIndex || 0}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to add video');
    }
});

// Add Note (PDF)
router.post('/course/:id/chapter/:chid/note/add', teacherProtect, (req, res, next) => router.upload.single('note')(req, res, next), async (req, res) => {
    try {
        await connectDB();
        const { title } = req.body;
        const teacherId = req.session.user._id;
        const { processUploadedFile } = require('../services/cloudinaryService');
        const filePath = req.file ? await processUploadedFile(req.file, 'notes') : '';

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $push: { 
                    'chapters.$.notes': { title, filePath } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content:chapter-${req.body.chapterIndex || 0}`);
    } catch (err) {
        res.status(500).send('Failed to add note');
    }
});

// Delete Video
router.post('/course/:id/chapter/:chid/video/:vid/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $pull: { 
                    'chapters.$.recordedClasses': { _id: req.params.vid } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content`);
    } catch (err) {
        res.status(500).send('Failed to delete video');
    }
});

// Delete Note
router.post('/course/:id/chapter/:chid/note/:nid/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $pull: { 
                    'chapters.$.notes': { _id: req.params.nid } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content`);
    } catch (err) {
        res.status(500).send('Failed to delete note');
    }
});

// Add Live Class
router.post('/course/:id/chapter/:chid/live/add', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { title, date } = req.body;
        const teacherId = req.session.user._id;
        
        const meetingUrl = `oddhay-live-${req.params.id}-${Date.now()}`;

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $push: { 
                    'chapters.$.liveClasses': { title, meetingUrl, date: new Date(date) } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content:chapter-${req.body.chapterIndex || 0}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to add live class');
    }
});

// Delete Live Class
router.post('/course/:id/chapter/:chid/live/:lid/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const teacherId = req.session.user._id;

        const course = await Course.findOneAndUpdate(
            { 
                _id: req.params.id, 
                $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }],
                'chapters._id': req.params.chid 
            },
            { 
                $pull: { 
                    'chapters.$.liveClasses': { _id: req.params.lid } 
                } 
            },
            { new: true }
        );

        if (!course) return res.status(403).send('Access Denied');
        res.redirect(`/teacher/course/${req.params.id}#content`);
    } catch (err) {
        res.status(500).send('Failed to delete live class');
    }
});

// ========== NOTES MANAGEMENT ==========
router.get('/notes', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;

        const subjectFilter = req.query.subject || 'all';
        const classFilter = req.query.class || 'all';
        const accessFilter = req.query.access || 'all';
        const courseLinkFilter = req.query.courseLink || 'all';
        const search = req.query.q || '';
        const authorFilter = req.query.author || '';

        // 1. Get user courses where teacher is instructor or permitted, or matching subjects/classes or specified courseLink
        // 1. Get user profile assigned subjects & classes (set by authority/admin)
        const teacherProfile = await User.findById(user._id).select('teachingSubject teachingSubjects classLevel assignedClasses').lean();
        
        const rawUserSubjects = [
            teacherProfile?.teachingSubject,
            ...(Array.isArray(teacherProfile?.teachingSubjects) ? teacherProfile.teachingSubjects : [])
        ].filter(Boolean);

        const rawUserClasses = [
            teacherProfile?.classLevel,
            ...(Array.isArray(teacherProfile?.assignedClasses) ? teacherProfile.assignedClasses : [])
        ].filter(Boolean);

        // Find courses explicitly assigned to THIS teacher by authority (instructor or permitted)
        const teacherAssignedCourses = await Course.find({
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }]
        }).select('subject classLevel').lean();

        const teacherAssignedCourseSubjects = teacherAssignedCourses.flatMap(c => Array.isArray(c.subject) ? c.subject : [c.subject]).filter(Boolean);
        const teacherAssignedCourseClasses = teacherAssignedCourses.flatMap(c => Array.isArray(c.classLevel) ? c.classLevel : [c.classLevel]).filter(Boolean);

        // Strictly assigned subjects & classes for THIS specific teacher
        const assignedSubjects = [...new Set([...rawUserSubjects, ...teacherAssignedCourseSubjects])].filter(Boolean).sort();
        const assignedClasses = [...new Set([...rawUserClasses, ...teacherAssignedCourseClasses])].filter(Boolean).sort();

        const userCourses = await Course.find({})
            .select('title _id accessType subject classLevel curriculumNodes chapters thumbnail instructor permittedTeachers')
            .populate('instructor', 'name')
            .lean();

        const assignedCourseIds = userCourses.map(c => c._id);

        // Standard default fallback classes if none assigned yet
        const defaultClasses = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'HSC 1st Year', 'HSC 2nd Year', 'Admission'];
        const allClasses = assignedClasses.length > 0 ? assignedClasses : defaultClasses;

        // 3. Build query for Note model
        let query = {
            $or: [
                { addedBy: user._id },
                { course: { $in: assignedCourseIds } }
            ]
        };

        if (subjectFilter !== 'all') query.subject = subjectFilter;
        if (classFilter !== 'all') query.classLevel = classFilter;
        if (accessFilter !== 'all') query.accessType = accessFilter;
        if (courseLinkFilter === 'global') {
            query.course = null;
        } else if (courseLinkFilter !== 'all' && mongoose.Types.ObjectId.isValid(courseLinkFilter)) {
            query.course = new mongoose.Types.ObjectId(courseLinkFilter);
        }
        if (search) query.title = { $regex: search, $options: 'i' };

        let [dbNotes, stats] = await Promise.all([
            Note.find(query).populate('addedBy', 'name profilePicture profileImage').populate('course', 'title _id').sort({ createdAt: -1 }).lean(),
            Note.aggregate([
                { $match: { $or: [{ addedBy: new mongoose.Types.ObjectId(String(user._id)) }, { course: { $in: assignedCourseIds } }] } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        paidCount: { $sum: { $cond: [{ $eq: ['$accessType', 'Paid'] }, 1, 0] } },
                        freeCount: { $sum: { $cond: [{ $eq: ['$accessType', 'Free'] }, 1, 0] } },
                        globalCount: { $sum: { $cond: [{ $not: ["$course"] }, 1, 0] } },
                        courseCount: { $sum: { $cond: ["$course", 1, 0] } },
                        subjects: { $addToSet: '$subject' },
                        classes: { $addToSet: '$classLevel' }
                    }
                }
            ]).then(res => res[0] || {})
        ]);

        // Map parentFolderId for dbNotes if linked to a course chapter/folder
        dbNotes.forEach(note => {
            if (note.course && note.chapter) {
                const cIdStr = (note.course._id || note.course).toString();
                const matchingCourse = userCourses.find(c => c._id.toString() === cIdStr);
                if (matchingCourse && matchingCourse.curriculumNodes) {
                    const folderNode = matchingCourse.curriculumNodes.find(n => n.type === 'folder' && n.name.trim().toLowerCase() === note.chapter.trim().toLowerCase());
                    if (folderNode) {
                        note.parentFolderId = folderNode._id.toString();
                    }
                }
            }
        });

        const allSubjects = [...new Set([...assignedSubjects, ...(stats.subjects || [])])].filter(Boolean).sort();

        // 4. Extract course notes from userCourses.curriculumNodes to merge
        const existingNoteIds = new Set(dbNotes.map(n => n._id.toString()));
        const courseNotesExtracted = [];

        userCourses.forEach(c => {
            if (courseLinkFilter !== 'all' && courseLinkFilter !== 'global' && c._id.toString() !== courseLinkFilter) {
                return;
            }
            const courseSubject = Array.isArray(c.subject) ? c.subject[0] : (c.subject || 'General Academic');
            const courseClass = Array.isArray(c.classLevel) ? c.classLevel[0] : (c.classLevel || 'General');

            if (subjectFilter !== 'all' && courseSubject !== subjectFilter) return;

            const nodes = c.curriculumNodes || [];
            const folderMap = {};
            nodes.filter(n => n.type === 'folder').forEach(f => {
                folderMap[f._id.toString()] = f;
            });

            nodes.filter(n => (n.type === 'note' || n.filePath || n.fileUrl)).forEach(cn => {
                const cnIdStr = cn._id.toString();
                if (!existingNoteIds.has(cnIdStr)) {
                    const parentFolder = cn.parentId && folderMap[cn.parentId.toString()] ? folderMap[cn.parentId.toString()] : null;
                    const chapterName = parentFolder ? parentFolder.name : 'General Notes';
                    const fileUrl = cn.filePath || cn.fileUrl || '#';

                    if (search && !(cn.name || '').toLowerCase().includes(search.toLowerCase())) return;

                    courseNotesExtracted.push({
                        _id: cn._id,
                        title: cn.name || 'Course Note',
                        subject: courseSubject,
                        classLevel: courseClass,
                        fileUrl: fileUrl,
                        filePath: fileUrl,
                        accessType: c.accessType === 'free' ? 'Free' : 'Paid',
                        isCourseNote: true,
                        course: { _id: c._id, title: c.title },
                        parentFolderId: cn.parentId ? cn.parentId.toString() : '',
                        chapter: chapterName,
                        addedBy: { name: c.instructor?.name || user.name },
                        createdAt: c.createdAt || new Date()
                    });
                }
            });
        });

        // Combine DB notes and extracted course notes
        const notes = [...dbNotes, ...courseNotesExtracted];
        const totalCount = notes.length;

        // 5. Build courseFolders and courseCurriculums
        const courseFolders = [];
        const courseCurriculums = {};

        userCourses.forEach(c => {
            const courseSubject = Array.isArray(c.subject) ? c.subject[0] : (c.subject || 'General Academic');
            const nodes = c.curriculumNodes || [];
            const folderList = [];
            const folderIdSet = new Set();

            // A. Extract folders from curriculumNodes (supporting all folder/chapter/section/unit types)
            if (nodes.length > 0) {
                nodes.forEach((n, idx) => {
                    const isFolderType = n.type === 'folder' || n.type === 'chapter' || n.type === 'section' || n.type === 'unit';
                    const isPayloadNode = n.type === 'note' || n.type === 'video' || n.type === 'quiz' || n.type === 'liveClass' || n.filePath || n.fileUrl || n.videoPath || n.meetingUrl || n.quizId;
                    
                    if (isFolderType || (!isPayloadNode && n.name)) {
                        const fId = n._id ? n._id.toString() : ('f-' + idx);
                        folderIdSet.add(fId);
                        folderList.push({
                            _id: fId,
                            name: n.name || ('Folder ' + (idx + 1)),
                            parentId: n.parentId ? n.parentId.toString() : null,
                            order: typeof n.order === 'number' ? n.order : idx
                        });
                    }
                });
            }

            // B. Extract folders from legacy chapters array if present
            if (c.chapters && c.chapters.length > 0) {
                c.chapters.forEach((ch, idx) => {
                    const chId = ch._id ? ch._id.toString() : ('ch-' + idx);
                    const chTitle = ch.title || ch.name || ('Chapter ' + (idx + 1));
                    if (!folderIdSet.has(chId) && !folderList.some(f => f.name.trim().toLowerCase() === chTitle.trim().toLowerCase())) {
                        folderList.push({
                            _id: chId,
                            name: chTitle,
                            parentId: null,
                            order: idx
                        });
                    }
                });
            }

            // C. Extract implicit chapter folders from notes belonging to this course (e.g. chapter: "Bangla")
            const courseNotes = notes.filter(n => n.course && (n.course._id || n.course).toString() === c._id.toString());
            courseNotes.forEach(n => {
                if (n.chapter && n.chapter !== 'General Notes' && n.chapter !== 'General Course Notes' && n.chapter.trim() !== '') {
                    const chapName = n.chapter.trim();
                    if (!folderList.some(f => f.name.trim().toLowerCase() === chapName.toLowerCase())) {
                        folderList.push({
                            _id: 'imp-' + (n._id ? n._id.toString() : Math.random().toString(36).substr(2, 9)),
                            name: chapName,
                            parentId: null,
                            order: folderList.length
                        });
                    }
                }
            });

            const totalCourseNotesCount = courseNotes.length;

            courseCurriculums[c._id.toString()] = folderList;
            courseFolders.push({
                _id: c._id,
                title: c.title,
                subject: courseSubject,
                accessType: c.accessType,
                isFreeCourse: c.accessType === 'free',
                isEnrolled: true,
                noteCount: totalCourseNotesCount || folderList.length,
                thumbnail: c.thumbnail,
                author: c.instructor?.name || user.name
            });
        });

        const dbCustomFolders = await Folder.find({
            $or: [
                { addedBy: user._id },
                { subject: { $in: assignedSubjects } }
            ]
        }).lean();

        res.render('teacher/notes', {
            notes,
            user,
            courseFolders,
            courseCurriculums,
            customFolders: dbCustomFolders,
            activeClass: classFilter || 'all',
            activeSubject: subjectFilter || 'all',
            activeCourseId: courseLinkFilter !== 'all' && courseLinkFilter !== 'global' ? courseLinkFilter : null,
            stats: {
                totalNotes: totalCount,
                paidNotesCount: stats.paidCount || notes.filter(n => n.accessType === 'Paid').length,
                freeNotesCount: stats.freeCount || notes.filter(n => n.accessType === 'Free').length,
                globalCount: stats.globalCount || notes.filter(n => !n.course).length,
                courseCount: stats.courseCount || notes.filter(n => Boolean(n.course)).length
            },
            filters: {
                page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                q: search,
                subject: subjectFilter,
                class: classFilter,
                access: accessFilter,
                courseLink: courseLinkFilter,
                author: authorFilter,
                totalNotes: totalCount
            },
            subjects: assignedSubjects.length > 0 ? assignedSubjects : (rawUserSubjects.length > 0 ? rawUserSubjects : ['General Academic']),
            classes: allClasses,
            assignedCourses: userCourses,
            userCourses: userCourses,
            active: 'notes'
        });
    } catch (err) {
        console.error('Notes Route Error:', err);
        res.status(500).send('Error loading notes');
    }
});

// POST /teacher/add-folder: Create new folder/subfolder for subject workspace
router.post('/add-folder', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { name, subject, classLevel, parentId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Folder name is required' });
        }

        let folderSubject = (subject && subject !== 'all' && subject.trim() !== '' ? subject : '').trim();
        if (!folderSubject) {
            const userDoc = await User.findById(req.session.user._id);
            folderSubject = userDoc?.teachingSubject || (userDoc?.teachingSubjects && userDoc.teachingSubjects[0]) || 'General Academic';
        }

        const newFolder = new Folder({
            name: name.trim(),
            subject: folderSubject,
            classLevel: classLevel || 'General',
            parentId: parentId && parentId !== 'null' && parentId !== '' ? parentId : null,
            addedBy: req.session.user._id
        });

        await newFolder.save();
        
        await logActivity(req, 'CREATE', `Created folder: ${newFolder.name} in subject ${newFolder.subject}`, 'folder', newFolder._id);

        return res.json({ success: true, folder: newFolder });
    } catch (err) {
        console.error('Add Folder Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// POST /teacher/folder/:id/delete: Delete custom folder and cleanup
router.post('/folder/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const folderId = req.params.id;
        const folder = await Folder.findById(folderId);
        if (!folder) {
            return res.status(404).json({ success: false, error: 'Folder not found' });
        }
        if (folder.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Permission denied' });
        }
        await Folder.findByIdAndDelete(folderId);
        await Folder.deleteMany({ parentId: folderId });
        await Note.updateMany({ parentFolderId: folderId }, { $set: { parentFolderId: null } });

        await logActivity(req, 'DELETE', `Deleted folder: ${folder.name}`, 'folder', folder._id);
        return res.json({ success: true });
    } catch (err) {
        console.error('Delete Folder Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/add-note', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.single('note')(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const { title, subject, classLevel, chapter, parentFolderId, description, accessType, course } = req.body;
        const { processUploadedFile } = require('../services/cloudinaryService');
        const fileUrl = req.file ? await processUploadedFile(req.file, 'notes') : null;
        
        const noteCourseId = course && mongoose.Types.ObjectId.isValid(course) ? course : undefined;

        const parsedClasses = Array.isArray(classLevel) ? classLevel : (classLevel ? [classLevel] : []);

        const newNote = await new Note({
            title,
            subject: subject || 'General Academic',
            classLevel: parsedClasses.length > 0 ? parsedClasses : ['Class 10'],
            chapter: chapter || '',
            parentFolderId: parentFolderId && parentFolderId !== 'null' && parentFolderId !== '' ? parentFolderId : null,
            description: description || '',
            accessType: accessType || 'Free',
            fileUrl,
            course: noteCourseId,
            addedBy: req.session.user._id
        }).save();

        // If linked to a course, sync with course curriculumNodes
        if (noteCourseId) {
            const courseDoc = await Course.findById(noteCourseId);
            if (courseDoc) {
                let parentFolderId = null;
                const trimmedChapter = (chapter || '').trim();
                
                if (trimmedChapter) {
                    let folderNode = (courseDoc.curriculumNodes || []).find(n => n.type === 'folder' && n.name.trim().toLowerCase() === trimmedChapter.toLowerCase());
                    if (!folderNode) {
                        folderNode = {
                            _id: new mongoose.Types.ObjectId(),
                            name: trimmedChapter,
                            type: 'folder',
                            parentId: null,
                            order: (courseDoc.curriculumNodes || []).length
                        };
                        if (!courseDoc.curriculumNodes) courseDoc.curriculumNodes = [];
                        courseDoc.curriculumNodes.push(folderNode);
                    }
                    parentFolderId = folderNode._id.toString();
                }

                if (!courseDoc.curriculumNodes) courseDoc.curriculumNodes = [];
                courseDoc.curriculumNodes.push({
                    _id: newNote._id,
                    name: title,
                    type: 'note',
                    parentId: parentFolderId,
                    filePath: fileUrl,
                    addedBy: req.session.user._id,
                    order: courseDoc.curriculumNodes.length
                });

                await courseDoc.save();
            }
        }

        let redirectUrl = '/teacher/notes';
        if (subject && subject !== 'all') {
            redirectUrl += '?subject=' + encodeURIComponent(subject);
        }
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('Add Note Error:', err);
        res.status(500).send('Error adding note: ' + err.message);
    }
});

router.post('/note/:id/edit', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const note = await Note.findById(req.params.id);
        if (!note) return res.status(404).send('Note not found');
        if (note.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Not authorized to edit this note');
        }
        const { title, subject, classLevel, chapter, description, accessType, course } = req.body;
        note.title = title || note.title;
        note.subject = subject || note.subject;
        note.classLevel = classLevel || note.classLevel;
        note.chapter = chapter || '';
        note.description = description || '';
        note.accessType = accessType || note.accessType;
        note.course = course && mongoose.Types.ObjectId.isValid(course) ? course : note.course;
        note.updatedAt = new Date();
        await note.save();
        res.redirect(`/teacher/note-details/${note._id}?success=Note updated`);
    } catch (err) {
        console.error('Edit Note Error:', err);
        res.status(500).send('Error editing note: ' + err.message);
    }
});

router.get('/note-details/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const note = await Note.findById(req.params.id)
            .populate('addedBy', 'name profilePicture profileImage email')
            .populate('course', 'title _id');
        if (!note) return res.status(404).send('Note not found');
        
        const userCourses = await Course.find({ $or: [{ instructor: user._id }, { permittedTeachers: user._id }] }).select('title _id accessType subject classLevel');
        
        res.render('teacher/note-details', { note, user, userCourses, assignedCourses: userCourses, active: 'notes' });
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

router.get('/note/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const note = await Note.findById(req.params.id);
        if (!note) return res.status(404).send('Note not found');
        if (note.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }
        await Note.findByIdAndDelete(req.params.id);
        res.redirect('/teacher/notes?success=Note deleted');
    } catch (err) { res.status(500).send('Error deleting note'); }
});

router.post('/notes/bulk-action', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { action, itemIds = [], folderIds = [] } = req.body;
        if ((!itemIds || !itemIds.length) && (!folderIds || !folderIds.length)) {
            return res.status(400).json({ success: false, error: 'No items selected' });
        }
        if (action === 'delete') {
            if (itemIds && itemIds.length > 0) {
                await Note.deleteMany({ _id: { $in: itemIds }, addedBy: req.session.user._id });
            }
            if (folderIds && folderIds.length > 0) {
                await Folder.deleteMany({ _id: { $in: folderIds }, addedBy: req.session.user._id });
            }
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ========== QUESTION BANK MANAGEMENT ==========
router.get('/question-bank', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const subjectFilter = req.query.subject || 'all';
        const classFilter = req.query.class || 'all';
        const boardFilter = req.query.board || 'all';
        const statusFilter = req.query.status || 'all';
        const yearFilter = req.query.year || 'all';
        const courseLinkFilter = req.query.courseLink || 'all';
        const search = req.query.q || '';

        let query = { addedBy: user._id };
        if (subjectFilter !== 'all') query.subject = subjectFilter;
        if (classFilter !== 'all') query.classLevel = { $in: [classFilter] };
        if (boardFilter !== 'all') query.board = boardFilter;
        if (yearFilter !== 'all') query.year = yearFilter;
        if (statusFilter === 'pending') {
            query.status = 'pending';
        } else if (statusFilter === 'approved') {
            query.$or = [{ status: 'approved' }, { status: { $exists: false } }];
        } else if (statusFilter === 'rejected') {
            query.status = 'rejected';
        }
        
        if (courseLinkFilter === 'global') {
            query.course = { $exists: false };
        } else if (courseLinkFilter !== 'all') {
            query.course = courseLinkFilter;
        }
        
        if (search) query.$or = [
            { board: { $regex: search, $options: 'i' } },
            { subject: { $regex: search, $options: 'i' } }
        ];

        const teacherObjId = new mongoose.Types.ObjectId(String(user._id));

        const [banks, totalCount, stats, userCourses, pendingCount, approvedCount, rejectedCount, dynamicYears] = await Promise.all([
            QuestionBank.find(query).populate('addedBy', 'name profilePicture profileImage').populate('course', 'title _id').sort({ createdAt: -1 }).skip(skip).limit(limit),
            QuestionBank.countDocuments(query),
            QuestionBank.aggregate([
                { $match: { addedBy: teacherObjId } },
                {
                    $group: {
                        _id: null,
                        totalBanks: { $sum: 1 },
                        paidCount: { $sum: { $cond: [{ $eq: ['$accessType', 'Paid'] }, 1, 0] } },
                        freeCount: { $sum: { $cond: [{ $eq: ['$accessType', 'Free'] }, 1, 0] } },
                        globalCount: { $sum: { $cond: [{ $not: ["$course"] }, 1, 0] } },
                        courseCount: { $sum: { $cond: ["$course", 1, 0] } },
                        subjects: { $addToSet: '$subject' },
                        classes: { $addToSet: '$classLevel' },
                        boards: { $addToSet: '$board' }
                    }
                }
            ]).then(res => res[0] || {}),
            Course.find({ $or: [{ instructor: user._id }, { permittedTeachers: user._id }] }).select('title _id accessType subject classLevel'),
            QuestionBank.countDocuments({ addedBy: user._id, status: 'pending' }),
            QuestionBank.countDocuments({ addedBy: user._id, $or: [{ status: 'approved' }, { status: { $exists: false } }] }),
            QuestionBank.countDocuments({ addedBy: user._id, status: 'rejected' }),
            QuestionBank.distinct('year', { addedBy: user._id })
        ]);

        // Only show classes/subjects from teacher's assigned courses
        const allSubjects = [...new Set(userCourses.flatMap(c => c.subject || []))].filter(Boolean).sort();
        const allClasses = [...new Set(userCourses.flatMap(c => c.classLevel || []))].filter(Boolean).sort();
        const yearList = Array.from(new Set((dynamicYears || []).map(y => String(y || '').trim()).filter(Boolean))).sort().reverse();

        // Calculate actual question counts from Question collection
        const bankIds = banks.map(b => b._id);
        const questionCounts = await Question.aggregate([
            { $match: { bankId: { $in: bankIds } } },
            { $group: { _id: '$bankId', count: { $sum: 1 } } }
        ]);

        const countMap = {};
        questionCounts.forEach(qc => {
            if (qc._id) countMap[qc._id.toString()] = qc.count;
        });

        const banksWithActualCounts = banks.map(b => {
            const bObj = b.toObject ? b.toObject() : { ...b };
            bObj.questionCount = countMap[b._id.toString()] !== undefined ? countMap[b._id.toString()] : (bObj.questionCount || 0);
            return bObj;
        });

        res.render('teacher/question-bank', {
            questions: banksWithActualCounts,
            user,
            stats: {
                totalBanks: totalCount,
                paidCount: stats.paidCount || 0,
                freeCount: stats.freeCount || 0,
                globalCount: stats.globalCount || 0,
                courseCount: stats.courseCount || 0,
                pendingCount,
                approvedCount,
                rejectedCount
            },
            filters: {
                page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                totalCount,
                q: search,
                subject: subjectFilter,
                class: classFilter,
                board: boardFilter,
                year: yearFilter,
                status: statusFilter,
                courseLink: courseLinkFilter
            },
            subjects: allSubjects,
            classes: allClasses,
            boards: (stats.boards || []).filter(Boolean).sort(),
            years: yearList.length > 0 ? yearList : ['2026', '2025', '2024', '2023', '2022', '2021', '2020'],
            assignedCourses: userCourses,
            userCourses: userCourses,
            active: 'questions'
        });
    } catch (err) {
        console.error('Question Bank Route Error:', err);
        res.status(500).send('Error loading question bank');
    }
});

router.get('/question-bank/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.id).populate('addedBy', 'name profilePicture profileImage');
        if (!bank) return res.status(404).send('Question Bank not found');

        const questions = await Question.find({ bankId: bank._id }).sort({ createdAt: -1 });

        // Calculate actual question type stats
        const stats = {
            total: questions.length,
            MCQ: questions.filter(q => q.questionType === 'MCQ').length,
            Short: questions.filter(q => q.questionType === 'Short').length,
            Medium: questions.filter(q => q.questionType === 'Medium').length,
            Comprehension: questions.filter(q => q.questionType === 'Comprehension').length
        };

        // Count real student buyers (for Paid banks) from Payment model
        const Payment = require('../models/Payment');
        let buyerCount = 0;
        if (bank.accessType === 'Paid') {
            // Count payments linked to courses that use this bank (approximate)
            buyerCount = await Payment.countDocuments({
                status: { $in: ['success', 'approved'] },
                course: bank.course
            }).catch(() => 0);
        }

        // Real engagement from stored DB fields
        const totalViews = bank.views || 0;
        const examTakers = bank.examTakers || 0;

        // Avg study duration: recorded minutes if available, else estimate from question count
        const avgStudyDuration = examTakers > 0
            ? Math.round((bank.totalStudyMinutes || 0) / examTakers)
            : Math.min(Math.round(stats.total * 0.8) + 5, 60);

        // Popularity: based on real views + buyers/takers relative to question density
        const engagementSignal = totalViews + (buyerCount * 5) + (examTakers * 3);
        const rawPopularity = stats.total > 0
            ? Math.min(Math.round((engagementSignal / Math.max(stats.total, 1)) * 3), 100)
            : 0;
        const popularityScore = Math.max(rawPopularity, totalViews > 0 ? 5 : 0);

        const engagement = {
            activeTakers: examTakers,
            maxTakers: Math.max(examTakers, 100),
            studyDuration: avgStudyDuration,
            maxDuration: 60,
            popularityScore,
            views: totalViews,
            buyers: buyerCount
        };

        const qPagination = {
            page: 1,
            totalPages: 1
        };

        res.render('teacher/question-bank-details', {
            bank,
            questions,
            stats,
            engagement,
            qPagination,
            user: req.session.user,
            active: 'questions'
        });
    } catch (err) {
        console.error('Question Bank Details Error:', err);
        res.status(500).send('Error loading bank details');
    }
});

// GET: Launch Exam from a Question Bank — redirects to make-quiz with bank pre-selected
router.get('/deploy-bank-to-quiz/:bankId', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.bankId);
        if (!bank) return res.status(404).send('Question Bank not found');
        const subjectParam = Array.isArray(bank.subject) ? bank.subject[0] : (bank.subject || '');
        const classParam = Array.isArray(bank.classLevel) ? bank.classLevel[0] : (bank.classLevel || '');
        // Redirect to make-quiz with pre-filled filters from this bank
        res.redirect(`/teacher/make-quiz?bankId=${bank._id}&subject=${encodeURIComponent(subjectParam)}&classLevel=${encodeURIComponent(classParam)}&prefilledTitle=${encodeURIComponent((bank.title || bank.subject || '') + ' Exam')}`);
    } catch (err) {
        console.error('Deploy Bank to Quiz Error:', err);
        res.redirect('/teacher/make-quiz');
    }
});


router.get('/quizzes', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        let query = { addedBy: user._id };
        
        const userCourses = await Course.find({ 
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }] 
        }).select('title _id accessType subject classLevel');
        
        const assignedSubjects = [...new Set(userCourses.map(c => c.subject).filter(Boolean))];
        const assignedClasses = [...new Set(userCourses.map(c => c.classLevel).filter(Boolean))];
        
        const { subject, classLevel, type, q } = req.query;
        
        let courseQuery = { $or: [{ instructor: user._id }, { permittedTeachers: user._id }] };
        if (subject && subject !== 'all') courseQuery.subject = subject;
        if (classLevel && classLevel !== 'all') courseQuery.classLevel = classLevel;
        
        const courses = await Course.find(courseQuery).select('_id');
        const courseIds = courses.map(c => c._id);
        
        if ((subject && subject !== 'all') || (classLevel && classLevel !== 'all')) {
            query.course = { $in: courseIds };
        }
        
        if (type === 'model') {
            query.course = null;
        } else if (type === 'course') {
            query.course = { $ne: null };
        }
        
        if (q) {
            query.title = { $regex: q, $options: 'i' };
        }
        
        const [quizzes, totalCount] = await Promise.all([
            Quiz.find(query).populate('course').sort({ createdAt: -1 }).skip(skip).limit(limit),
            Quiz.countDocuments(query)
        ]);
        
        const modelTestCount = await Quiz.countDocuments({ ...query, course: null });
        const courseExamCount = await Quiz.countDocuments({ ...query, course: { $ne: null } });
        
        const questionStats = await Quiz.aggregate([
            { $match: query },
            { $unwind: '$questions' },
            { $count: 'total' }
        ]);
        const totalQuestions = questionStats.length > 0 ? questionStats[0].total : 0;
        
        const stats = {
            modelTestCount,
            courseExamCount,
            totalQuestions
        };
        
        res.render('teacher/quizzes', {
            quizzes,
            user,
            filters: {
                page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                totalQuizzes: totalCount,
                subject,
                classLevel,
                type,
                q
            },
            subjects: assignedSubjects,
            classes: assignedClasses,
            stats,
            active: 'quizzes'
        });
    } catch (err) {
        console.error('Teacher Quizzes Error:', err);
        res.status(500).send('Error loading quizzes');
    }
});

router.get('/make-quiz', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        
        const userCourses = await Course.find({ 
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }] 
        }).select('title _id subject classLevel accessType');
        
        const subjects = [...new Set(userCourses.flatMap(c => c.subject || []))].filter(Boolean);
        const classes = [...new Set(userCourses.flatMap(c => c.classLevel || []))].filter(Boolean);
        
        const questionBanks = await QuestionBank.find({ addedBy: user._id }).select('subject classLevel board year _id');
        
        const { courseId, subject, classLevel } = req.query;
        
        res.render('teacher/make-quiz', {
            courses: userCourses,
            subjects: subjects,
            classes: classes,
            questionBanks: questionBanks,
            user: req.session.user,
            active: 'quizzes',
            selectedCourseId: courseId || '',
            selectedSubject: subject || '',
            selectedClassLevel: classLevel || '',
            prefilledTitle: ''
        });
    } catch (err) {
        console.error('Make Quiz Route Error:', err);
        res.redirect('/teacher/quizzes');
    }
});

router.get('/course/:id/edit/make-quiz', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const courseId = req.params.id;
        
        const currentCourse = await Course.findOne({
            _id: courseId,
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }]
        });
        
        if (!currentCourse) return res.status(403).send('Access Denied');
        
        const userCourses = await Course.find({ 
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }] 
        }).select('title _id subject classLevel accessType');
        
        const subjects = [...new Set(userCourses.flatMap(c => c.subject || []))].filter(Boolean);
        const classes = [...new Set(userCourses.flatMap(c => c.classLevel || []))].filter(Boolean);
        
        const questionBanks = await QuestionBank.find({ addedBy: user._id }).select('subject classLevel board year _id');
        
        const subject = Array.isArray(currentCourse.subject) ? currentCourse.subject[0] : currentCourse.subject;
        const classLevel = Array.isArray(currentCourse.classLevel) ? currentCourse.classLevel[0] : currentCourse.classLevel;
        
        res.render('teacher/make-quiz', {
            courses: userCourses,
            subjects: subjects,
            classes: classes,
            questionBanks: questionBanks,
            user: req.session.user,
            active: 'courses',
            selectedCourseId: courseId || '',
            selectedSubject: subject || '',
            selectedClassLevel: classLevel || '',
            prefilledTitle: req.query.title || ''
        });
    } catch (err) {
        console.error('Course Make Quiz Route Error:', err);
        res.redirect(`/teacher/course/${req.params.id}`);
    }
});

router.get('/api/bank-metadata', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { classLevel, subject, topic, board, year } = req.query;
        
        // Base query always filters by teacher and class/subject
        let baseQuery = { addedBy: req.session.user._id };
        if (classLevel) baseQuery.classLevel = classLevel;
        if (subject) baseQuery.subject = subject;
        
        // Get all banks for base query to compute available topics
        const allBanks = await QuestionBank.find(baseQuery);
        const topics = [...new Set(allBanks.map(b => b.topic).filter(Boolean))].sort();
        
        // Apply topic filter for board/year computation (cascading)
        let filteredQuery = { ...baseQuery };
        if (topic) filteredQuery.topic = topic;
        const topicBanks = await QuestionBank.find(filteredQuery);
        const boards = [...new Set(topicBanks.map(b => b.board).filter(Boolean))].sort();

        // Apply board filter for year computation (cascading)
        let boardQuery = { ...filteredQuery };
        if (board) boardQuery.board = board;
        const boardBanks = await QuestionBank.find(boardQuery);
        const years = [...new Set(boardBanks.map(b => b.year).filter(Boolean))].sort((a, b) => b - a);
        
        res.json({ success: true, topics, boards, years });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Fetch quizzes for selection
router.get('/api/quizzes', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { classLevel, subject } = req.query;
        
        let query = { addedBy: req.session.user._id };
        
        const classes = classLevel ? classLevel.split(',').filter(Boolean) : [];
        const subjects = subject ? subject.split(',').filter(Boolean) : [];
        
        let andConditions = [];
        
        if (classes.length > 0 && subjects.length > 0) {
            const matchingCourseIds = await Course.find({ classLevel: { $in: classes }, subject: { $in: subjects } }).distinct('_id');
            andConditions.push({
                $or: [
                    { classLevel: { $in: classes }, subject: { $in: subjects } },
                    { course: { $in: matchingCourseIds } }
                ]
            });
        } else if (classes.length > 0) {
            const matchingCourseIds = await Course.find({ classLevel: { $in: classes } }).distinct('_id');
            andConditions.push({
                $or: [
                    { classLevel: { $in: classes } },
                    { course: { $in: matchingCourseIds } }
                ]
            });
        } else if (subjects.length > 0) {
            const matchingCourseIds = await Course.find({ subject: { $in: subjects } }).distinct('_id');
            andConditions.push({
                $or: [
                    { subject: { $in: subjects } },
                    { course: { $in: matchingCourseIds } }
                ]
            });
        }
        
        if (andConditions.length > 0) {
            query.$and = andConditions;
        }
        
        const quizzes = await Quiz.find(query).select('title _id subject classLevel course').populate('course', 'subject classLevel');
        res.json({ success: true, quizzes });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/add-quiz', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        
        const isModelTest = req.body.isModelTest === 'true';
        const courseId = isModelTest ? undefined : (req.body.courseId || undefined);
        
        let accessType = req.body.accessType || 'Free';
        if (courseId) {
            const linkedCourse = await Course.findById(courseId);
            if (linkedCourse) {
                accessType = (linkedCourse.accessType && linkedCourse.accessType.toLowerCase() === 'paid') ? 'Paid' : 'Free';
            }
        } else {
            if (accessType.toLowerCase() === 'paid') accessType = 'Paid';
            else accessType = 'Free';
        }
        
        const quizData = {
            title: req.body.title,
            course: courseId,
            duration: parseInt(req.body.duration) || 10,
            accessType: accessType,
            questions: [],
            addedBy: req.session.user._id
        };

        if (isModelTest) {
            quizData.subject = req.body.subject;
            quizData.classLevel = req.body.classLevel;
        }

        const strategy = req.body.strategy || 'manual';
        
        if (strategy === 'automated') {
            const { bankTopic, bankBoard, bankYear, mcqCount, shortCount, mediumCount, comprehensionCount } = req.body;
            
            let bankQuery = { addedBy: req.session.user._id };
            if (req.body.classLevel) bankQuery.classLevel = req.body.classLevel;
            if (req.body.subject) bankQuery.subject = req.body.subject;
            if (bankTopic) bankQuery.topic = bankTopic;
            if (bankBoard) bankQuery.board = bankBoard;
            if (bankYear) bankQuery.year = bankYear;
            
            const banks = await QuestionBank.find(bankQuery);
            const bankIds = banks.map(b => b._id);
            
            const pullQuestions = async (type, count) => {
                if (!count || count <= 0) return [];
                return await Question.find({ bankId: { $in: bankIds }, questionType: type }).limit(count);
            };
            
            const mcqs = await pullQuestions('MCQ', parseInt(mcqCount));
            const shorts = await pullQuestions('Short', parseInt(shortCount));
            const mediums = await pullQuestions('Medium', parseInt(mediumCount));
            const comps = await pullQuestions('Comprehension', parseInt(comprehensionCount));
            
            const allQuestions = [...mcqs, ...shorts, ...mediums, ...comps];
            
            quizData.questions = allQuestions.map(bq => ({
                questionText: bq.questionText,
                options: bq.options,
                correctAnswer: bq.correctAnswer,
                explanation: bq.explanation || '',
                questionType: bq.questionType || 'MCQ'
            }));
        } else {
            // Manual Strategy: Create empty questions based on counts
            const mcqCount = parseInt(req.body.mcqCount) || 0;
            const shortCount = parseInt(req.body.shortCount) || 0;
            const mediumCount = parseInt(req.body.mediumCount) || 0;
            const comprehensionCount = parseInt(req.body.comprehensionCount) || 0;
            
            for (let i = 0; i < mcqCount; i++) {
                quizData.questions.push({ 
                    questionText: `New MCQ Question ${i+1}`, 
                    options: ['Option A', 'Option B', 'Option C', 'Option D'], 
                    correctAnswer: 0, 
                    explanation: '',
                    questionType: 'MCQ'
                });
            }
            for (let i = 0; i < shortCount; i++) {
                quizData.questions.push({ 
                    questionText: `New Short Question ${i+1}`, 
                    options: [], 
                    correctAnswer: 0, 
                    explanation: '',
                    questionType: 'Short'
                });
            }
            for (let i = 0; i < mediumCount; i++) {
                quizData.questions.push({ 
                    questionText: `New Medium Question ${i+1}`, 
                    options: [], 
                    correctAnswer: 0, 
                    explanation: '',
                    questionType: 'Medium'
                });
            }
            for (let i = 0; i < comprehensionCount; i++) {
                quizData.questions.push({ 
                    questionText: `New Comprehension Question ${i+1}`, 
                    options: [], 
                    correctAnswer: 0, 
                    explanation: '',
                    questionType: 'Comprehension'
                });
            }
        }

        const quiz = await new Quiz(quizData).save();
        
        if (req.body.activeFlow === 'courses' && courseId) {
            res.redirect(`/teacher/course/${courseId}/quiz/${quiz._id}`);
        } else if (req.body.bankId) {
            res.redirect('/teacher/quizzes');
        } else {
            res.redirect(`/teacher/quiz/${quiz._id}`);
        }
    } catch (err) {
        console.error('Add Quiz Error:', err);
        res.redirect('/teacher/quizzes');
    }
});

// Delete a quiz
router.get('/quiz/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).send('Quiz not found');
        if (quiz.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Access denied');
        }

        await Quiz.findByIdAndDelete(req.params.id);
        res.redirect('/teacher/quizzes?success=Quiz deleted');
    } catch (err) { res.status(500).send('Error deleting quiz'); }
});

// Bulk action for quizzes
router.post('/quizzes/bulk-action', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { action, itemIds } = req.body;
        if (!itemIds || !itemIds.length) return res.status(400).json({ success: false, error: 'No items selected' });
        
        if (action === 'delete') {
            await Quiz.deleteMany({ _id: { $in: itemIds }, addedBy: req.session.user._id });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// View quiz details
router.get('/quiz-details/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id).populate('course').populate('addedBy');
        if (!quiz) return res.status(404).send('Quiz not found');
        if (quiz.addedBy._id.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Access denied');
        }

        const stats = {
            total: quiz.questions.length,
            MCQ: quiz.questions.filter(q => q.questionType === 'MCQ').length,
            Short: quiz.questions.filter(q => q.questionType === 'Short').length,
            Medium: quiz.questions.filter(q => q.questionType === 'Medium').length,
            Comprehension: quiz.questions.filter(q => q.questionType === 'Comprehension').length
        };

        // Simulated analytic cockpit parameters
        const engagement = {
            activeTakers: Math.floor(Math.random() * 45) + 5,
            maxTakers: 100,
            studyDuration: Math.floor(Math.random() * 25) + 15,
            maxDuration: 60,
            popularityScore: Math.floor(Math.random() * 30) + 70
        };

        res.render('teacher/quiz-details', {
            quiz,
            questions: quiz.questions,
            stats,
            engagement,
            user: req.session.user,
            active: 'quizzes'
        });
    } catch (err) {
        console.error('Quiz Details Error:', err);
        res.status(500).send('Error loading quiz details');
    }
});

router.get('/quiz/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id).populate('course').populate('addedBy');
        if (!quiz) return res.status(404).send('Quiz not found');
        
        if (quiz.addedBy._id.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Access denied');
        }
        
        const courses = await Course.find({ 
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }] 
        });
        
        res.render('teacher/quiz-editor', { quiz, courses, user: req.session.user, active: 'quizzes' });
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

router.get('/course/:courseId/quiz/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id).populate('course').populate('addedBy');
        if (!quiz) return res.status(404).send('Quiz not found');
        
        if (quiz.addedBy._id.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Access denied');
        }
        
        const courses = await Course.find({ 
            $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }] 
        });
        
        res.render('teacher/quiz-editor', { 
            quiz, 
            courses, 
            user: req.session.user, 
            active: 'courses',
            courseId: req.params.courseId
        });
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

// Add question to quiz
router.post('/quiz/:id/add-question', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        if (quiz.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        let { questionText, optionA, optionB, optionC, optionD, options, correctAnswerIndex, correctAnswer, explanation } = req.body;
        
        if (!options || !Array.isArray(options)) {
            options = [optionA, optionB, optionC, optionD].filter(o => o && o.trim());
        }
        
        const finalCorrectIndex = (correctAnswer !== undefined) ? parseInt(correctAnswer) : (parseInt(correctAnswerIndex) || 0);

        const type = req.body.questionType || 'MCQ';
        if (!questionText) {
            return res.status(400).json({ success: false, error: 'Question text is required.' });
        }
        if (type === 'MCQ' && options.length < 2) {
            return res.status(400).json({ success: false, error: 'MCQ requires at least 2 options.' });
        }

        quiz.questions.push({ 
            questionText: questionText.trim(), 
            options, 
            correctAnswer: finalCorrectIndex, 
            explanation: explanation?.trim() || '',
            questionType: req.body.questionType || 'MCQ'
        });
        await quiz.save();
        
        const newQ = quiz.questions[quiz.questions.length - 1];
        res.json({ success: true, question: newQ, totalQuestions: quiz.questions.length });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Edit a question
router.post('/quiz/:id/question/:qid/edit', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        if (quiz.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        let { questionText, optionA, optionB, optionC, optionD, options, correctAnswerIndex, correctAnswer, explanation, answer, context, q1, q2, a1, a2, marks, board, year, questionType } = req.body;
        
        if (!options || !Array.isArray(options)) {
            options = [optionA, optionB, optionC, optionD].filter(o => o !== undefined && o !== null);
        }

        // Validation
        if (!marks) {
            return res.status(400).json({ success: false, error: 'Marks are mandatory!' });
        }

        if (questionType === 'MCQ' || !questionType) {
            if (!questionText || questionText.trim() === '') {
                return res.status(400).json({ success: false, error: 'Question text is mandatory!' });
            }
            const filledOptions = options.filter(o => o && o.trim() !== '');
            if (filledOptions.length < 3) {
                return res.status(400).json({ success: false, error: 'At least 3 options are mandatory for MCQ!' });
            }
        } else if (questionType === 'Short' || questionType === 'Medium') {
            if (!questionText || questionText.trim() === '' || !answer || answer.trim() === '') {
                return res.status(400).json({ success: false, error: 'Question and Answer are mandatory!' });
            }
        } else if (questionType === 'Comprehension') {
            if (!context || context.trim() === '' || !q1 || !q2 || !a1 || !a2) {
                return res.status(400).json({ success: false, error: 'Context, Questions, and Answers are mandatory!' });
            }
        }
        
        let updateData = {
            'questions.$.questionText': questionText ? questionText.trim() : '',
            'questions.$.options': options,
            'questions.$.explanation': explanation ? explanation.trim() : '',
            'questions.$.marks': parseInt(marks) || 1,
            'questions.$.board': board || '',
            'questions.$.year': year || '',
            'questions.$.questionType': questionType
        };
        
        if (questionType === 'MCQ' || !questionType) {
            const finalCorrectIndex = (correctAnswer !== undefined) ? parseInt(correctAnswer) : (parseInt(correctAnswerIndex) || 0);
            updateData['questions.$.correctAnswer'] = finalCorrectIndex;
        } else if (questionType === 'Short' || questionType === 'Medium') {
            if (answer !== undefined) {
                updateData['questions.$.answer'] = answer;
                updateData['questions.$.correctAnswer'] = answer; // Keep in sync!
            }
        } else {
            if (answer !== undefined) updateData['questions.$.answer'] = answer;
        }
        if (context !== undefined) updateData['questions.$.context'] = context;
        if (q1 !== undefined) updateData['questions.$.q1'] = q1;
        if (q2 !== undefined) updateData['questions.$.q2'] = q2;
        if (a1 !== undefined) updateData['questions.$.a1'] = a1;
        if (a2 !== undefined) updateData['questions.$.a2'] = a2;

        await Quiz.updateOne(
            { _id: req.params.id, 'questions._id': req.params.qid },
            { $set: updateData }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete a question
router.post('/quiz/:id/question/:qid/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        if (quiz.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        await Quiz.findByIdAndUpdate(req.params.id, { $pull: { questions: { _id: req.params.qid } } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/api/question-banks', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const banks = await QuestionBank.find({ addedBy: req.session.user._id }).select('board year subject classLevel _id');
        res.json({ success: true, banks });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/add-question-bank', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.single('file')(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const { title, topic, board, year, subject, classLevel, accessType, price, course } = req.body;
        const fileUrl = req.file ? `/uploads/questions/${req.file.filename}` : null;
        
        let classLevelArray = classLevel;
        if (typeof classLevel === 'string') {
            classLevelArray = [classLevel];
        }

        const newBank = new QuestionBank({
            title: title || topic || '',
            topic: topic || '',
            board, year, subject, classLevel: classLevelArray,
            accessType: accessType || 'Free',
            price: parseFloat(price) || 0,
            course: course && mongoose.Types.ObjectId.isValid(course) ? course : undefined,
            fileUrl,
            addedBy: req.session.user._id,
            status: 'pending'
        });
        await newBank.save();
        res.redirect('/teacher/question-bank?success=Question Bank submitted for admin approval');
    } catch (err) {
        console.error('Add Question Bank Error:', err);
        res.status(500).send('Error creating question bank');
    }
});

router.get('/question-bank/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.id);
        if (!bank) return res.status(404).send('Not found');
        if (bank.addedBy.toString() !== req.session.user._id.toString()) return res.status(403).send('Unauthorized');
        await QuestionBank.findByIdAndDelete(req.params.id);
        res.redirect('/teacher/question-bank?success=Bank deleted');
    } catch (err) { res.status(500).send('Error deleting bank'); }
});

router.post('/question-bank/bulk-action', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { action, itemIds } = req.body;
        if (!itemIds || !itemIds.length) return res.status(400).json({ success: false, error: 'No items selected' });
        if (action === 'delete') {
            await QuestionBank.deleteMany({ _id: { $in: itemIds }, addedBy: req.session.user._id });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/edit-question-bank/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const [bank, questions, userCourses] = await Promise.all([
            QuestionBank.findById(req.params.id),
            Question.find({ bankId: req.params.id }).sort({ createdAt: -1 }),
            Course.find({
                $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }]
            })
        ]);
        if (!bank) return res.status(404).send('Bank not found');

        const assignedSubjects = [...new Set(userCourses.map(c => c.subject).filter(Boolean))].sort();
        const assignedClasses = [...new Set(userCourses.map(c => c.classLevel).filter(Boolean))].sort();

        res.render('teacher/edit-question-bank', { 
            bank, 
            questions, 
            assignedSubjects,
            assignedClasses,
            user: req.session.user, 
            active: 'questions' 
        });
    } catch (err) {
        console.error('Edit Question Bank Error:', err);
        res.status(500).send('Error loading edit page');
    }
});

// POST: Update Bank Metadata & Attachment PDF Asset
router.post('/edit-question-bank/:id', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.single('file')(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.id);
        if (!bank) return res.status(404).send('Question Bank not found');

        if (bank.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized to update this archive');
        }

        const { title, topic, board, year, subject, classLevel, accessType, price, duration } = req.body;
        
        let classLevelArray = classLevel;
        if (typeof classLevel === 'string') {
            classLevelArray = [classLevel];
        }

        const parsedDuration = parseInt(duration);

        const updateData = {
            title: title || topic || bank.title,
            topic: topic || bank.topic,
            board: board || bank.board,
            year: year || bank.year,
            subject: subject || bank.subject,
            classLevel: classLevelArray || bank.classLevel,
            accessType: accessType || bank.accessType || 'Free',
            price: typeof price !== 'undefined' ? (parseFloat(price) || 0) : bank.price,
            duration: !isNaN(parsedDuration) && parsedDuration > 0 ? parsedDuration : (bank.duration || 30),
            status: bank.status === 'approved' ? 'approved' : 'pending'
        };

        if (req.file) {
            updateData.fileUrl = `/uploads/questions/${req.file.filename}`;
        }

        await QuestionBank.findByIdAndUpdate(req.params.id, updateData);

        const redirectMsg = bank.status === 'approved'
            ? 'Archive updated successfully'
            : 'Archive updated and submitted for admin approval';

        res.redirect(`/teacher/edit-question-bank/${req.params.id}?success=${encodeURIComponent(redirectMsg)}`);
    } catch (err) {
        console.error('Update Teacher Question Bank Error:', err);
        res.status(500).send('Error updating question bank: ' + err.message);
    }
});

// POST: Bulk Update Inventory Questions in Teacher Studio
router.post('/question-bank/:id/bulk-update-questions', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.id);
        if (!bank) return res.status(404).send('Bank not found');

        if (bank.addedBy.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        const { questionIds, texts, correctAnswers, correctIndices, answers, explanations, marks } = req.body;
        if (!questionIds || !Array.isArray(questionIds)) {
            return res.redirect(`/teacher/edit-question-bank/${req.params.id}?error=No questions to update`);
        }

        for (let i = 0; i < questionIds.length; i++) {
            const qId = questionIds[i];
            const text = texts ? texts[i] : null;
            const updateObj = {};

            if (text) updateObj.questionText = text;

            if (explanations && explanations[i] !== undefined) {
                updateObj.explanation = (explanations[i] || '').trim();
            }

            if (marks && marks[i] !== undefined) {
                const parsedMarks = parseInt(marks[i]);
                if (!isNaN(parsedMarks) && parsedMarks > 0) updateObj.marks = parsedMarks;
            }

            if (answers && answers[i] !== undefined) {
                updateObj.correctAnswer = (answers[i] || '').trim();
            }

            const corrVal = (correctIndices && correctIndices[i] !== undefined) ? correctIndices[i] : (correctAnswers ? correctAnswers[i] : undefined);
            if (corrVal !== undefined) {
                updateObj.correctAnswerIndex = parseInt(corrVal) || 0;
            }

            const optionsKey = `options_${i}`;
            if (req.body[optionsKey] && Array.isArray(req.body[optionsKey])) {
                updateObj.options = req.body[optionsKey];
            }

            if (Object.keys(updateObj).length > 0) {
                await Question.findByIdAndUpdate(qId, updateObj);
            }
        }

        if (bank.status !== 'approved') {
            await QuestionBank.findByIdAndUpdate(req.params.id, { status: 'pending' });
        }

        const msg = bank.status === 'approved' 
            ? 'Questions updated successfully' 
            : 'Questions updated and submitted for admin approval';

        res.redirect(`/teacher/edit-question-bank/${req.params.id}?success=${encodeURIComponent(msg)}`);
    } catch (err) {
        console.error('Teacher Bulk Update Questions Error:', err);
        res.status(500).send('Error updating questions');
    }
});

// POST & GET: Delete Attached PDF Asset File (Fail-safe API and Direct Route)
const handleDeleteAttachment = async (req, res) => {
    try {
        await connectDB();
        const bank = await QuestionBank.findById(req.params.id);
        if (!bank) {
            if (req.headers.accept?.includes('json') || req.headers['content-type'] === 'application/json') {
                return res.status(404).json({ success: false, error: 'Bank not found' });
            }
            return res.status(404).send('Bank not found');
        }

        if (bank.addedBy.toString() !== req.session.user._id.toString()) {
            if (req.headers.accept?.includes('json') || req.headers['content-type'] === 'application/json') {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }
            return res.status(403).send('Unauthorized');
        }

        if (bank.fileUrl) {
            const relativePath = bank.fileUrl.startsWith('/') ? bank.fileUrl.substring(1) : bank.fileUrl;
            const fullPath = path.join(process.cwd(), 'client/public', relativePath);
            try {
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (e) { console.error('Error unlinking file:', e); }
        }

        bank.fileUrl = null;
        await bank.save();

        if (req.headers.accept?.includes('json') || req.headers['content-type'] === 'application/json') {
            return res.json({ success: true, message: 'Attachment deleted successfully' });
        }
        res.redirect(`/teacher/edit-question-bank/${req.params.id}?success=Attachment deleted`);
    } catch (err) {
        console.error('Delete attachment error:', err);
        if (req.headers.accept?.includes('json') || req.headers['content-type'] === 'application/json') {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.status(500).send('Error deleting attachment: ' + err.message);
    }
};

router.post('/question-bank/:id/delete-file', teacherProtect, handleDeleteAttachment);
router.get('/question-bank/:id/delete-file', teacherProtect, handleDeleteAttachment);

// ========== QUESTIONS MANAGEMENT ==========
router.get('/question-details', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const typeFilter = req.query.type || 'all';
        const classFilter = req.query.class || 'all';
        const subjectFilter = req.query.subject || 'all';
        const accessFilter = req.query.access || 'all';
        const boardFilter = req.query.board || 'all';
        const search = req.query.q || '';

        // Query assigned courses to populate dropdowns
        const userCourses = await Course.find({
            $or: [{ instructor: user._id }, { permittedTeachers: user._id }]
        });
        const assignedSubjects = [...new Set(userCourses.flatMap(c => c.subject || []))].filter(Boolean).sort();
        const assignedClasses = [...new Set(userCourses.flatMap(c => c.classLevel || []))].filter(Boolean).sort();

        let query = { addedBy: user._id };
        if (typeFilter !== 'all') query.questionType = typeFilter;
        if (classFilter !== 'all') query.classLevel = classFilter;
        if (subjectFilter !== 'all') query.subject = subjectFilter;
        if (accessFilter !== 'all') query.accessType = accessFilter;
        if (boardFilter !== 'all') query.board = boardFilter;
        if (search) query.questionText = { $regex: search, $options: 'i' };

        const [questions, totalCount, stats] = await Promise.all([
            Question.find(query).populate('addedBy', 'name profileImage').sort({ createdAt: -1 }).skip(skip).limit(limit),
            Question.countDocuments(query),
            Question.aggregate([
                { $match: { addedBy: new mongoose.Types.ObjectId(String(user._id)) } },
                {
                    $group: {
                        _id: null,
                        mCQCount: { $sum: { $cond: [{ $eq: ['$questionType', 'MCQ'] }, 1, 0] } },
                        shortCount: { $sum: { $cond: [{ $eq: ['$questionType', 'Short'] }, 1, 0] } },
                        mediumCount: { $sum: { $cond: [{ $eq: ['$questionType', 'Medium'] }, 1, 0] } },
                        compCount: { $sum: { $cond: [{ $eq: ['$questionType', 'Comprehension'] }, 1, 0] } }
                    }
                }
            ]).then(res => res[0] || {})
        ]);

        res.render('teacher/question-details', {
            questions,
            user,
            assignedSubjects,
            assignedClasses,
            mCQCount: stats.mCQCount || 0,
            shortCount: stats.shortCount || 0,
            mediumCount: stats.mediumCount || 0,
            compCount: stats.compCount || 0,
            filters: {
                page,
                totalPages: Math.ceil(totalCount / limit) || 1,
                q: search,
                type: typeFilter,
                class: classFilter,
                subject: subjectFilter,
                board: boardFilter,
                access: accessFilter,
                totalCount
            },
            active: 'question-details'
        });
    } catch (err) {
        console.error('Question History Error:', err);
        res.status(500).send('Error loading history');
    }
});

router.get('/add-question', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const [banks, userCourses] = await Promise.all([
            QuestionBank.find({ addedBy: user._id }),
            Course.find({ $or: [{ instructor: user._id }, { permittedTeachers: user._id }] })
                  .select('title _id accessType subject classLevel')
        ]);

        // Build deduplicated subject and class lists from assigned courses
        const subjectSet = new Set();
        const classSet = new Set();
        userCourses.forEach(c => {
            if (Array.isArray(c.subject)) c.subject.forEach(s => subjectSet.add(s));
            else if (c.subject) subjectSet.add(c.subject);
            if (Array.isArray(c.classLevel)) c.classLevel.forEach(cl => classSet.add(cl));
            else if (c.classLevel) classSet.add(c.classLevel);
        });

        res.render('teacher/add-question', {
            banks,
            user,
            userCourses,
            assignedSubjects: Array.from(subjectSet).sort(),
            assignedClasses: Array.from(classSet).sort(),
            active: req.query.mode === 'archive' ? 'questions' : 'question-details',
            mode: req.query.mode || 'standalone'
        });
    } catch (err) { res.status(500).send('Error loading page'); }
});

router.post('/add-question-full', teacherProtect, (req, res, next) => {
    const upload = router.upload;
    if (upload) upload.single('file')(req, res, next);
    else next();
}, async (req, res) => {
    try {
        await connectDB();
        const body = req.body;

        // Build questions from flat arrays submitted by the form
        const qTexts     = [].concat(body['qText[]']     || body.qText     || []);
        const qTypes     = [].concat(body['qType[]']     || body.qType     || []);
        const qAnswers   = [].concat(body['qAnswer[]']   || body.qAnswer   || []);
        const qExplains  = [].concat(body['qExplanation[]'] || body.qExplanation || []);
        const qCorrects  = [].concat(body['qCorrectIndex[]'] || body.qCorrectIndex || []);
        const qBoards    = [].concat(body['qBoard[]']    || body.qBoard    || []);
        const qYears     = [].concat(body['qYear[]']     || body.qYear     || []);
        const qMarks     = [].concat(body['qMarks[]']    || body.qMarks    || []);

        // qOptions[] comes as groups of 4 per question
        const allOptions = [].concat(body['qOptions[]'] || body.qOptions || []);

        const mode      = body.mode || 'standalone';
        let bankId    = body.bankId || null;

        // Global archive metadata (archive mode)
        const globalBoard    = (body.board || '').trim();
        const globalYear     = (body.year || '').trim();
        const globalSubject  = (body.subject || 'General').trim();
        let globalClass      = body.classLevel || 'General';
        if (Array.isArray(globalClass)) globalClass = globalClass[0] || 'General';
        globalClass = String(globalClass).trim();
        const globalTopic    = (body.topic || '').trim();
        const globalAccess   = 'Free';

        if (!qTexts.length) {
            return res.status(400).send('No questions provided in matrix');
        }

        let targetBankId = (bankId && bankId.trim() !== '' && bankId !== 'null') ? bankId.trim() : null;

        // --- AUTOMATED BANK CREATION (ARCHIVE MODE) ---
        if (mode === 'archive' && !targetBankId && globalSubject) {
            // Find a matching course assigned to the user
            const matchedCourse = await Course.findOne({
                $or: [{ instructor: req.session.user._id }, { permittedTeachers: req.session.user._id }],
                subject: globalSubject
            });

            const boardYear = [globalBoard, globalYear].filter(Boolean).join(' ');
            const autoTitle = body.title || `${globalSubject} - ${boardYear || 'Board Exam'}`.trim();

            const fileUrl = req.file ? `/uploads/questions/${req.file.filename}` : null;
            const newBank = await new QuestionBank({
                title: autoTitle,
                topic: globalTopic || '',
                board: globalBoard || 'General Board',
                year: globalYear || new Date().getFullYear().toString(),
                subject: globalSubject,
                classLevel: [globalClass], // Store as array
                accessType: 'Free',
                price: 0,
                duration: parseInt(body.duration) || 30,
                course: matchedCourse ? matchedCourse._id : undefined,
                fileUrl,
                addedBy: req.session.user._id,
                status: 'pending'
            }).save();
            targetBankId = newBank._id;
        }

        const optionsPerQ = 4; // MCQ always has 4 options
        const questions = qTexts.map((text, i) => {
            const type = qTypes[i] || 'MCQ';
            const isMCQ = type === 'MCQ';
            const opts = isMCQ ? allOptions.slice(i * optionsPerQ, i * optionsPerQ + optionsPerQ) : [];

            return {
                questionText: text,
                questionType: type,
                options: opts,
                correctAnswerIndex: isMCQ ? parseInt(qCorrects[i] || 0) : undefined,
                correctAnswer: !isMCQ ? (qAnswers[i] || '') : undefined,
                explanation: qExplains[i] || '',
                marks: parseInt(qMarks[i] || 1) || 1,
                board:    mode === 'archive' ? globalBoard  : (qBoards[i] || globalBoard || 'General Board'),
                year:     mode === 'archive' ? globalYear   : (qYears[i]  || globalYear  || ''),
                subject:  mode === 'archive' ? globalSubject : (body.qSubject?.[i] || globalSubject || 'General'),
                classLevel: mode === 'archive' ? globalClass : (body.qClass?.[i] || globalClass || 'General'),
                accessType: 'Free',
                isBoardQuestion: true,
                addedBy:  req.session.user._id,
                bankId:   targetBankId && mongoose.Types.ObjectId.isValid(targetBankId) ? targetBankId : undefined
            };
        });

        const savedQuestions = await Question.insertMany(questions);

        if (targetBankId && mongoose.Types.ObjectId.isValid(targetBankId)) {
            await QuestionBank.findByIdAndUpdate(targetBankId, { $inc: { questionCount: savedQuestions.length } });
        }

        // Log Activity
        await logActivity(req, 'BULK_CREATE', `Added ${savedQuestions.length} questions to ${targetBankId ? 'Bank' : 'Insights Hub'}`, 'Question');

        // Redirect logic
        if (mode === 'archive') {
            res.redirect('/teacher/question-bank?success=' + savedQuestions.length + ' questions submitted for admin approval');
        } else {
            res.redirect('/teacher/question-details?success=' + savedQuestions.length + ' questions added successfully');
        }
    } catch (err) {
        console.error('Add Question Full Error:', err);
        res.status(500).send('Error adding questions: ' + err.message);
    }
});

router.post('/edit-question/:id', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { questionText, questionType, options, correctAnswerIndex, correctAnswer, explanation, board, year, subject, classLevel, accessType } = req.body;
        const q = await Question.findById(req.params.id);
        if (!q) return res.status(404).send('Not found');
        if (q.addedBy.toString() !== req.session.user._id.toString()) return res.status(403).send('Unauthorized');

        const updateData = {
            questionText, questionType, explanation, board, year, subject, classLevel, accessType,
            correctAnswer: correctAnswer || '',
            updatedAt: new Date()
        };

        if (questionType === 'MCQ') {
            updateData.options = options;
            updateData.correctAnswerIndex = parseInt(correctAnswerIndex) || 0;
        }

        const updated = await Question.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('addedBy', 'name profileImage');
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/question/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const q = await Question.findById(req.params.id);
        if (!q) return res.status(404).send('Not found');
        if (q.addedBy.toString() !== req.session.user._id.toString()) return res.status(403).send('Unauthorized');
        
        if (q.bankId) {
            await QuestionBank.findByIdAndUpdate(q.bankId, { $inc: { questionCount: -1 } });
        }
        
        await Question.findByIdAndDelete(req.params.id);
        res.redirect('/teacher/question-details?success=Deleted');
    } catch (err) { res.status(500).send('Error'); }
});

router.post('/question/bulk-action', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const { action, itemIds } = req.body;
        if (!itemIds || !itemIds.length) return res.status(400).json({ success: false, error: 'No items' });
        if (action === 'delete') {
            await Question.deleteMany({ _id: { $in: itemIds }, addedBy: req.session.user._id });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==========================================
// AI KNOWLEDGE HUB - TEACHER ROUTES (RESTRICTED TO ASSIGNED SUBJECTS)
// ==========================================

// Helper to get strictly assigned subjects & classes for a teacher
async function getTeacherAssignedContext(teacherId) {
    const User = require('../models/User');
    const Course = require('../models/Course');

    const teacherProfile = await User.findById(teacherId).select('teachingSubject teachingSubjects classLevel assignedClasses role').lean();
    
    const splitTokens = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val.flatMap(v => splitTokens(v));
        return String(val).split(',').map(s => s.trim()).filter(Boolean);
    };

    const rawUserSubjects = [
        ...splitTokens(teacherProfile?.teachingSubject),
        ...splitTokens(teacherProfile?.teachingSubjects)
    ];
    const rawUserClasses = [
        ...splitTokens(teacherProfile?.classLevel),
        ...splitTokens(teacherProfile?.assignedClasses)
    ];

    const teacherAssignedCourses = await Course.find({
        $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
    }).select('subject classLevel').lean();

    const teacherAssignedCourseSubjects = teacherAssignedCourses.flatMap(c => splitTokens(c.subject));
    const teacherAssignedCourseClasses = teacherAssignedCourses.flatMap(c => splitTokens(c.classLevel));

    const assignedSubjects = [...new Set([...rawUserSubjects, ...teacherAssignedCourseSubjects])].filter(Boolean).sort();
    const assignedClasses = [...new Set([...rawUserClasses, ...teacherAssignedCourseClasses])].filter(Boolean).sort();

    const isSuperOrAdmin = ['admin', 'superadmin'].includes(teacherProfile?.role);
    const hasStrictSubject = assignedSubjects.length > 0;
    const hasStrictClass = assignedClasses.length > 0;

    return {
        assignedSubjects: hasStrictSubject ? assignedSubjects : ['General Academic'],
        assignedClasses: hasStrictClass ? assignedClasses : ['All Classes'],
        rawAssignedSubjects: assignedSubjects,
        rawAssignedClasses: assignedClasses,
        hasStrictSubject,
        hasStrictClass,
        isSuperOrAdmin
    };
}

// Helper to get question bank filter strictly scoped to teacher's assigned subjects and classes
async function getTeacherAccessibleBankQuery(teacherId, userDoc) {
    const context = await getTeacherAssignedContext(teacherId);
    const { rawAssignedSubjects, rawAssignedClasses, hasStrictSubject, hasStrictClass, isSuperOrAdmin } = context;

    // Unrestricted if admin/superadmin or if neither specific subject nor specific class is configured
    if (isSuperOrAdmin || (!hasStrictSubject && !hasStrictClass)) {
        return {
            bankFilter: {},
            context,
            isUnrestricted: true
        };
    }

    const Course = require('../models/Course');
    const teacherCourses = await Course.find({
        $or: [{ instructor: teacherId }, { permittedTeachers: teacherId }]
    }).select('_id').lean();
    const teacherCourseIds = teacherCourses.map(c => c._id);

    // Build criteria strictly enforcing assigned subject and class
    const criteria = {};
    const getSubjectRegex = (subj) => {
        const s = (subj || '').trim();
        if (/^math(ematics)?$/i.test(s)) {
            return /.*(math|mathematics).*/i;
        }
        if (/^(bangla|bengali)$/i.test(s)) {
            return /.*(bangla|bengali).*/i;
        }
        if (/^english$/i.test(s)) {
            return /.*english.*/i;
        }
        return new RegExp(`.*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`, 'i');
    };

    if (hasStrictSubject) {
        criteria.subject = {
            $in: rawAssignedSubjects.map(getSubjectRegex)
        };
    }
    if (hasStrictClass) {
        const classRegexes = rawAssignedClasses.flatMap(c => {
            const str = String(c).trim();
            const res = [new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')];
            if (/^(class\s*)?9$/i.test(str) || /^(class\s*)?10$/i.test(str)) {
                res.push(/^SSC$/i, /^9$/i, /^10$/i, /^Class\s*9$/i, /^Class\s*10$/i);
            }
            if (/^(class\s*)?11$/i.test(str) || /^(class\s*)?12$/i.test(str)) {
                res.push(/^HSC$/i, /^11$/i, /^12$/i, /^Class\s*11$/i, /^Class\s*12$/i);
            }
            return res;
        });
        criteria.classLevel = {
            $in: classRegexes
        };
    }

    let bankFilter = criteria;
    if (teacherCourseIds.length > 0 || teacherId) {
        bankFilter = {
            $and: [
                hasStrictSubject ? { subject: { $in: rawAssignedSubjects.map(getSubjectRegex) } } : {},
                {
                    $or: [
                        criteria.classLevel ? { classLevel: criteria.classLevel } : {},
                        ...(teacherCourseIds.length > 0 ? [{ course: { $in: teacherCourseIds } }] : []),
                        { addedBy: teacherId }
                    ]
                }
            ]
        };
    }

    return {
        bankFilter,
        context,
        isUnrestricted: false
    };
}

// GET /teacher/ai-knowledge - List knowledge rules strictly for teacher's assigned subjects
router.get('/ai-knowledge', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const AIKnowledge = require('../models/AIKnowledge');
        const user = req.session.user;

        const { assignedSubjects, assignedClasses } = await getTeacherAssignedContext(user._id);

        const { subject, classLevel, search } = req.query;
        
        // Scope filter to ONLY teacher's assigned subjects (or created by them)
        const filter = {
            $or: [
                { subject: { $in: assignedSubjects.map(s => new RegExp(`^${s.trim()}$`, 'i')) } },
                { createdBy: user._id }
            ]
        };

        if (subject && subject !== 'all') {
            filter.subject = new RegExp(`^${subject.trim()}$`, 'i');
        }
        if (classLevel && classLevel !== 'all') {
            filter.classLevel = new RegExp(`^${classLevel.trim()}$`, 'i');
        }
        if (search && search.trim() !== '') {
            const sRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$and = [
                {
                    $or: [
                        { title: sRegex },
                        { topic: sRegex },
                        { content: sRegex },
                        { keywords: sRegex }
                    ]
                }
            ];
        }

        const knowledgeList = await AIKnowledge.find(filter)
            .populate('createdBy', 'name email')
            .sort({ priority: -1, createdAt: -1 })
            .lean();

        // Calculate statistics for this teacher's subject scope
        const totalItems = knowledgeList.length;
        const activeItems = knowledgeList.filter(k => k.isActive).length;
        const myCreatedCount = knowledgeList.filter(k => k.createdBy && k.createdBy._id && k.createdBy._id.toString() === user._id.toString()).length;

        res.render('teacher/ai-knowledge', {
            user,
            active: 'ai-knowledge',
            knowledgeList: knowledgeList || [],
            classList: assignedClasses,
            subjectList: assignedSubjects,
            selectedSubject: subject || 'all',
            selectedClass: classLevel || 'all',
            searchQuery: search || '',
            stats: {
                total: totalItems,
                active: activeItems,
                myCreated: myCreatedCount
            }
        });
    } catch (err) {
        console.error('Error loading Teacher AI Knowledge Hub:', err);
        res.status(500).send('Error loading AI Knowledge Hub');
    }
});

// POST /teacher/ai-knowledge/create - Teacher creates rule strictly for their assigned subjects
router.post('/ai-knowledge/create', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const AIKnowledge = require('../models/AIKnowledge');
        const user = req.session.user;
        const { title, classLevel, subject, topic, keywords, content, priority, isActive } = req.body;

        if (!title || !subject || !content) {
            return res.status(400).json({ success: false, error: 'Title, Subject and Content are required.' });
        }

        const { assignedSubjects } = await getTeacherAssignedContext(user._id);

        // Security check: teacher can only add knowledge for assigned subjects
        const isSubjectPermitted = assignedSubjects.some(s => s.toLowerCase() === subject.trim().toLowerCase());
        if (!isSubjectPermitted) {
            return res.status(403).send('Unauthorized: You are only allowed to manage AI knowledge for your assigned subjects: ' + assignedSubjects.join(', '));
        }

        const parsedKeywords = (keywords || '')
            .split(/[,;\n]+/)
            .map(k => k.trim())
            .filter(Boolean);

        const newEntry = new AIKnowledge({
            title: title.trim(),
            classLevel: (classLevel || 'All Classes').trim(),
            subject: subject.trim(),
            topic: (topic || '').trim(),
            keywords: parsedKeywords,
            content: content.trim(),
            priority: parseInt(priority, 10) || 100,
            isActive: isActive === 'true' || isActive === true || isActive === 'on',
            createdBy: user._id
        });

        await newEntry.save();
        await logActivity(req, 'TEACHER_CREATE_AI_KNOWLEDGE', `Teacher created AI Knowledge rule: ${newEntry.title} for ${newEntry.subject}`, 'AIKnowledge');

        res.redirect('/teacher/ai-knowledge?success=created');
    } catch (err) {
        console.error('Error creating Teacher AI Knowledge:', err);
        res.redirect('/teacher/ai-knowledge?error=create_failed');
    }
});

// POST /teacher/ai-knowledge/:id/edit - Edit rule if within assigned subjects or created by teacher
router.post('/ai-knowledge/:id/edit', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const AIKnowledge = require('../models/AIKnowledge');
        const user = req.session.user;
        const { title, classLevel, subject, topic, keywords, content, priority, isActive } = req.body;

        const entry = await AIKnowledge.findById(req.params.id);
        if (!entry) return res.redirect('/teacher/ai-knowledge?error=not_found');

        const { assignedSubjects } = await getTeacherAssignedContext(user._id);

        // Verify permission
        const isOriginalSubjectPermitted = assignedSubjects.some(s => s.toLowerCase() === entry.subject.toLowerCase());
        const isTargetSubjectPermitted = assignedSubjects.some(s => s.toLowerCase() === (subject || entry.subject).trim().toLowerCase());
        const isOwner = entry.createdBy && entry.createdBy.toString() === user._id.toString();

        if (!isOwner && (!isOriginalSubjectPermitted || !isTargetSubjectPermitted)) {
            return res.status(403).send('Unauthorized: You can only edit knowledge for your assigned subjects.');
        }

        const parsedKeywords = (keywords || '')
            .split(/[,;\n]+/)
            .map(k => k.trim())
            .filter(Boolean);

        entry.title = title ? title.trim() : entry.title;
        entry.classLevel = classLevel ? classLevel.trim() : entry.classLevel;
        entry.subject = subject ? subject.trim() : entry.subject;
        entry.topic = topic !== undefined ? topic.trim() : entry.topic;
        entry.keywords = parsedKeywords;
        entry.content = content ? content.trim() : entry.content;
        entry.priority = priority !== undefined ? parseInt(priority, 10) : entry.priority;
        entry.isActive = isActive === 'true' || isActive === true || isActive === 'on';

        await entry.save();
        await logActivity(req, 'TEACHER_UPDATE_AI_KNOWLEDGE', `Teacher updated AI Knowledge rule: ${entry.title}`, 'AIKnowledge');

        res.redirect('/teacher/ai-knowledge?success=updated');
    } catch (err) {
        console.error('Error updating Teacher AI Knowledge:', err);
        res.redirect('/teacher/ai-knowledge?error=update_failed');
    }
});

// POST /teacher/ai-knowledge/:id/delete - Delete rule
router.post('/ai-knowledge/:id/delete', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const AIKnowledge = require('../models/AIKnowledge');
        const user = req.session.user;

        const entry = await AIKnowledge.findById(req.params.id);
        if (!entry) return res.redirect('/teacher/ai-knowledge?error=not_found');

        const { assignedSubjects } = await getTeacherAssignedContext(user._id);
        const isSubjectPermitted = assignedSubjects.some(s => s.toLowerCase() === entry.subject.toLowerCase());
        const isOwner = entry.createdBy && entry.createdBy.toString() === user._id.toString();

        if (!isOwner && !isSubjectPermitted) {
            return res.status(403).send('Unauthorized to delete this rule.');
        }

        await AIKnowledge.findByIdAndDelete(req.params.id);
        await logActivity(req, 'TEACHER_DELETE_AI_KNOWLEDGE', `Teacher deleted AI Knowledge rule: ${entry.title}`, 'AIKnowledge');

        res.redirect('/teacher/ai-knowledge?success=deleted');
    } catch (err) {
        console.error('Error deleting Teacher AI Knowledge:', err);
        res.redirect('/teacher/ai-knowledge?error=delete_failed');
    }
});

// POST /teacher/ai-knowledge/:id/toggle - Toggle active status
router.post('/ai-knowledge/:id/toggle', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const AIKnowledge = require('../models/AIKnowledge');
        const user = req.session.user;

        const entry = await AIKnowledge.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, error: 'Not found' });

        const { assignedSubjects } = await getTeacherAssignedContext(user._id);
        const isSubjectPermitted = assignedSubjects.some(s => s.toLowerCase() === entry.subject.toLowerCase());
        const isOwner = entry.createdBy && entry.createdBy.toString() === user._id.toString();

        if (!isOwner && !isSubjectPermitted) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        entry.isActive = !entry.isActive;
        await entry.save();

        res.json({ success: true, isActive: entry.isActive });
    } catch (err) {
        console.error('Error toggling Teacher AI Knowledge:', err);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});
// ==========================================
// WRITTEN EVALUATIONS - TEACHER ROUTES
// Strictly restricted to teacher's assigned classes & subjects
// ==========================================

// GET /teacher/written-evaluations - List written submissions
router.get('/written-evaluations', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const QuestionBank = require('../models/QuestionBank');

        const { bankFilter, context, isUnrestricted } = await getTeacherAccessibleBankQuery(user._id, user);

        // Find all question banks matching teacher's class/subject scope
        const accessibleBanks = await QuestionBank.find(bankFilter).select('_id title subject classLevel board year').lean();
        const accessibleBankIds = accessibleBanks.map(b => b._id);

        const statusFilter = req.query.status || 'pending'; // 'pending', 'reviewed', 'all'
        const subjectFilter = req.query.subject || 'all';
        const classFilter = req.query.class || 'all';
        const searchQuery = (req.query.q || '').trim();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(20, parseInt(req.query.limit) || 20);

        // If filtering by subject or class
        let queryBankIds = accessibleBankIds;
        if (subjectFilter !== 'all' || classFilter !== 'all') {
            const sf = subjectFilter.toLowerCase().trim();
            const cf = classFilter.toLowerCase().trim();
            queryBankIds = accessibleBanks.filter(b => {
                let matchSub = true;
                let matchCls = true;
                if (subjectFilter !== 'all') {
                    const bs = String(b.subject || '').toLowerCase().trim();
                    if (sf === 'math' || sf === 'mathematics') {
                        matchSub = bs.includes('math');
                    } else if (sf === 'bangla' || sf === 'bengali') {
                        matchSub = bs.includes('bangla') || bs.includes('bengali');
                    } else if (sf === 'english') {
                        matchSub = bs.includes('english');
                    } else {
                        matchSub = bs === sf;
                    }
                }
                if (classFilter !== 'all') {
                    const bClasses = (Array.isArray(b.classLevel) ? b.classLevel : [b.classLevel]).map(c => String(c || '').toLowerCase().trim());
                    if (cf === 'class 9' || cf === 'class 10') {
                        matchCls = bClasses.some(c => c === cf || c === 'ssc' || c === cf.replace('class ', ''));
                    } else if (cf === 'class 11' || cf === 'class 12') {
                        matchCls = bClasses.some(c => c === cf || c === 'hsc' || c === cf.replace('class ', ''));
                    } else {
                        matchCls = bClasses.some(c => c === cf);
                    }
                }
                return matchSub && matchCls;
            }).map(b => b._id);
        }

        let statusCondition = {};
        if (statusFilter === 'pending') {
            statusCondition = { writtenStatus: 'pending' };
        } else if (statusFilter === 'reviewed') {
            statusCondition = { writtenStatus: 'reviewed' };
        } else {
            statusCondition = { writtenStatus: { $in: ['pending', 'reviewed'] } };
        }

        const attemptQuery = {
            bank: { $in: queryBankIds },
            ...statusCondition
        };

        // Fetch counts for tabs strictly scoped to teacher's accessible banks
        const [pendingCount, reviewedCount, totalCount] = await Promise.all([
            QuestionBankAttempt.countDocuments({
                bank: { $in: accessibleBankIds },
                writtenStatus: 'pending'
            }),
            QuestionBankAttempt.countDocuments({
                bank: { $in: accessibleBankIds },
                writtenStatus: 'reviewed'
            }),
            QuestionBankAttempt.countDocuments({
                bank: { $in: accessibleBankIds },
                writtenStatus: { $in: ['pending', 'reviewed'] }
            })
        ]);

        let attempts = await QuestionBankAttempt.find(attemptQuery)
            .populate('user', 'name email profilePicture profileImage classLevel phone')
            .populate('bank', 'title subject classLevel board year topic addedBy course')
            .populate('teacherReview.reviewedBy', 'name')
            .sort({ submittedAt: -1 })
            .lean();

        // Format clean bank titles and canonical subjects for attempts
        attempts.forEach(att => {
            if (att.bank) {
                const b = att.bank;
                if (!b.title || !b.title.trim()) {
                    const parts = [b.subject, b.topic, b.board, b.year].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
                    b.displayTitle = parts.length > 0 ? parts.join(' - ') : `${b.subject || 'Written Exam'}`;
                } else {
                    b.displayTitle = b.title.trim();
                }

                // Canonical subject display mapping to teacher's assigned subjects
                const rawSub = String(b.subject || '').trim();
                const subLower = rawSub.toLowerCase();
                if (subLower.includes('bangla') || subLower.includes('bengali')) {
                    b.displaySubject = 'Bangla';
                } else if (subLower.includes('english')) {
                    b.displaySubject = 'English';
                } else if (subLower.includes('math')) {
                    b.displaySubject = 'Math';
                } else {
                    b.displaySubject = rawSub || 'Subject';
                }
            }
        });

        // Strict subject safeguard: ensure only attempts with assigned subjects are shown
        if (!isUnrestricted && context.rawAssignedSubjects && context.rawAssignedSubjects.length > 0) {
            attempts = attempts.filter(att => {
                const bSub = String(att.bank?.subject || '').toLowerCase().trim();
                if (bSub === 'general') return false;
                return context.rawAssignedSubjects.some(as => {
                    const asLower = String(as).toLowerCase().trim();
                    if (asLower === 'math' || asLower === 'mathematics') return bSub.includes('math');
                    if (asLower === 'bangla' || asLower === 'bengali') return bSub.includes('bangla') || bSub.includes('bengali');
                    if (asLower === 'english') return bSub.includes('english');
                    return bSub === asLower;
                });
            });
        }

        // Search query filter
        if (searchQuery) {
            const sq = searchQuery.toLowerCase();
            attempts = attempts.filter(att => {
                const uName = (att.user?.name || '').toLowerCase();
                const uEmail = (att.user?.email || '').toLowerCase();
                const bTitle = (att.bank?.displayTitle || att.bank?.title || '').toLowerCase();
                const bSub = (att.bank?.displaySubject || att.bank?.subject || '').toLowerCase();
                return uName.includes(sq) || uEmail.includes(sq) || bTitle.includes(sq) || bSub.includes(sq);
            });
        }

        const totalFiltered = attempts.length;
        const totalPages = Math.ceil(totalFiltered / limit) || 1;
        const paginatedAttempts = attempts.slice((page - 1) * limit, page * limit);

        // Derive subjects and classes for filter dropdowns strictly from teacher's assigned profile
        const availableSubjects = (!isUnrestricted && context.rawAssignedSubjects && context.rawAssignedSubjects.length > 0)
            ? context.rawAssignedSubjects
            : [...new Set(accessibleBanks.map(b => b.subject).filter(Boolean))].sort();

        const availableClasses = (!isUnrestricted && context.rawAssignedClasses && context.rawAssignedClasses.length > 0)
            ? context.rawAssignedClasses
            : [...new Set(accessibleBanks.flatMap(b => Array.isArray(b.classLevel) ? b.classLevel : [b.classLevel]).filter(Boolean))].sort();

        res.render('teacher/written-evaluations', {
            pageTitle: 'Written Exam Evaluations',
            active: 'written-evaluations',
            user,
            attempts: paginatedAttempts,
            pendingCount,
            reviewedCount,
            totalCount,
            statusFilter,
            subjectFilter,
            classFilter,
            searchQuery,
            page,
            totalPages,
            availableSubjects,
            availableClasses,
            assignedSubjects: context.rawAssignedSubjects,
            assignedClasses: context.rawAssignedClasses,
            isUnrestricted,
            successMsg: req.query.success || '',
            errorMsg: req.query.error || ''
        });
    } catch (err) {
        console.error('Error fetching teacher written evaluations:', err);
        res.status(500).send('Server error loading written evaluations');
    }
});

// GET /teacher/written-evaluations/:attemptId - Dedicated evaluation form for a student attempt
router.get('/written-evaluations/:attemptId', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');

        const attempt = await QuestionBankAttempt.findById(req.params.attemptId)
            .populate('user', 'name email profilePicture profileImage classLevel phone')
            .populate('bank')
            .populate('teacherReview.reviewedBy', 'name')
            .lean();

        if (!attempt || !attempt.bank) {
            return res.status(404).render('404', { message: 'Written evaluation submission not found.' });
        }

        // Authorization check: verify teacher has access to this bank
        const { bankFilter, isUnrestricted } = await getTeacherAccessibleBankQuery(user._id, user);
        if (!isUnrestricted) {
            const isAccessible = await QuestionBank.findOne({
                _id: attempt.bank._id,
                ...bankFilter
            });
            if (!isAccessible) {
                return res.status(403).render('404', { message: 'You are not assigned to evaluate this subject or class.' });
            }
        }

        // Fetch questions for this bank
        const questions = await Question.find({ bankId: attempt.bank._id }).sort({ createdAt: 1 }).lean();

        // Filter only written questions (non-MCQ)
        const writtenQuestions = questions.filter(q => q.questionType !== 'MCQ');

        // Map attempt userAnswers
        const uaMap = {};
        (attempt.userAnswers || []).forEach(ua => {
            if (ua.questionId) uaMap[ua.questionId.toString()] = ua;
        });

        const questionsWithAnswers = writtenQuestions.map(q => {
            const ua = uaMap[q._id.toString()] || {};
            const defaultMark = (q.questionType === 'Medium') ? 2 : ((q.questionType === 'Comprehension') ? 7 : 1);
            const qMaxMark = (typeof q.marks === 'number' && q.marks > 0) ? q.marks : (ua.maxMarks || defaultMark);
            return {
                ...q,
                maxMarks: qMaxMark,
                userAnswer: ua
            };
        });

        res.render('teacher/written-evaluation-form', {
            pageTitle: 'Evaluate Written Submission',
            active: 'written-evaluations',
            user,
            attempt,
            bank: attempt.bank,
            student: attempt.user,
            questions: questionsWithAnswers,
            successMsg: req.query.success || '',
            errorMsg: req.query.error || ''
        });
    } catch (err) {
        console.error('Error opening written evaluation form:', err);
        res.status(500).send('Server error opening evaluation');
    }
});

// POST /teacher/written-evaluations/:attemptId - Submit evaluation marks and feedback
router.post('/written-evaluations/:attemptId', teacherProtect, async (req, res) => {
    try {
        await connectDB();
        const user = req.session.user;
        const QuestionBankAttempt = require('../models/QuestionBankAttempt');
        const QuestionBank = require('../models/QuestionBank');
        const Question = require('../models/Question');
        const Notification = require('../models/Notification');

        const attempt = await QuestionBankAttempt.findById(req.params.attemptId).populate('bank');
        if (!attempt || !attempt.bank) {
            return res.status(404).json({ success: false, error: 'Attempt not found' });
        }

        // Authorization check
        const { bankFilter, isUnrestricted } = await getTeacherAccessibleBankQuery(user._id, user);
        if (!isUnrestricted) {
            const isAccessible = await QuestionBank.findOne({
                _id: attempt.bank._id,
                ...bankFilter
            });
            if (!isAccessible) {
                return res.status(403).json({ success: false, error: 'Unauthorized to evaluate this subject or class.' });
            }
        }

        // Fetch questions
        const questions = await Question.find({ bankId: attempt.bank._id }).lean();
        const qMap = new Map();
        questions.forEach(q => qMap.set(q._id.toString(), q));

        let totalWrittenEarned = 0;
        let totalWrittenMax = 0;

        // Update each answer in attempt.userAnswers
        attempt.userAnswers.forEach((ua, idx) => {
            if (ua.questionType !== 'MCQ') {
                const qIdStr = ua.questionId ? ua.questionId.toString() : String(idx);
                const qObj = qMap.get(qIdStr);
                const isComprehension = (ua.questionType === 'Comprehension') || (qObj && qObj.questionType === 'Comprehension');
                const defaultMark = (ua.questionType === 'Medium') ? 2 : (isComprehension ? 7 : 1);
                const maxM = (qObj && typeof qObj.marks === 'number' && qObj.marks > 0) ? qObj.marks : (ua.maxMarks || defaultMark);

                ua.maxMarks = maxM;

                let markObtained = 0;
                if (isComprehension) {
                    // Check for individual sub-question marks (Question 1 out of 3, Question 2 out of 4)
                    let q1Input = req.body[`marks_${qIdStr}_q1`];
                    if (q1Input === undefined) q1Input = req.body[`marks_${idx}_q1`];
                    let q2Input = req.body[`marks_${qIdStr}_q2`];
                    if (q2Input === undefined) q2Input = req.body[`marks_${idx}_q2`];

                    if (q1Input !== undefined || q2Input !== undefined) {
                        const q1Val = parseFloat(q1Input);
                        const q2Val = parseFloat(q2Input);
                        const q1Mark = isNaN(q1Val) ? 0 : Math.max(0, Math.min(3, q1Val));
                        const q2Mark = isNaN(q2Val) ? 0 : Math.max(0, Math.min(4, q2Val));
                        ua.q1Marks = q1Mark;
                        ua.q2Marks = q2Mark;
                        markObtained = q1Mark + q2Mark;
                    } else {
                        let inputMark = req.body[`marks_${qIdStr}`];
                        if (inputMark === undefined) inputMark = req.body[`marks_${idx}`];
                        const numMark = parseFloat(inputMark);
                        markObtained = isNaN(numMark) ? 0 : Math.max(0, Math.min(maxM, numMark));
                    }
                } else {
                    // Read mark from form
                    let inputMark = req.body[`marks_${qIdStr}`];
                    if (inputMark === undefined) {
                        inputMark = req.body[`marks_${idx}`];
                    }
                    const numMark = parseFloat(inputMark);
                    markObtained = isNaN(numMark) ? 0 : Math.max(0, Math.min(maxM, numMark));
                }

                // Read comment from form
                let inputComment = req.body[`comment_${qIdStr}`];
                if (inputComment === undefined) {
                    inputComment = req.body[`comment_${idx}`];
                }
                const commQ1 = req.body[`comment_${qIdStr}_q1`] !== undefined ? req.body[`comment_${qIdStr}_q1`] : req.body[`comment_${idx}_q1`];
                const commQ2 = req.body[`comment_${qIdStr}_q2`] !== undefined ? req.body[`comment_${qIdStr}_q2`] : req.body[`comment_${idx}_q2`];
                if (commQ1 || commQ2) {
                    const cParts = [];
                    if (commQ1 && commQ1.trim()) cParts.push(`[Question 1]: ${commQ1.trim()}`);
                    if (commQ2 && commQ2.trim()) cParts.push(`[Question 2]: ${commQ2.trim()}`);
                    inputComment = cParts.join('\n\n');
                }

                // Read image attachment from form (base64 DataURL or existing image path)
                let inputImage = req.body[`image_${qIdStr}`];
                if (!inputImage) inputImage = req.body[`image_${idx}`];
                if (!inputImage) inputImage = req.body[`image_${qIdStr}_q1`] || req.body[`image_${idx}_q1`];
                if (!inputImage) inputImage = req.body[`image_${qIdStr}_q2`] || req.body[`image_${idx}_q2`];

                if (typeof inputImage === 'string' && inputImage.startsWith('data:image/')) {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const matches = inputImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                        if (matches && matches.length === 3) {
                            const mimeType = matches[1].toLowerCase();
                            let ext = 'png';
                            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
                            else if (mimeType.includes('webp')) ext = 'webp';
                            else if (mimeType.includes('gif')) ext = 'gif';
                            
                            const buffer = Buffer.from(matches[2], 'base64');
                            const uploadDir = path.join(__dirname, '../../client/public/uploads/evaluations');
                            fs.mkdirSync(uploadDir, { recursive: true });
                            const filename = `eval-${Date.now()}-${idx}.${ext}`;
                            fs.writeFileSync(path.join(uploadDir, filename), buffer);
                            ua.teacherImage = `/uploads/evaluations/${filename}`;
                        }
                    } catch (imgErr) {
                        console.warn('Failed to save teacher image file:', imgErr);
                    }
                } else if (typeof inputImage === 'string') {
                    ua.teacherImage = inputImage.trim();
                }

                ua.marksObtained = markObtained;
                ua.teacherComment = (inputComment || '').trim();
                ua.isReviewed = true;

                totalWrittenEarned += markObtained;
                totalWrittenMax += maxM;
            }
        });

        // Set overall teacher review
        const overallFeedback = (req.body.overallFeedback || '').trim();
        let overallImage = (req.body.overallImage || '').trim();
        if (typeof overallImage === 'string' && overallImage.startsWith('data:image/')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const matches = overallImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = matches[1].toLowerCase();
                    let ext = 'png';
                    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
                    else if (mimeType.includes('webp')) ext = 'webp';
                    else if (mimeType.includes('gif')) ext = 'gif';
                    
                    const buffer = Buffer.from(matches[2], 'base64');
                    const uploadDir = path.join(__dirname, '../../client/public/uploads/evaluations');
                    fs.mkdirSync(uploadDir, { recursive: true });
                    const filename = `overall-${Date.now()}.${ext}`;
                    fs.writeFileSync(path.join(uploadDir, filename), buffer);
                    overallImage = `/uploads/evaluations/${filename}`;
                }
            } catch (overallImgErr) {
                console.warn('Failed to save overall teacher image file:', overallImgErr);
            }
        }

        attempt.teacherReview = {
            reviewedBy: user._id,
            reviewerName: user.name || 'Teacher',
            reviewedAt: new Date(),
            overallFeedback,
            overallImage: overallImage || '',
            totalWrittenScore: totalWrittenEarned,
            maxWrittenScore: totalWrittenMax
        };
        attempt.writtenStatus = 'reviewed';
        attempt.markModified('userAnswers');
        attempt.markModified('teacherReview');

        await attempt.save();

        // Send notification to student
        try {
            const bankTitle = attempt.bank.title || attempt.bank.subject || 'Written Exam';
            await Notification.create({
                user: attempt.user,
                title: 'Written Exam Evaluated',
                message: `Your written submission for "${bankTitle}" has been evaluated by ${user.name}. Your written score: ${totalWrittenEarned}/${totalWrittenMax}.`,
                type: 'exam',
                link: `/question-bank/written-evaluation/${attempt._id}`
            });
        } catch (notifErr) {
            console.warn('Failed to send evaluation notification:', notifErr);
        }

        // Log system activity
        await logActivity(req, 'UPDATE', `Evaluated written exam attempt ${attempt._id} with score ${totalWrittenEarned}/${totalWrittenMax}`, 'QuestionBankAttempt', attempt._id);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, redirectUrl: `/teacher/written-evaluations?success=Evaluation+saved+successfully` });
        }

        res.redirect('/teacher/written-evaluations?success=Evaluation+saved+successfully');
    } catch (err) {
        console.error('Error saving teacher written evaluation:', err);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect(`/teacher/written-evaluations/${req.params.attemptId}?error=Failed+to+save+evaluation`);
    }
});

module.exports = router;

