const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const AcademicClass = require('../models/AcademicClass');
const User = require('../models/User');
const Course = require('../models/Course');
const Folder = require('../models/Folder');
const { connectDB } = require('../config');
const { normalizeClass, getLinkedClasses } = require('../utils/academicHelper');

// Escape regex special characters
const escapeRegex = (s) => String(s || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Automatically ensure that the Subject folder and Chapter subfolder exist in Notes for the specified classes
const ensureSyllabusFoldersForChapter = async (targetClasses, subjectName, chapterName, userId = null) => {
    if (!subjectName || !chapterName || !targetClasses) return;
    const cleanSubject = String(subjectName).trim();
    const cleanChapter = String(chapterName).trim();
    if (!cleanSubject || !cleanChapter) return;

    const classes = Array.isArray(targetClasses) ? targetClasses : [targetClasses];

    for (const rawCls of classes) {
        const cls = String(rawCls || '').trim();
        if (!cls) continue;

        try {
            // 1. Ensure Top-level Subject Folder for this class (parentId: null)
            let subjectFolder = await Folder.findOne({
                name: new RegExp('^' + escapeRegex(cleanSubject) + '$', 'i'),
                classLevel: new RegExp('^' + escapeRegex(cls) + '$', 'i'),
                $or: [{ parentId: null }, { parentId: '' }, { parentId: 'null' }]
            });

            if (!subjectFolder) {
                subjectFolder = await Folder.create({
                    name: cleanSubject,
                    subject: cleanSubject,
                    classLevel: cls,
                    parentId: null,
                    isSyllabusFolder: true,
                    isSystem: true,
                    addedBy: userId || null
                });
            } else if (!subjectFolder.isSyllabusFolder || !subjectFolder.isSystem) {
                subjectFolder.isSyllabusFolder = true;
                subjectFolder.isSystem = true;
                await subjectFolder.save().catch(() => {});
            }

            // 2. Ensure Chapter Subfolder under this Subject Folder for this class
            let chapterFolder = await Folder.findOne({
                name: new RegExp('^' + escapeRegex(cleanChapter) + '$', 'i'),
                classLevel: new RegExp('^' + escapeRegex(cls) + '$', 'i'),
                parentId: String(subjectFolder._id)
            });

            if (!chapterFolder) {
                chapterFolder = await Folder.create({
                    name: cleanChapter,
                    subject: cleanSubject,
                    classLevel: cls,
                    parentId: String(subjectFolder._id),
                    isSyllabusFolder: true,
                    isSystem: true,
                    addedBy: userId || null
                });
            } else if (!chapterFolder.isSyllabusFolder || !chapterFolder.isSystem) {
                chapterFolder.isSyllabusFolder = true;
                chapterFolder.isSystem = true;
                await chapterFolder.save().catch(() => {});
            }
        } catch (err) {
            console.error('ensureSyllabusFoldersForChapter error for ' + cls + ' - ' + cleanSubject + ' - ' + cleanChapter + ':', err.message);
        }
    }
};

// Sync all existing approved topics into Subject folders and Chapter subfolders in Notes
const syncAllSyllabusFolders = async () => {
    try {
        const approvedTopics = await Topic.find({
            isArchived: { $ne: true },
            status: { $nin: ['pending', 'rejected'] },
            'chapter.name': { $exists: true, $ne: '' }
        }).select('classLevel subject chapter createdBy submittedBy').lean();

        const seen = new Set();
        for (const t of approvedTopics) {
            const cls = (t.classLevel || '').trim();
            const subj = (t.subject || '').trim();
            const chap = (t.chapter?.name || '').trim();
            if (!cls || !subj || !chap) continue;
            const key = cls.toLowerCase() + ':::' + subj.toLowerCase() + ':::' + chap.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                await ensureSyllabusFoldersForChapter([cls], subj, chap, t.createdBy || t.submittedBy);
            }
        }
    } catch (err) {
        console.error('syncAllSyllabusFolders error:', err.message);
    }
};


// Helper to automatically register/ensure a subject exists in AcademicClass
const ensureSubjectInAcademicClass = async (clsName, subjectName, groupName) => {
    try {
        if (!clsName || !subjectName) return;
        const cleanName = clsName.trim();
        const cleanSub = subjectName.trim();
        const ac = await AcademicClass.findOne({ 
            name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i'),
            isArchived: { $ne: true }
        });
        if (!ac) return;

        let modified = false;
        if (!ac.subjects) ac.subjects = [];
        if (!ac.subjects.some(s => s.toLowerCase() === cleanSub.toLowerCase())) {
            ac.subjects.push(cleanSub);
            modified = true;
        }

        const grp = groupName ? String(groupName).trim() : 'common';
        if (ac.hasGroups && ac.groups && ac.groups.length > 0) {
            if (grp.toLowerCase() === 'common' || grp.toLowerCase() === 'all' || grp.toLowerCase() === 'none') {
                if (!ac.commonSubjects) ac.commonSubjects = [];
                if (!ac.commonSubjects.some(s => s.toLowerCase() === cleanSub.toLowerCase())) {
                    ac.commonSubjects.push(cleanSub);
                    modified = true;
                }
            } else {
                const targetGrp = ac.groups.find(g => g.name.toLowerCase() === grp.toLowerCase());
                if (targetGrp) {
                    if (!targetGrp.subjects) targetGrp.subjects = [];
                    if (!targetGrp.subjects.some(s => s.toLowerCase() === cleanSub.toLowerCase())) {
                        targetGrp.subjects.push(cleanSub);
                        modified = true;
                    }
                }
            }
        } else {
            if (!ac.commonSubjects) ac.commonSubjects = [];
            if (!ac.commonSubjects.some(s => s.toLowerCase() === cleanSub.toLowerCase())) {
                ac.commonSubjects.push(cleanSub);
                modified = true;
            }
        }

        if (modified) {
            ac.markModified('subjects');
            ac.markModified('commonSubjects');
            ac.markModified('groups');
            await ac.save();
        }
    } catch (err) {
        console.warn('ensureSubjectInAcademicClass warning:', err.message);
    }
};

// Add Subject across Multiple Classes simultaneously
const addSubjectToClasses = async (req, res) => {
    try {
        await connectDB();
        const { subjectName, classLevels, group } = req.body;

        if (!subjectName || !subjectName.trim()) {
            return res.status(400).json({ success: false, error: 'Subject name is required' });
        }

        let targetClasses = [];
        if (Array.isArray(classLevels)) {
            targetClasses = classLevels.map(c => String(c || '').trim()).filter(Boolean);
        } else if (typeof classLevels === 'string') {
            targetClasses = classLevels.split(',').map(c => c.trim()).filter(Boolean);
        }

        if (targetClasses.length === 0) {
            return res.status(400).json({ success: false, error: 'Please select at least one class' });
        }

        const cleanSubject = subjectName.trim();
        const cleanGroup = (group || 'common').trim();

        const updatedClasses = [];
        for (const clsName of targetClasses) {
            const ac = await AcademicClass.findOne({ 
                name: new RegExp(`^${escapeRegex(clsName)}$`, 'i'),
                isArchived: { $ne: true }
            });
            if (!ac) continue;

            let modified = false;
            if (!ac.subjects) ac.subjects = [];
            if (!ac.subjects.some(s => s.toLowerCase() === cleanSubject.toLowerCase())) {
                ac.subjects.push(cleanSubject);
                modified = true;
            }

            if (ac.hasGroups && ac.groups && ac.groups.length > 0) {
                if (cleanGroup.toLowerCase() === 'common' || cleanGroup.toLowerCase() === 'all' || cleanGroup.toLowerCase() === 'none') {
                    if (!ac.commonSubjects) ac.commonSubjects = [];
                    if (!ac.commonSubjects.some(s => s.toLowerCase() === cleanSubject.toLowerCase())) {
                        ac.commonSubjects.push(cleanSubject);
                        modified = true;
                    }
                } else {
                    const targetGroupObj = ac.groups.find(g => g.name.toLowerCase() === cleanGroup.toLowerCase());
                    if (targetGroupObj) {
                        if (!targetGroupObj.subjects) targetGroupObj.subjects = [];
                        if (!targetGroupObj.subjects.some(s => s.toLowerCase() === cleanSubject.toLowerCase())) {
                            targetGroupObj.subjects.push(cleanSubject);
                            modified = true;
                        }
                    }
                }
            } else {
                if (!ac.commonSubjects) ac.commonSubjects = [];
                if (!ac.commonSubjects.some(s => s.toLowerCase() === cleanSubject.toLowerCase())) {
                    ac.commonSubjects.push(cleanSubject);
                    modified = true;
                }
            }

            if (modified) {
                ac.markModified('subjects');
                ac.markModified('commonSubjects');
                ac.markModified('groups');
                await ac.save();
                updatedClasses.push(ac.name);
            }
        }

        if (req.app && req.app.get && req.app.get('clearAcademicCache')) {
            try { req.app.get('clearAcademicCache')(); } catch(_) {}
        }

        return res.json({
            success: true,
            message: `Subject "${cleanSubject}" successfully added to ${targetClasses.length} class(es): ${targetClasses.join(', ')}`,
            subject: cleanSubject,
            updatedClasses
        });
    } catch (err) {
        console.error('addSubjectToClasses Error:', err);
        return res.status(500).json({ success: false, error: 'Server error: ' + err.message });
    }
};

// Copy Selected Topics to Target Classes
const copyTopicsToClasses = async (req, res) => {
    try {
        await connectDB();
        const { topicIds, targetClasses } = req.body;

        if (!Array.isArray(topicIds) || topicIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Please select at least one topic to copy' });
        }
        if (!Array.isArray(targetClasses) || targetClasses.length === 0) {
            return res.status(400).json({ success: false, error: 'Please select at least one target class' });
        }

        const sourceTopics = await Topic.find({ _id: { $in: topicIds }, isArchived: { $ne: true } }).lean();
        if (sourceTopics.length === 0) {
            return res.status(404).json({ success: false, error: 'No active source topics found to copy' });
        }

        let totalCopied = 0;
        for (const targetClass of targetClasses) {
            for (const st of sourceTopics) {
                const existing = await Topic.findOne({
                    classLevel: new RegExp(`^${escapeRegex(targetClass)}$`, 'i'),
                    subject: new RegExp(`^${escapeRegex(st.subject)}$`, 'i'),
                    name: new RegExp(`^${escapeRegex(st.name)}$`, 'i'),
                    'chapter.name': new RegExp(`^${escapeRegex(st.chapter.name)}$`, 'i'),
                    isArchived: { $ne: true }
                });

                if (!existing) {
                    await Topic.create({
                        name: st.name,
                        code: st.code,
                        classLevel: targetClass,
                        group: st.group,
                        subject: st.subject,
                        chapter: st.chapter,
                        difficulty: st.difficulty,
                        keywords: st.keywords,
                        description: st.description,
                        order: st.order,
                        status: 'approved',
                        createdBy: req.session && req.session.user ? req.session.user._id : null
                    });
                    totalCopied++;
                }
            }

            for (const st of sourceTopics) {
                await ensureSubjectInAcademicClass(targetClass, st.subject, st.group);
            }
        }

        return res.json({
            success: true,
            count: totalCopied,
            message: `Successfully copied ${totalCopied} topic(s) to ${targetClasses.length} class(es): ${targetClasses.join(', ')}`
        });
    } catch (err) {
        console.error('copyTopicsToClasses Error:', err);
        return res.status(500).json({ success: false, error: 'Server error: ' + err.message });
    }
};

// Default initial sample topics seed for rich initial UX if collection is empty
const seedDefaultTopicsIfEmpty = async () => {
    try {
        const count = await Topic.countDocuments();
        if (count > 0) return;

        const defaultTopics = [
            // Class 9 / 10 - Physics
            {
                name: 'স্কেলার ও ভেক্টর রাশি (Scalar & Vector Quantities)',
                code: 'PHY-C2-T01',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 2, name: 'অধ্যায় ২: গতি (Motion)' },
                difficulty: 'Easy',
                keywords: ['scalar', 'vector', 'magnitude', 'direction'],
                description: 'স্কেলার ও ভেক্টর রাশির মৌলিক ধারণা ও পার্থক্য',
                order: 1
            },
            {
                name: 'দূরত্ব ও সরণ (Distance & Displacement)',
                code: 'PHY-C2-T02',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 2, name: 'অধ্যায় ২: গতি (Motion)' },
                difficulty: 'Easy',
                keywords: ['distance', 'displacement', 'motion'],
                description: 'দূরত্ব ও সরণের পার্থক্য ও গাণিতিক প্রয়োগ',
                order: 2
            },
            {
                name: 'দ্রুতি ও বেগ (Speed & Velocity)',
                code: 'PHY-C2-T03',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 2, name: 'অধ্যায় ২: গতি (Motion)' },
                difficulty: 'Medium',
                keywords: ['speed', 'velocity', 'instantaneous velocity'],
                description: 'গড় দ্রুতি, গড় বেগ ও তাৎক্ষণিক বেগ নির্ণয়',
                order: 3
            },
            {
                name: 'ত্বরণ ও মন্দন (Acceleration & Deceleration)',
                code: 'PHY-C2-T04',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 2, name: 'অধ্যায় ২: গতি (Motion)' },
                difficulty: 'Medium',
                keywords: ['acceleration', 'deceleration', 'uniform acceleration'],
                description: 'সুষম ও অসম ত্বরণ এবং গতির সমীকরণ প্রতিপাদন',
                order: 4
            },
            {
                name: 'পড়ন্ত বস্তুর সূত্রাবলী (Laws of Falling Bodies)',
                code: 'PHY-C2-T05',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 2, name: 'অধ্যায় ২: গতি (Motion)' },
                difficulty: 'Hard',
                keywords: ['gravity', 'free fall', 'galileo'],
                description: 'গ্যালিলিওর সূত্র ও অভিকর্ষজ ত্বরণ সংক্রান্ত সমস্যা',
                order: 5
            },

            // Chapter 3: বল (Force)
            {
                name: 'জড়তা ও নিউটনের ১ম সূত্র (Inertia & Newton\'s 1st Law)',
                code: 'PHY-C3-T01',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 3, name: 'অধ্যায় ৩: বল (Force)' },
                difficulty: 'Easy',
                keywords: ['inertia', 'newton first law', 'mass'],
                description: 'স্থিতিজড়তা ও গতিজড়তা সংক্রান্ত বাস্তব উদাহরণ',
                order: 1
            },
            {
                name: 'ভরবেগ ও নিউটনের ২য় সূত্র (Momentum & Newton\'s 2nd Law)',
                code: 'PHY-C3-T02',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 3, name: 'অধ্যায় ৩: বল (Force)' },
                difficulty: 'Medium',
                keywords: ['momentum', 'f=ma', 'newton second law'],
                description: 'F = ma সমীকরণ ও ভরবেগের পরিবর্তনের হার',
                order: 2
            },
            {
                name: 'নিউটনের ৩য় সূত্র ও ঘর্ষণ বল (Newton\'s 3rd Law & Friction)',
                code: 'PHY-C3-T03',
                classLevel: 'Class 9',
                group: 'Science',
                subject: 'Physics',
                chapter: { number: 3, name: 'অধ্যায় ৩: বল (Force)' },
                difficulty: 'Hard',
                keywords: ['action reaction', 'friction', 'coefficient'],
                description: 'ক্রিয়া-প্রতিক্রিয়া এবং ঘর্ষণ বলের প্রকারভেদ',
                order: 3
            }
        ];

        await Topic.insertMany(defaultTopics);
        console.log('✅ Seeded default NCTB topics for ODDHAY');
    } catch (e) {
        console.warn('Topic seed warning:', e.message);
    }
};

// Render Main Topics & Syllabus Page
const getTopicsPage = async (req, res) => {
    try {
        await connectDB();
        await seedDefaultTopicsIfEmpty();

        const classes = await AcademicClass.find({ isArchived: { $nin: [true, 'true', 1] } }).sort({ order: 1 }).lean();
        
        let rawClass = req.query.classLevels || req.query.classLevel || '';
        let selectedClasses = [];
        if (Array.isArray(rawClass)) {
            selectedClasses = rawClass.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof rawClass === 'string' && rawClass.trim()) {
            selectedClasses = rawClass.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (selectedClasses.length === 0 && classes.length > 0) {
            selectedClasses = [classes[0].name];
        }

        let selectedClass = selectedClasses[0] || '';
        let selectedGroup = (req.query.group || 'all').trim();
        let selectedSubject = (req.query.subject || '').trim();

        const currentClassObj = classes.find(c => c.name.toLowerCase() === selectedClass.toLowerCase()) || classes[0] || null;

        // Resolve available subjects across ALL selected classes
        let availableSubjectsSet = new Set();
        selectedClasses.forEach(clsName => {
            const clsObj = classes.find(c => c.name.toLowerCase() === clsName.toLowerCase());
            if (clsObj) {
                if (clsObj.hasGroups && clsObj.groups && clsObj.groups.length > 0) {
                    if (selectedGroup && selectedGroup !== 'all') {
                        const grp = clsObj.groups.find(g => g.name.toLowerCase() === selectedGroup.toLowerCase());
                        if (grp && grp.subjects) grp.subjects.forEach(s => availableSubjectsSet.add(s));
                        if (clsObj.commonSubjects) clsObj.commonSubjects.forEach(s => availableSubjectsSet.add(s));
                    } else {
                        if (clsObj.commonSubjects) clsObj.commonSubjects.forEach(s => availableSubjectsSet.add(s));
                        if (clsObj.subjects) clsObj.subjects.forEach(s => availableSubjectsSet.add(s));
                        clsObj.groups.forEach(g => (g.subjects || []).forEach(s => availableSubjectsSet.add(s)));
                    }
                } else {
                    (clsObj.subjects || []).forEach(s => availableSubjectsSet.add(s));
                    (clsObj.commonSubjects || []).forEach(s => availableSubjectsSet.add(s));
                }
            }
        });
        let availableSubjects = Array.from(availableSubjectsSet);

        // Default subject
        if (!selectedSubject && availableSubjects.length > 0) {
            selectedSubject = availableSubjects[0];
        }

        // Active Topics Query (Only Approved topics go to Live Syllabus)
        const activeFilter = { isArchived: { $nin: [true, 'true', 1] }, status: { $nin: ['pending', 'rejected'] } };
        if (selectedClasses.length === 1) {
            activeFilter.classLevel = new RegExp(`^${escapeRegex(selectedClasses[0])}$`, 'i');
        } else if (selectedClasses.length > 1) {
            activeFilter.classLevel = { $in: selectedClasses.map(c => new RegExp(`^${escapeRegex(c)}$`, 'i')) };
        }
        if (selectedSubject) {
            activeFilter.subject = new RegExp(`^${escapeRegex(selectedSubject)}$`, 'i');
        }
        if (selectedGroup && selectedGroup !== 'all') {
            activeFilter.group = { $in: [selectedGroup, 'all', 'None', null] };
        }

        const activeTopics = await Topic.find(activeFilter).sort({ 'chapter.number': 1, order: 1, createdAt: 1 }).lean();

        // Group Active Topics by Chapter
        const chaptersMap = new Map();
        activeTopics.forEach(top => {
            const chName = (top.chapter && top.chapter.name) ? top.chapter.name.trim() : 'General / অধ্যায়হীন';
            const chNum = (top.chapter && typeof top.chapter.number === 'number') ? top.chapter.number : 1;
            if (!chaptersMap.has(chName)) {
                chaptersMap.set(chName, {
                    name: chName,
                    number: chNum,
                    topics: []
                });
            }
            chaptersMap.get(chName).topics.push(top);
        });

        const chapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);

        // Archived Topics (History Bucket)
        const archivedTopics = await Topic.find({ isArchived: { $in: [true, 'true', 1] } }).sort({ updatedAt: -1 }).lean();

        // Pending Submissions Query (Awaiting Admin Review)
        const pendingTopics = await Topic.find({ 
            status: 'pending', 
            isArchived: { $nin: [true, 'true', 1] } 
        }).populate('submittedBy', 'name email profilePicture profileImage').populate('createdBy', 'name email profilePicture profileImage').sort({ createdAt: -1 }).lean();
        const pendingTopicCount = await Topic.countDocuments({ status: 'pending', isArchived: { $nin: [true, 'true', 1] } });

        // Overall Global Counts
        const totalTopicCount = await Topic.countDocuments({ isArchived: { $nin: [true, 'true', 1] }, status: { $nin: ['pending', 'rejected'] } });
        const archivedTopicCount = archivedTopics.length;

        const apiBase = req.baseUrl || (req.path.startsWith('/admin') ? '/admin' : '/superadmin');

        res.render('superadmin/topics', {
            active: 'topics',
            user: req.session.user || { name: 'Super Admin', role: 'superadmin', theme: 'light' },
            classes: classes || [],
            currentClassObj,
            selectedClass,
            selectedGroup,
            selectedSubject,
            availableSubjects,
            chapters,
            activeTopics,
            archivedTopics,
            totalTopicCount,
            archivedTopicCount,
            pendingTopics,
            pendingTopicCount,
            apiBase
        });
    } catch (error) {
        console.error('getTopicsPage Error:', error);
        res.status(500).send('Server Error loading topics: ' + error.message);
    }
};

// API: Filtered Topics lookup for Question Bank / Quizzes / Modals
const getTopicsApi = async (req, res) => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 1) {
            try {
                await connectDB();
            } catch (dbErr) {
                console.warn('[getTopicsApi] DB connect warning:', dbErr.message);
            }
        }
        const { classLevel, subject, chapter, group } = req.query;

        const filter = { isArchived: { $nin: [true, 'true', 1] }, status: { $nin: ['pending', 'rejected'] } };
        const rawClass = req.query.classLevels || classLevel || req.query['classLevels[]'] || req.query['classLevel[]'];
        if (rawClass && rawClass !== 'all') {
            let classList = [];
            if (Array.isArray(rawClass)) {
                classList = rawClass.flatMap(c => String(c).split(',')).map(c => c.trim()).filter(Boolean);
            } else {
                classList = String(rawClass).split(',').map(c => c.trim()).filter(Boolean);
            }

            const expandedClasses = new Set();
            classList.forEach(c => {
                expandedClasses.add(c);
                try {
                    const norm = normalizeClass(c);
                    if (norm) expandedClasses.add(norm);
                    const linked = getLinkedClasses(c);
                    if (Array.isArray(linked)) linked.forEach(l => expandedClasses.add(l));
                } catch (e) {}
            });
            const finalClassList = Array.from(expandedClasses).filter(Boolean);

            if (finalClassList.length === 1) {
                filter.classLevel = new RegExp('^' + escapeRegex(finalClassList[0]) + '$', 'i');
            } else if (finalClassList.length > 1) {
                filter.classLevel = new RegExp('^(?:' + finalClassList.map(escapeRegex).join('|') + ')$', 'i');
            }
        }
        if (subject && subject !== 'all') {
            filter.subject = new RegExp('^' + escapeRegex(subject.trim()) + '$', 'i');
        }
        if (chapter && chapter !== 'all') {
            filter['chapter.name'] = new RegExp('^' + escapeRegex(chapter.trim()) + '$', 'i');
        }
        if (group && group !== 'all') {
            filter.group = { $in: [group, 'all', 'None', null] };
        }

        const topics = await Topic.find(filter).sort({ 'chapter.number': 1, order: 1, name: 1 }).lean();
        const chapterList = Array.from(new Set(topics.map(t => (t.chapter && t.chapter.name) ? t.chapter.name : '').filter(Boolean)));

        res.json({
            success: true,
            count: topics.length,
            topics: topics || [],
            chapters: chapterList
        });
    } catch (error) {
        console.error('getTopicsApi Error:', error);
        res.status(200).json({
            success: true,
            count: 0,
            topics: [],
            chapters: [],
            warning: error.message
        });
    }
};

// API: Get existing chapters for a class and subject to check for duplicates
const getChaptersApi = async (req, res) => {
    try {
        await connectDB();
        const { classLevel, subject } = req.query;
        if (!classLevel || !subject) {
            return res.json({ success: true, chapters: [] });
        }

        const escClass = classLevel.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escSub = subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const filter = {
            isArchived: { $nin: [true, 'true', 1] },
            status: { $nin: ['rejected'] },
            classLevel: new RegExp(`^${escClass}$`, 'i'),
            subject: new RegExp(`^${escSub}$`, 'i')
        };

        const topics = await Topic.find(filter).select('chapter status').lean();
        const chaptersMap = new Map();

        topics.forEach(t => {
            if (t.chapter && t.chapter.name) {
                const name = t.chapter.name.trim();
                const num = (typeof t.chapter.number === 'number') ? t.chapter.number : (parseInt(t.chapter.number, 10) || 1);
                const key = `${num}_${name.toLowerCase()}`;
                if (!chaptersMap.has(key)) {
                    chaptersMap.set(key, {
                        number: num,
                        name: name,
                        status: t.status || 'approved'
                    });
                }
            }
        });

        const chapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);
        res.json({ success: true, chapters });
    } catch (error) {
        console.error('getChaptersApi Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create Single Topic (Supports Multiple Classes at once)
const createTopic = async (req, res) => {
    try {
        await connectDB();
        const { name, code, classLevel, classLevels, group, subject, chapterName, chapterNumber, difficulty, keywords, description, order } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Topic name is required' });
        if (!subject || !subject.trim()) return res.status(400).json({ success: false, error: 'Subject is required' });
        if (!chapterName || !chapterName.trim()) return res.status(400).json({ success: false, error: 'Chapter name is required' });

        // Normalize target classes (supports multiple classes at once!)
        let targetClasses = [];
        if (Array.isArray(classLevels) && classLevels.length > 0) {
            targetClasses = classLevels.map(s => String(s || '').trim()).filter(Boolean);
        } else if (Array.isArray(classLevel) && classLevel.length > 0) {
            targetClasses = classLevel.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof classLevel === 'string' && classLevel.includes(',')) {
            targetClasses = classLevel.split(',').map(s => s.trim()).filter(Boolean);
        } else if (typeof classLevel === 'string' && classLevel.trim()) {
            targetClasses = [classLevel.trim()];
        }

        if (targetClasses.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one class level is required' });
        }

        const keywordsArray = Array.isArray(keywords) 
            ? keywords.map(s => String(s || '').trim()).filter(Boolean)
            : String(keywords || '').split(',').map(s => s.trim()).filter(Boolean);

        const isTeacher = req.session && req.session.user && req.session.user.role === 'teacher';
        const topicStatus = isTeacher ? 'pending' : 'approved';

        if (isTeacher) {
            const { assignedClasses, assignedSubjects } = await getTeacherAssignments(req.session.user._id);
            for (const cls of targetClasses) {
                if (assignedClasses.length > 0 && !matchesClass(cls, assignedClasses)) {
                    return res.status(403).json({ success: false, error: `You are not assigned to class "${cls}"` });
                }
            }
            if (assignedSubjects.length > 0 && !matchesSubject(subject, assignedSubjects)) {
                return res.status(403).json({ success: false, error: `You are not assigned to subject "${subject}"` });
            }
        }

        // Support editing/resubmitting an existing submission
        const editingTopicId = req.body.topicId || req.body.id || req.body.editId;
        if (editingTopicId && mongoose.Types.ObjectId.isValid(editingTopicId)) {
            const existingTopic = await Topic.findById(editingTopicId);
            if (existingTopic) {
                if (isTeacher && existingTopic.submittedBy && existingTopic.submittedBy.toString() !== req.session.user._id.toString()) {
                    return res.status(403).json({ success: false, error: 'Unauthorized to edit this topic.' });
                }

                existingTopic.name = name.trim();
                existingTopic.code = code ? code.trim() : (existingTopic.code || '');
                existingTopic.classLevel = targetClasses[0];
                existingTopic.group = group || 'None';
                existingTopic.subject = subject.trim();
                existingTopic.chapter = {
                    number: parseInt(chapterNumber, 10) || 1,
                    name: chapterName.trim()
                };
                existingTopic.difficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : (existingTopic.difficulty || 'Medium');
                existingTopic.keywords = keywordsArray;
                existingTopic.description = description ? description.trim() : '';
                existingTopic.order = parseInt(order, 10) || 0;
                existingTopic.status = topicStatus;
                existingTopic.rejectionReason = '';
                existingTopic.updatedAt = new Date();
                await existingTopic.save();
                await ensureSubjectInAcademicClass(targetClasses[0], subject.trim(), group);

                // Clone to other classes if multiple selected on edit
                if (targetClasses.length > 1) {
                    for (let i = 1; i < targetClasses.length; i++) {
                        const extraCls = targetClasses[i];
                        const dup = await Topic.findOne({
                            name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
                            classLevel: new RegExp(`^${escapeRegex(extraCls)}$`, 'i'),
                            subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                            'chapter.name': new RegExp(`^${escapeRegex(chapterName)}$`, 'i'),
                            isArchived: { $ne: true }
                        });
                        if (!dup) {
                            await Topic.create({
                                name: name.trim(),
                                code: code ? code.trim() : '',
                                classLevel: extraCls,
                                group: group || 'None',
                                subject: subject.trim(),
                                chapter: { number: parseInt(chapterNumber, 10) || 1, name: chapterName.trim() },
                                difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
                                keywords: keywordsArray,
                                description: description ? description.trim() : '',
                                order: parseInt(order, 10) || 0,
                                status: topicStatus,
                                submittedBy: isTeacher ? req.session.user._id : null,
                                createdBy: req.session && req.session.user ? req.session.user._id : null
                            });
                        }
                        await ensureSubjectInAcademicClass(extraCls, subject.trim(), group);
                    }
                }

                return res.json({
                    success: true,
                    message: isTeacher ? `Topic "${existingTopic.name}" updated and resubmitted for Admin review!` : `Topic "${existingTopic.name}" updated successfully!`,
                    topic: existingTopic
                });
            }
        }

        const createdTopics = [];
        for (const cls of targetClasses) {
            const existing = await Topic.findOne({
                name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
                classLevel: new RegExp(`^${escapeRegex(cls)}$`, 'i'),
                subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                'chapter.name': new RegExp(`^${escapeRegex(chapterName)}$`, 'i'),
                isArchived: { $ne: true }
            });

            if (existing) {
                createdTopics.push(existing);
            } else {
                const newTopic = await Topic.create({
                    name: name.trim(),
                    code: code ? code.trim() : '',
                    classLevel: cls,
                    group: group || 'None',
                    subject: subject.trim(),
                    chapter: {
                        number: parseInt(chapterNumber, 10) || 1,
                        name: chapterName.trim()
                    },
                    difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
                    keywords: keywordsArray,
                    description: description ? description.trim() : '',
                    order: parseInt(order, 10) || 0,
                    status: topicStatus,
                    submittedBy: isTeacher ? req.session.user._id : null,
                    createdBy: req.session && req.session.user ? req.session.user._id : null
                });
                createdTopics.push(newTopic);
            }
            await ensureSubjectInAcademicClass(cls, subject.trim(), group);
        }

        // Ensure Subject folder and Chapter subfolder exist in Notes for these classes
        await ensureSyllabusFoldersForChapter(targetClasses, subject.trim(), chapterName.trim(), req.session && req.session.user ? req.session.user._id : null);

        const successMsg = isTeacher 
            ? `Topic "${name.trim()}" submitted for Admin review across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`
            : `Topic "${name.trim()}" created successfully for ${targetClasses.length} class(es): ${targetClasses.join(', ')}`;

        if (isTeacher && createdTopics.length > 0) {
            try {
                const pushNotificationService = require('../services/pushNotificationService');
                pushNotificationService.sendToRole('superadmin', {
                    title: 'New AI Topic Awaiting Approval',
                    body: `Teacher ${req.session.user ? req.session.user.name : 'Teacher'} submitted "${name.trim()}" (${targetClasses.join(', ')} - ${subject}).`,
                    url: '/superadmin/topics',
                    type: 'topic_review'
                }).catch(() => {});
            } catch(e) {}
        }

        res.json({
            success: true,
            message: successMsg,
            isPending: isTeacher,
            count: createdTopics.length,
            classes: targetClasses,
            topic: createdTopics[0],
            topics: createdTopics
        });
    } catch (error) {
        console.error('createTopic Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Bulk Create Topics under a Chapter (Supports Multiple Classes at once)
const bulkCreateTopics = async (req, res) => {
    try {
        await connectDB();
        const { classLevel, classLevels, group, subject, chapterName, chapterNumber, topicList, difficulty } = req.body;

        if (!subject || !chapterName) {
            return res.status(400).json({ success: false, error: 'Subject and Chapter are required' });
        }

        let targetClasses = [];
        if (Array.isArray(classLevels) && classLevels.length > 0) {
            targetClasses = classLevels.map(s => String(s || '').trim()).filter(Boolean);
        } else if (Array.isArray(classLevel) && classLevel.length > 0) {
            targetClasses = classLevel.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof classLevel === 'string' && classLevel.includes(',')) {
            targetClasses = classLevel.split(',').map(s => s.trim()).filter(Boolean);
        } else if (typeof classLevel === 'string' && classLevel.trim()) {
            targetClasses = [classLevel.trim()];
        }

        if (targetClasses.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one class level is required' });
        }

        let names = [];
        if (Array.isArray(topicList)) {
            names = topicList.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof topicList === 'string') {
            names = topicList.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        }

        if (names.length === 0) {
            return res.status(400).json({ success: false, error: 'Please enter at least one topic name' });
        }

        const chNum = parseInt(chapterNumber, 10) || 1;
        const isTeacher = req.session && req.session.user && req.session.user.role === 'teacher';
        const topicStatus = isTeacher ? 'pending' : 'approved';

        if (isTeacher) {
            const { assignedClasses, assignedSubjects } = await getTeacherAssignments(req.session.user._id);
            for (const cls of targetClasses) {
                if (assignedClasses.length > 0 && !matchesClass(cls, assignedClasses)) {
                    return res.status(403).json({ success: false, error: `You are not assigned to class "${cls}"` });
                }
            }
            if (assignedSubjects.length > 0 && !matchesSubject(subject, assignedSubjects)) {
                return res.status(403).json({ success: false, error: `You are not assigned to subject "${subject}"` });
            }
        }
        const createdTopics = [];

        for (const cls of targetClasses) {
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                const existing = await Topic.findOne({
                    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
                    classLevel: new RegExp(`^${escapeRegex(cls)}$`, 'i'),
                    subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                    'chapter.name': new RegExp(`^${escapeRegex(chapterName)}$`, 'i'),
                    isArchived: { $ne: true }
                });

                if (!existing) {
                    const topic = await Topic.create({
                        name,
                        classLevel: cls,
                        group: group || 'None',
                        subject: subject.trim(),
                        chapter: {
                            number: chNum,
                            name: chapterName.trim()
                        },
                        difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
                        order: i + 1,
                        status: topicStatus,
                        submittedBy: isTeacher ? req.session.user._id : null,
                        createdBy: req.session && req.session.user ? req.session.user._id : null
                    });
                    createdTopics.push(topic);
                } else {
                    createdTopics.push(existing);
                }
            }
            await ensureSubjectInAcademicClass(cls, subject.trim(), group);
        }

        // Ensure Subject folder and Chapter subfolder exist in Notes for these classes
        await ensureSyllabusFoldersForChapter(targetClasses, subject.trim(), chapterName.trim(), req.session && req.session.user ? req.session.user._id : null);

        const successMsg = isTeacher 
            ? `${createdTopics.length} topics submitted for Admin review across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`
            : `${createdTopics.length} topics added to "${chapterName}" across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`;

        res.json({
            success: true,
            message: successMsg,
            isPending: isTeacher,
            count: createdTopics.length,
            classes: targetClasses,
            topics: createdTopics
        });
    } catch (error) {
        console.error('bulkCreateTopics Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Update Topic
const updateTopic = async (req, res) => {
    try {
        await connectDB();
        const { id } = req.params;
        const { name, code, classLevel, group, subject, chapterName, chapterNumber, difficulty, keywords, description, order } = req.body;

        const updatePayload = {};
        if (name) updatePayload.name = name.trim();
        if (code !== undefined) updatePayload.code = String(code).trim();
        if (classLevel) updatePayload.classLevel = classLevel.trim();
        if (group) updatePayload.group = group;
        if (subject) updatePayload.subject = subject.trim();
        if (chapterName) {
            updatePayload['chapter.name'] = chapterName.trim();
        }
        if (chapterNumber !== undefined) {
            updatePayload['chapter.number'] = parseInt(chapterNumber, 10) || 1;
        }
        if (difficulty) updatePayload.difficulty = difficulty;
        if (description !== undefined) updatePayload.description = description.trim();
        if (order !== undefined) updatePayload.order = parseInt(order, 10) || 0;
        if (keywords) {
            updatePayload.keywords = Array.isArray(keywords) 
                ? keywords.map(s => String(s || '').trim()).filter(Boolean)
                : String(keywords || '').split(',').map(s => s.trim()).filter(Boolean);
        }

        const updated = await Topic.findByIdAndUpdate(id, { $set: updatePayload }, { new: true });
        if (!updated) return res.status(404).json({ success: false, error: 'Topic not found' });

        res.json({
            success: true,
            message: `Topic "${updated.name}" updated successfully`,
            topic: updated
        });
    } catch (error) {
        console.error('updateTopic Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Archive Topic (Move to History Bucket)
const archiveTopic = async (req, res) => {
    try {
        await connectDB();
        const rawId = req.params.id || req.body.id;
        const name = req.body && req.body.name ? req.body.name.trim() : '';

        let updated = null;
        if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
            updated = await Topic.findByIdAndUpdate(rawId, { $set: { isArchived: true } }, { new: true });
        }
        if (!updated && name) {
            updated = await Topic.findOneAndUpdate(
                { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                { $set: { isArchived: true } },
                { new: true }
            );
        }

        if (!updated) return res.status(404).json({ success: false, error: 'Topic not found to archive' });

        res.json({
            success: true,
            message: `Topic "${updated.name}" moved to History Bucket`,
            topic: updated
        });
    } catch (error) {
        console.error('archiveTopic Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Restore Topic from History Bucket
const restoreTopic = async (req, res) => {
    try {
        await connectDB();
        const rawId = req.params.id || req.body.id;
        const name = req.body && req.body.name ? req.body.name.trim() : '';

        let updated = null;
        if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
            updated = await Topic.findByIdAndUpdate(rawId, { $set: { isArchived: false } }, { new: true });
        }
        if (!updated && name) {
            updated = await Topic.findOneAndUpdate(
                { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                { $set: { isArchived: false } },
                { new: true }
            );
        }

        if (!updated) return res.status(404).json({ success: false, error: 'Topic not found to restore' });

        res.json({
            success: true,
            message: `Topic "${updated.name}" restored to live syllabus`,
            topic: updated
        });
    } catch (error) {
        console.error('restoreTopic Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Permanently Delete Topic
const permanentDeleteTopic = async (req, res) => {
    try {
        await connectDB();
        const id = req.params.id || req.body.id;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Valid topic ID required' });
        }

        const deleted = await Topic.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Topic not found' });

        res.json({
            success: true,
            message: 'Topic permanently deleted from database'
        });
    } catch (error) {
        console.error('permanentDeleteTopic Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Delete Whole Chapter (Move all topics in chapter to History Bucket)
const deleteChapter = async (req, res) => {
    try {
        await connectDB();
        const { classLevel, subject, chapterName } = req.body;

        if (!classLevel || !subject || !chapterName) {
            return res.status(400).json({ success: false, error: 'Class, Subject, and Chapter name are required' });
        }

        const escapedClass = classLevel.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedSubject = subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedChapter = chapterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const filter = {
            classLevel: new RegExp(`^${escapedClass}$`, 'i'),
            subject: new RegExp(`^${escapedSubject}$`, 'i'),
            $or: [
                { 'chapter.name': chapterName.trim() },
                { 'chapter.name': new RegExp(`^${escapedChapter}$`, 'i') }
            ]
        };

        const result = await Topic.updateMany(filter, { $set: { isArchived: true } });
        return res.json({
            success: true,
            message: `Chapter "${chapterName}" and ${result.modifiedCount} topic(s) moved to History Bucket`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('deleteChapter Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Bulk Action on Multiple Selected Topics (Archive or Restore to/from History Bucket)
const bulkActionTopics = async (req, res) => {
    try {
        await connectDB();
        const { topicIds, action } = req.body;

        if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Please select at least one topic' });
        }

        const validIds = topicIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid topic IDs provided' });
        }

        if (action === 'restore') {
            const result = await Topic.updateMany({ _id: { $in: validIds } }, { $set: { isArchived: false } });
            return res.json({
                success: true,
                message: `${result.modifiedCount} topic(s) restored to live syllabus`,
                count: result.modifiedCount
            });
        } else {
            // Default: archive (move to History Bucket)
            const result = await Topic.updateMany({ _id: { $in: validIds } }, { $set: { isArchived: true } });
            return res.json({
                success: true,
                message: `${result.modifiedCount} topic(s) moved to History Bucket`,
                count: result.modifiedCount
            });
        }
    } catch (error) {
        console.error('bulkActionTopics Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// ==========================================
// ADMIN APPROVAL ENDPOINTS FOR TOPICS
// ==========================================

// Approve single topic
const approveTopic = async (req, res) => {
    try {
        await connectDB();
        const id = req.body.id || req.body.topicId;
        if (!id) return res.status(400).json({ success: false, error: 'Topic ID is required' });

        const topic = await Topic.findByIdAndUpdate(id, {
            status: 'approved',
            reviewedBy: req.session.user ? req.session.user._id : null,
            reviewedAt: new Date(),
            rejectionReason: ''
        }, { new: true });

        if (!topic) return res.status(404).json({ success: false, error: 'Topic not found' });
        await ensureSyllabusFoldersForChapter([topic.classLevel], topic.subject, topic.chapter?.name, topic.createdBy || topic.submittedBy);

        res.json({
            success: true,
            message: `Topic "${topic.name}" approved and published live`,
            topic
        });
    } catch (error) {
        console.error('approveTopic Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bulk Approve multiple topics
const bulkApproveTopics = async (req, res) => {
    try {
        await connectDB();
        const topicIds = req.body.topicIds || req.body.ids || req.body.selectedTopicIds;
        if (!Array.isArray(topicIds) || topicIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No topics selected for approval' });
        }

        const validIds = topicIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        const topicsToApprove = await Topic.find({ _id: { $in: validIds } }).select('classLevel subject chapter createdBy submittedBy').lean();
        const result = await Topic.updateMany(
            { _id: { $in: validIds } },
            { 
                $set: { 
                    status: 'approved',
                    reviewedBy: req.session.user ? req.session.user._id : null,
                    reviewedAt: new Date(),
                    rejectionReason: ''
                } 
            }
        );

        for (const t of topicsToApprove) {
            await ensureSyllabusFoldersForChapter([t.classLevel], t.subject, t.chapter?.name, t.createdBy || t.submittedBy);
        }

        res.json({
            success: true,
            message: `${result.modifiedCount} topic(s) approved and published live`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('bulkApproveTopics Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Reject single topic with feedback
const rejectTopic = async (req, res) => {
    try {
        await connectDB();
        const id = req.body.id || req.body.topicId;
        const reason = req.body.reason;
        if (!id) return res.status(400).json({ success: false, error: 'Topic ID is required' });

        const topic = await Topic.findByIdAndUpdate(id, {
            status: 'rejected',
            rejectionReason: (reason || 'Revisions required by admin').trim(),
            reviewedBy: req.session.user ? req.session.user._id : null,
            reviewedAt: new Date()
        }, { new: true });

        if (!topic) return res.status(404).json({ success: false, error: 'Topic not found' });

        res.json({
            success: true,
            message: 'Topic returned to teacher with feedback',
            topic
        });
    } catch (error) {
        console.error('rejectTopic Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bulk Reject multiple topics
const bulkRejectTopics = async (req, res) => {
    try {
        await connectDB();
        const topicIds = req.body.topicIds || req.body.ids || req.body.selectedTopicIds;
        const reason = req.body.reason;
        if (!Array.isArray(topicIds) || topicIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No topics selected' });
        }

        const validIds = topicIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        const result = await Topic.updateMany(
            { _id: { $in: validIds } },
            { 
                $set: { 
                    status: 'rejected',
                    rejectionReason: (reason || 'Revisions required by admin').trim(),
                    reviewedBy: req.session.user ? req.session.user._id : null,
                    reviewedAt: new Date()
                } 
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} topic(s) marked as rejected with feedback`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('bulkRejectTopics Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// TEACHER ASSIGNMENT & SCOPE HELPERS
// ==========================================
const matchesClass = (targetClass, allowedList) => {
    if (!targetClass || !allowedList || allowedList.length === 0) return false;
    const t = String(targetClass).toLowerCase().replace(/\bclass\b/gi, '').trim();
    const tNum = t.replace(/[^0-9]/g, '');
    return allowedList.some(raw => {
        const a = String(raw).toLowerCase().replace(/\bclass\b/gi, '').trim();
        const aNum = a.replace(/[^0-9]/g, '');
        if (t === a) return true;
        if (t.replace(/\s+/g, '') === a.replace(/\s+/g, '')) return true;
        if (tNum && aNum && tNum === aNum) return true;
        if (t && a && (t.includes(a) || a.includes(t))) return true;
        return false;
    });
};

const matchesSubject = (targetSubject, allowedList) => {
    if (!targetSubject || !allowedList || allowedList.length === 0) return false;
    const cleanSub = (s) => String(s || '').toLowerCase().trim()
        .replace(/\bmathematics\b/g, 'math')
        .replace(/\b1st\s+paper\b/g, '')
        .replace(/\b2nd\s+paper\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const t = cleanSub(targetSubject);
    return allowedList.some(raw => {
        const a = cleanSub(raw);
        if (!a) return false;
        if (t === a) return true;
        if (t.replace(/\s+/g, '') === a.replace(/\s+/g, '')) return true;

        const checkWordMatch = (container, needle) => {
            const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i');
            if (regex.test(container)) {
                if (needle === 'bangla' && container.includes('bangladesh') && !container.includes('bangla ')) {
                    return false;
                }
                return true;
            }
            return false;
        };

        if (checkWordMatch(t, a)) return true;
        if (checkWordMatch(a, t)) return true;

        return false;
    });
};

const getTeacherAssignments = async (userId) => {
    const user = await User.findById(userId).lean();
    let assignedClasses = [];
    let assignedSubjects = [];

    if (user) {
        if (user.classLevel) {
            const cleaned = String(user.classLevel).replace(/\bclass\s+class\b/gi, 'Class').trim();
            const parts = cleaned.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
            assignedClasses.push(...parts);
        }
        if (Array.isArray(user.classes)) {
            assignedClasses.push(...user.classes.map(s => String(s || '').trim()).filter(Boolean));
        }
        if (Array.isArray(user.assignedClasses)) {
            assignedClasses.push(...user.assignedClasses.map(s => String(s || '').trim()).filter(Boolean));
        }
        if (user.teachingSubject) {
            const parts = String(user.teachingSubject).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
            assignedSubjects.push(...parts);
        }
        if (Array.isArray(user.teachingSubjects)) {
            assignedSubjects.push(...user.teachingSubjects.map(s => String(s || '').trim()).filter(Boolean));
        }
        if (user.subject) {
            const parts = String(user.subject).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
            assignedSubjects.push(...parts);
        }
        if (Array.isArray(user.subjects)) {
            assignedSubjects.push(...user.subjects.map(s => String(s || '').trim()).filter(Boolean));
        }
        if (user.department) {
            const parts = String(user.department).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
            assignedSubjects.push(...parts);
        }
        const courses = await Course.find({
            $or: [{ instructor: userId }, { permittedTeachers: userId }]
        }).select('classLevel subject').lean();
        courses.forEach(c => {
            if (c.classLevel) {
                const parts = String(c.classLevel).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
                assignedClasses.push(...parts);
            }
            if (c.subject) {
                const parts = String(c.subject).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
                assignedSubjects.push(...parts);
            }
        });
    }

    return {
        user,
        assignedClasses: Array.from(new Set(assignedClasses.filter(Boolean))),
        assignedSubjects: Array.from(new Set(assignedSubjects.filter(Boolean)))
    };
};

// ==========================================
// TEACHER PORTAL TOPICS CONTROLLER (STRICT SCOPED)
// ==========================================

const getTeacherTopicsPage = async (req, res) => {
    try {
        await connectDB();
        await seedDefaultTopicsIfEmpty();

        const { user: teacherUser, assignedClasses, assignedSubjects } = await getTeacherAssignments(req.session.user._id);
        const isSuperOrAdmin = ['admin', 'superadmin'].includes(teacherUser?.role || req.session.user?.role);
        const allClasses = await AcademicClass.find({ isArchived: { $nin: [true, 'true', 1] } }).sort({ order: 1 }).lean();

        // STRICT FILTERING: Teacher ONLY sees classes they are assigned to.
        // Superadmin/Admin or unconstrained teachers see all active classes.
        let classes = [];
        if (!isSuperOrAdmin && assignedClasses.length > 0) {
            classes = allClasses.filter(c => matchesClass(c.name, assignedClasses));
            if (classes.length === 0) {
                classes = allClasses;
            }
        } else {
            classes = allClasses;
        }

        let rawClass = req.query.classLevels || req.query.classLevel || '';
        let selectedClasses = [];
        if (Array.isArray(rawClass)) {
            selectedClasses = rawClass.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof rawClass === 'string' && rawClass.trim()) {
            selectedClasses = rawClass.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (!isSuperOrAdmin && assignedClasses.length > 0 && selectedClasses.length > 0) {
            selectedClasses = selectedClasses.filter(c => matchesClass(c, assignedClasses));
        }

        if (selectedClasses.length === 0 && classes.length > 0) {
            selectedClasses = [classes[0].name];
        }

        let selectedClass = selectedClasses[0] || '';
        let selectedGroup = (req.query.group || 'all').trim();
        let selectedSubject = (req.query.subject || '').trim();

        const currentClassObj = classes.find(c => c.name.toLowerCase() === selectedClass.toLowerCase()) || classes[0] || null;

        // Resolve class subjects
        let classSubjects = [];
        if (currentClassObj) {
            if (currentClassObj.hasGroups && currentClassObj.groups && currentClassObj.groups.length > 0) {
                if (selectedGroup && selectedGroup !== 'all') {
                    const grp = currentClassObj.groups.find(g => g.name.toLowerCase() === selectedGroup.toLowerCase());
                    const grpSubs = grp ? grp.subjects : [];
                    classSubjects = Array.from(new Set([...(currentClassObj.commonSubjects || []), ...grpSubs]));
                } else {
                    const allGrpSubs = currentClassObj.groups.flatMap(g => g.subjects || []);
                    classSubjects = Array.from(new Set([...(currentClassObj.commonSubjects || []), ...(currentClassObj.subjects || []), ...allGrpSubs]));
                }
            } else {
                classSubjects = currentClassObj.subjects || [];
            }
        }

        // STRICT FILTERING: Teacher ONLY sees subjects they are explicitly assigned to!
        let availableSubjects = [];
        if (assignedSubjects.length > 0) {
            availableSubjects = classSubjects.filter(sub => matchesSubject(sub, assignedSubjects));
            // If the assigned subject is not explicitly in the class subjects list yet, include the assigned subjects
            if (availableSubjects.length === 0) {
                availableSubjects = assignedSubjects;
            }
        } else if (isSuperOrAdmin) {
            // Admin or Superadmin testing/previewing teacher portal sees full class subjects
            availableSubjects = classSubjects;
        } else {
            // Strictly NO subjects if a teacher is not specifically assigned any subjects
            availableSubjects = [];
        }

        // Default to first assigned subject
        if (availableSubjects.length > 0) {
            const hasSub = availableSubjects.some(s => s.toLowerCase() === selectedSubject.toLowerCase());
            if (!hasSub) {
                selectedSubject = availableSubjects[0];
            }
        } else {
            selectedSubject = '';
        }

        // 2. Query Live Approved Topics (Only for assigned class & subject)
        let activeTopics = [];
        let chapters = [];

        if (selectedClass && selectedSubject) {
            const escClass = selectedClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escSub = selectedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const activeFilter = { 
                isArchived: { $nin: [true, 'true', 1] }, 
                status: { $nin: ['pending', 'rejected'] },
                classLevel: new RegExp('^' + escClass + '$', 'i'),
                subject: new RegExp('^' + escSub + '$', 'i')
            };
            if (selectedGroup && selectedGroup !== 'all') {
                activeFilter.group = { $in: [selectedGroup, 'all', 'None', null] };
            }

            activeTopics = await Topic.find(activeFilter).sort({ 'chapter.number': 1, order: 1, createdAt: 1 }).lean();

            const chaptersMap = new Map();
            activeTopics.forEach(top => {
                const chName = (top.chapter && top.chapter.name) ? top.chapter.name.trim() : 'General / অধ্যায়হীন';
                const chNum = (top.chapter && typeof top.chapter.number === 'number') ? top.chapter.number : 1;
                if (!chaptersMap.has(chName)) {
                    chaptersMap.set(chName, {
                        name: chName,
                        number: chNum,
                        topics: []
                    });
                }
                chaptersMap.get(chName).topics.push(top);
            });
            chapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);
        }

        // 3. Query Teacher's Own Submitted Topics
        const subFilter = isSuperOrAdmin 
            ? { isArchived: { $nin: [true, 'true', 1] }, $or: [{ submittedBy: req.session.user._id }, { createdBy: req.session.user._id }, { status: 'pending' }] }
            : { isArchived: { $nin: [true, 'true', 1] }, $or: [{ submittedBy: req.session.user._id }, { createdBy: req.session.user._id }] };

        const mySubmissions = await Topic.find(subFilter).sort({ 'chapter.number': 1, order: 1, createdAt: -1 }).lean();

        if (req.session && req.session.user && teacherUser) {
            req.session.user.classLevel = teacherUser.classLevel;
            req.session.user.teachingSubject = teacherUser.teachingSubject;
            req.session.user.teachingSubjects = teacherUser.teachingSubjects;
        }

        const myPendingTopics = mySubmissions.filter(t => t.status === 'pending');
        const myRejectedTopics = mySubmissions.filter(t => t.status === 'rejected');
        const myApprovedTopics = mySubmissions.filter(t => t.status === 'approved');

        // Group Teacher Submissions Chapter-wise
        const submissionChaptersMap = new Map();
        mySubmissions.forEach(top => {
            const chName = (top.chapter && top.chapter.name) ? top.chapter.name.trim() : 'General / অধ্যায়হীন';
            const chNum = (top.chapter && typeof top.chapter.number === 'number') ? top.chapter.number : 1;
            const key = `${top.classLevel || ''}_${top.subject || ''}_${chName}`;
            if (!submissionChaptersMap.has(key)) {
                submissionChaptersMap.set(key, {
                    key,
                    name: chName,
                    number: chNum,
                    classLevel: top.classLevel,
                    group: top.group,
                    subject: top.subject,
                    topics: []
                });
            }
            submissionChaptersMap.get(key).topics.push(top);
        });
        const mySubmissionChapters = Array.from(submissionChaptersMap.values()).sort((a, b) => a.number - b.number);

        res.render('teacher/topics', {
            active: 'topics',
            user: teacherUser || req.session.user,
            classes,
            currentClassObj,
            selectedClass,
            selectedClasses,
            selectedGroup,
            selectedSubject,
            availableSubjects,
            assignedClasses,
            assignedSubjects,
            chapters,
            activeTopics,
            mySubmissions,
            mySubmissionChapters,
            myPendingTopics,
            myRejectedTopics,
            myApprovedTopics,
            totalActiveCount: activeTopics.length,
            pendingCount: myPendingTopics.length,
            apiBase: '/teacher'
        });
    } catch (error) {
        console.error('getTeacherTopicsPage Error:', error);
        res.status(500).send('Server Error loading teacher syllabus: ' + error.message);
    }
};

// Teacher can delete their own pending or rejected topic submission
const deletePendingTeacherTopic = async (req, res) => {
    try {
        await connectDB();
        const { id } = req.params;
        const topic = await Topic.findOneAndDelete({
            _id: id,
            $or: [{ submittedBy: req.session.user._id }, { createdBy: req.session.user._id }],
            status: { $in: ['pending', 'rejected'] }
        });

        if (!topic) {
            return res.status(404).json({ success: false, error: 'Topic submission not found or already live' });
        }

        res.json({ success: true, message: 'Submission removed successfully' });
    } catch (error) {
        console.error('deletePendingTeacherTopic Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// API: Check if a topic (with same subject & chapter) exists in other classes syllabus
const checkCrossClassTopic = async (req, res) => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 1) {
            try { await connectDB(); } catch (e) {}
        }
        const { subject, topic, chapter } = req.query;
        const currentClassesRaw = req.query.currentClasses || req.query.currentClass || "";
        let currentClasses = [];
        if (Array.isArray(currentClassesRaw)) {
            currentClasses = currentClassesRaw.flatMap(c => String(c).split(",")).map(c => c.trim().toLowerCase()).filter(Boolean);
        } else if (currentClassesRaw) {
            currentClasses = String(currentClassesRaw).split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
        }

        if (!subject || !topic) {
            return res.json({ success: true, hasCrossClass: false, matchingClasses: [], details: [] });
        }

        const cleanSubject = String(subject).trim();
        const cleanTopic = String(topic).trim();

        // Find approved/active topics in syllabus with matching subject and topic name
        const filter = {
            isArchived: { $nin: [true, "true", 1] },
            status: { $nin: ["pending", "rejected"] },
            subject: new RegExp("^" + escapeRegex(cleanSubject) + "$", "i"),
            name: new RegExp("^" + escapeRegex(cleanTopic) + "$", "i")
        };

        const matchingTopics = await Topic.find(filter).select("classLevel subject chapter name").lean();

        // Group by classLevel, filtering out currently selected classes
        const classMap = new Map();
        matchingTopics.forEach(t => {
            const cls = (t.classLevel || "").trim();
            if (!cls) return;
            const clsLower = cls.toLowerCase();
            const isCurrent = currentClasses.some(cc => cc === clsLower || cc.includes(clsLower) || clsLower.includes(cc));
            if (!isCurrent) {
                if (!classMap.has(cls)) {
                    classMap.set(cls, {
                        classLevel: cls,
                        chapterName: (t.chapter && t.chapter.name) ? t.chapter.name : (chapter || ""),
                        topicName: t.name
                    });
                }
            }
        });

        const matchingDetails = Array.from(classMap.values());
        const matchingClasses = Array.from(classMap.keys());

        res.json({
            success: true,
            hasCrossClass: matchingClasses.length > 0,
            matchingClasses,
            details: matchingDetails
        });
    } catch (error) {
        console.error("checkCrossClassTopic Error:", error);
        res.status(200).json({ success: true, hasCrossClass: false, matchingClasses: [], details: [] });
    }
};

module.exports = {
    ensureSyllabusFoldersForChapter,
    syncAllSyllabusFolders,
    getTopicsPage,
    getTopicsApi,
    getChaptersApi,
    createTopic,
    bulkCreateTopics,
    updateTopic,
    archiveTopic,
    restoreTopic,
    permanentDeleteTopic,
    deleteChapter,
    bulkActionTopics,
    approveTopic,
    bulkApproveTopics,
    rejectTopic,
    bulkRejectTopics,
    getTeacherTopicsPage,
    deletePendingTeacherTopic,
    addSubjectToClasses,
    copyTopicsToClasses,
    checkCrossClassTopic
};