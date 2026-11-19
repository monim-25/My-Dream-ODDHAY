const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const AcademicClass = require('../models/AcademicClass');
const User = require('../models/User');
const Course = require('../models/Course');
const Folder = require('../models/Folder');
const { connectDB } = require('../config');
const { normalizeClass, getLinkedClasses } = require('../utils/academicHelper');

// In-memory cache for fast syllabus topics & chapters lookup
const _topicsApiCache = new Map();
const TOPICS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

const getTopicsCacheKey = (query) => {
    const cls = query.classLevels || query.classLevel || query['classLevels[]'] || query['classLevel[]'] || '';
    const sub = query.subjects || query.subject || query['subjects[]'] || query['subject[]'] || '';
    const chap = query.chapters || query.chapter || query['chapters[]'] || query['chapter[]'] || '';
    const seg = query.segment || query.segments || '';
    const grp = query.group || '';
    return `${cls}::${sub}::${chap}::${seg}::${grp}`.toLowerCase();
};

const clearTopicsApiCache = () => {
    _topicsApiCache.clear();
};

// Escape regex special characters
const escapeRegex = (s) => String(s || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bilingual English & Bengali Subject Aliases
const getSubjectAliases = (subj) => {
    if (!subj) return [];
    const s = String(subj).trim();
    const map = {
        'physics': ['Physics', 'পদার্থবিজ্ঞান', 'পদার্থ বিজ্ঞান', 'পদার্থ'],
        'পদার্থবিজ্ঞান': ['Physics', 'পদার্থবিজ্ঞান', 'পদার্থ বিজ্ঞান', 'পদার্থ'],
        'পদার্থ বিজ্ঞান': ['Physics', 'পদার্থবিজ্ঞান', 'পদার্থ বিজ্ঞান', 'পদার্থ'],
        'chemistry': ['Chemistry', 'রসায়ন', 'রসায়ন'],
        'রসায়ন': ['Chemistry', 'রসায়ন', 'রসায়ন'],
        'রসায়ন': ['Chemistry', 'রসায়ন', 'রসায়ন'],
        'biology': ['Biology', 'জীববিজ্ঞান', 'জীব বিজ্ঞান'],
        'জীববিজ্ঞান': ['Biology', 'জীববিজ্ঞান', 'জীব বিজ্ঞান'],
        'জীব বিজ্ঞান': ['Biology', 'জীববিজ্ঞান', 'জীব বিজ্ঞান'],
        'higher math': ['Higher Math', 'Higher Mathematics', 'উচ্চতর গণিত'],
        'higher mathematics': ['Higher Math', 'Higher Mathematics', 'উচ্চতর গণিত'],
        'উচ্চতর গণিত': ['Higher Math', 'Higher Mathematics', 'উচ্চতর গণিত'],
        'general math': ['General Math', 'Mathematics', 'Math', 'সাধারণ গণিত', 'গণিত'],
        'mathematics': ['General Math', 'Mathematics', 'Math', 'সাধারণ গণিত', 'গণিত'],
        'math': ['General Math', 'Mathematics', 'Math', 'সাধারণ গণিত', 'গণিত'],
        'সাধারণ গণিত': ['General Math', 'Mathematics', 'Math', 'সাধারণ গণিত', 'গণিত'],
        'গণিত': ['General Math', 'Mathematics', 'Math', 'সাধারণ গণিত', 'গণিত'],
        'bangla': ['Bangla', 'বাংলা', 'বাংলা ১ম পত্র', 'বাংলা ২য় পত্র', 'Bangla 1st Paper', 'Bangla 2nd Paper'],
        'বাংলা': ['Bangla', 'বাংলা', 'বাংলা ১ম পত্র', 'বাংলা ২য় পত্র', 'Bangla 1st Paper', 'Bangla 2nd Paper'],
        'english': ['English', 'ইংরেজি', 'English 1st Paper', 'English 2nd Paper'],
        'ইংরেজি': ['English', 'ইংরেজি', 'English 1st Paper', 'English 2nd Paper'],
        'ict': ['ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'আইসিটি'],
        'তথ্য ও যোগাযোগ প্রযুক্তি': ['ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'আইসিটি'],
        'আইসিটি': ['ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'আইসিটি']
    };
    const key = s.toLowerCase();
    if (map[key]) return map[key];
    return [s];
};

// Safe parser for sub-topics (supports arrays, JSON strings, comma/newline-separated strings)
const parseSubTopics = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(s => String(s || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(s => String(s || '').trim()).filter(Boolean);
            } catch (e) { }
        }
        return raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
};

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
                await subjectFolder.save().catch(() => { });
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
                await chapterFolder.save().catch(() => { });
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

// Helper to automatically detect group (Science, Commerce, Humanities, all) from AcademicClass
const resolveGroupByClassAndSubject = async (clsName, subjectName, explicitGroup = '') => {
    if (explicitGroup && explicitGroup !== 'all' && explicitGroup !== 'None') {
        return explicitGroup;
    }
    if (!clsName || !subjectName) return 'None';
    try {
        const cleanName = String(clsName).trim();
        const cleanSub = String(subjectName).trim().toLowerCase();
        const ac = await AcademicClass.findOne({
            name: new RegExp('^' + escapeRegex(cleanName) + '$', 'i'),
            isArchived: { $ne: true }
        }).lean();
        if (!ac || !ac.hasGroups || !ac.groups || ac.groups.length === 0) {
            return 'None';
        }
        for (const grp of ac.groups) {
            if (grp.subjects && grp.subjects.some(s => String(s).trim().toLowerCase() === cleanSub || matchesSubject(s, [cleanSub]))) {
                return grp.name;
            }
        }
        if (ac.commonSubjects && ac.commonSubjects.some(s => String(s).trim().toLowerCase() === cleanSub || matchesSubject(s, [cleanSub]))) {
            return 'all';
        }
    } catch (err) {
        console.warn('resolveGroupByClassAndSubject warning:', err.message);
    }
    return explicitGroup || 'None';
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
            try { req.app.get('clearAcademicCache')(); } catch (_) { }
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
                        subTopics: st.subTopics || [],
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

        const { seedMasterCurriculum } = require('../seeds/seedCurriculum');
        if (typeof seedMasterCurriculum === 'function') {
            console.log('🌱 Seeding initial NCTB master curriculum for ODDHAY...');
            await seedMasterCurriculum({ wipeExisting: false });
        }
    } catch (e) {
        console.warn('Topic seed warning:', e.message);
    }
};

// Superadmin API endpoint to re-seed / reset NCTB Master Curriculum
const seedMasterCurriculumApi = async (req, res) => {
    try {
        await connectDB();
        const { seedMasterCurriculum } = require('../seeds/seedCurriculum');
        const wipe = req.body.wipe !== false; // default true
        const result = await seedMasterCurriculum({ wipeExisting: wipe });
        clearTopicsApiCache();
        return res.json({
            success: true,
            message: `NCTB মাস্টার কারিকুলাম সফলভাবে সংরক্ষিত হয়েছে (${result.count} টি টপিক)।`,
            totalCount: result.count
        });
    } catch (err) {
        console.error('seedMasterCurriculumApi error:', err);
        return res.status(500).json({ success: false, error: err.message });
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

        // Check Subject Segmentation Rules
        const { resolveSubjectSegments } = require('../utils/subjectRuleHelper');
        const { hasSegments: subjectHasSegments, segments: subjectSegments } = await resolveSubjectSegments(selectedSubject, selectedClasses);
        let selectedSegment = (req.query.segment || 'all').trim();

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
        if (selectedSegment && selectedSegment !== 'all') {
            activeFilter.segment = new RegExp(`^${escapeRegex(selectedSegment)}$`, 'i');
        }

        const activeTopics = await Topic.find(activeFilter).sort({ 'chapter.number': 1, order: 1, createdAt: 1 }).lean();

        // Group Active Topics by Chapter
        const chaptersMap = new Map();
        activeTopics.forEach(top => {
            const chName = (top.chapter && top.chapter.name) ? top.chapter.name.trim() : 'General / অধ্যায়হীন';
            const chNum = (top.chapter && typeof top.chapter.number === 'number') ? top.chapter.number : 1;
            const isValidSeg = subjectHasSegments && top.segment && subjectSegments.some(s => s.toLowerCase() === top.segment.toLowerCase());
            const chSeg = isValidSeg ? top.segment : '';
            const key = subjectHasSegments ? `${chSeg}___${chName}` : chName;
            if (!chaptersMap.has(key)) {
                chaptersMap.set(key, {
                    name: chName,
                    number: chNum,
                    segment: chSeg,
                    topics: []
                });
            } else if (!chaptersMap.get(key).segment && chSeg) {
                chaptersMap.get(key).segment = chSeg;
            }
            if (!top.isChapterPlaceholder && top.name !== '__EMPTY_CHAPTER__') {
                chaptersMap.get(key).topics.push(top);
            }
        });

        let chapters = [];
        if (subjectHasSegments) {
            const segOrderMap = new Map();
            (subjectSegments || []).forEach((s, idx) => segOrderMap.set(s.toLowerCase(), idx));
            chapters = Array.from(chaptersMap.values()).sort((a, b) => {
                const segOrderA = segOrderMap.has((a.segment || '').toLowerCase()) ? segOrderMap.get(a.segment.toLowerCase()) : 999;
                const segOrderB = segOrderMap.has((b.segment || '').toLowerCase()) ? segOrderMap.get(b.segment.toLowerCase()) : 999;
                if (segOrderA !== segOrderB) return segOrderA - segOrderB;
                return a.number - b.number;
            });
        } else {
            chapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);
        }

        const segmentStats = {};
        if (subjectHasSegments && Array.isArray(subjectSegments)) {
            subjectSegments.forEach(seg => {
                const segLower = seg.toLowerCase();
                const segChaps = chapters.filter(c => (c.segment || '').toLowerCase() === segLower);
                const segTopics = activeTopics.filter(t => (t.segment || '').toLowerCase() === segLower);
                segmentStats[seg] = {
                    chaptersCount: segChaps.length,
                    topicsCount: segTopics.length
                };
            });
        }

        // Archived Topics (History Bucket)
        const archivedTopics = await Topic.find({ isArchived: { $in: [true, 'true', 1] } }).sort({ updatedAt: -1 }).lean();

        // Pending Submissions Query (Awaiting Admin Review)
        const pendingTopics = await Topic.find({
            status: 'pending',
            isArchived: { $nin: [true, 'true', 1] }
        }).populate('submittedBy', 'name email profilePicture profileImage').populate('createdBy', 'name email profilePicture profileImage').sort({ createdAt: -1 }).lean();
        const pendingTopicCount = await Topic.countDocuments({ status: 'pending', isArchived: { $nin: [true, 'true', 1] } });

        // Deletion Requests Query (Awaiting Admin Review)
        const deletionRequests = await Topic.find({
            'deletionRequest.isRequested': true,
            'deletionRequest.status': 'pending',
            isArchived: { $nin: [true, 'true', 1] }
        }).populate('deletionRequest.requestedBy', 'name email profilePicture profileImage').sort({ 'deletionRequest.requestedAt': -1 }).lean();
        const deletionRequestCount = deletionRequests.length;

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
            subjectHasSegments,
            subjectSegments: subjectSegments || [],
            segmentStats: segmentStats || {},
            selectedSegment,
            chapters,
            activeTopics: (activeTopics || []).filter(t => !t.isChapterPlaceholder && t.name !== '__EMPTY_CHAPTER__'),
            archivedTopics,
            totalTopicCount,
            archivedTopicCount,
            pendingTopics,
            pendingTopicCount,
            deletionRequests,
            deletionRequestCount,
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
        const cacheKey = getTopicsCacheKey(req.query);
        const cached = _topicsApiCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < TOPICS_CACHE_TTL)) {
            return res.json(cached.data);
        }

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
                } catch (e) { }
            });
            const finalClassList = Array.from(expandedClasses).filter(Boolean);

            if (finalClassList.length === 1) {
                filter.classLevel = new RegExp('^' + escapeRegex(finalClassList[0]) + '$', 'i');
            } else if (finalClassList.length > 1) {
                filter.classLevel = new RegExp('^(?:' + finalClassList.map(escapeRegex).join('|') + ')$', 'i');
            }
        }
        const rawSubject = req.query.subjects || subject || req.query['subjects[]'] || req.query['subject[]'];
        if (rawSubject && rawSubject !== 'all') {
            let subList = [];
            if (Array.isArray(rawSubject)) {
                subList = rawSubject.flatMap(s => String(s).split(',')).map(s => s.trim()).filter(Boolean);
            } else {
                subList = String(rawSubject).split(',').map(s => s.trim()).filter(Boolean);
            }
            const allAliases = new Set();
            subList.forEach(s => {
                getSubjectAliases(s).forEach(a => allAliases.add(a));
            });
            const finalSubList = Array.from(allAliases).filter(Boolean);
            if (finalSubList.length === 1) {
                filter.subject = new RegExp('^' + escapeRegex(finalSubList[0]) + '$', 'i');
            } else if (finalSubList.length > 1) {
                filter.subject = new RegExp('^(?:' + finalSubList.map(escapeRegex).join('|') + ')$', 'i');
            }
        }

        const rawChapter = req.query.chapters || chapter || req.query['chapters[]'] || req.query['chapter[]'];
        if (rawChapter && rawChapter !== 'all') {
            let chapList = [];
            if (Array.isArray(rawChapter)) {
                chapList = rawChapter.flatMap(c => String(c).split(',')).map(c => c.trim()).filter(Boolean);
            } else {
                chapList = String(rawChapter).split(',').map(c => c.trim()).filter(Boolean);
            }
            if (chapList.length === 1) {
                filter['chapter.name'] = new RegExp('^' + escapeRegex(chapList[0]) + '$', 'i');
            } else if (chapList.length > 1) {
                filter['chapter.name'] = new RegExp('^(?:' + chapList.map(escapeRegex).join('|') + ')$', 'i');
            }
        }
        if (group && group !== 'all') {
            filter.group = { $in: [group, 'all', 'None', null] };
        }
        const rawSegment = req.query.segment || req.query.segments;
        if (rawSegment && rawSegment !== 'all') {
            filter.segment = new RegExp('^' + escapeRegex(String(rawSegment).trim()) + '$', 'i');
        }

        const topics = await Topic.find(filter)
            .select('_id name subject classLevel chapter segment subTopics order')
            .sort({ 'chapter.number': 1, order: 1, name: 1 })
            .lean();
        const chapterList = Array.from(new Set(topics.map(t => (t.chapter && t.chapter.name) ? t.chapter.name.trim() : '').filter(Boolean)));

        const responsePayload = {
            success: true,
            count: topics.length,
            topics: topics || [],
            chapters: chapterList
        };
        _topicsApiCache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
        res.json(responsePayload);
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
        const { classLevel, subject, segment } = req.query;
        if (!classLevel || !subject) {
            return res.json({ success: true, chapters: [] });
        }

        const rawClass = String(classLevel || '').trim();
        const classList = rawClass.split(',').map(c => c.trim()).filter(Boolean);
        const expandedClasses = new Set();
        classList.forEach(c => {
            expandedClasses.add(c);
            try {
                const norm = normalizeClass(c);
                if (norm) expandedClasses.add(norm);
                const linked = getLinkedClasses(c);
                if (Array.isArray(linked)) linked.forEach(l => expandedClasses.add(l));
            } catch (e) { }
        });
        const finalClassList = Array.from(expandedClasses).filter(Boolean);
        const classFilter = finalClassList.length === 1
            ? new RegExp('^' + escapeRegex(finalClassList[0]) + '$', 'i')
            : (finalClassList.length > 1 ? new RegExp('^(?:' + finalClassList.map(escapeRegex).join('|') + ')$', 'i') : new RegExp('^' + escapeRegex(rawClass) + '$', 'i'));

        const escSub = subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const filter = {
            isArchived: { $nin: [true, 'true', 1] },
            status: { $nin: ['rejected'] },
            classLevel: classFilter,
            subject: new RegExp(`^${escSub}$`, 'i')
        };

        if (segment && segment !== 'all') {
            const escSeg = segment.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.segment = new RegExp(`^${escSeg}$`, 'i');
        }

        const topics = await Topic.find(filter).select('chapter status segment').lean();
        const chaptersMap = new Map();

        topics.forEach(t => {
            if (t.chapter && t.chapter.name) {
                const name = t.chapter.name.trim();
                const num = (typeof t.chapter.number === 'number') ? t.chapter.number : (parseInt(t.chapter.number, 10) || 1);
                const seg = t.segment || '';
                const key = `${seg}_${num}_${name.toLowerCase()}`;
                if (!chaptersMap.has(key)) {
                    chaptersMap.set(key, {
                        number: num,
                        name: name,
                        segment: t.segment || '',
                        status: t.status || 'approved'
                    });
                } else if (!chaptersMap.get(key).segment && t.segment) {
                    chaptersMap.get(key).segment = t.segment;
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
        const { name, code, classLevel, classLevels, group, subject, chapterName, chapterNumber, difficulty, keywords, description, order, segment } = req.body;
        const topicSegment = (segment || '').trim();

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

        const subTopicsArray = parseSubTopics(req.body.subTopics || req.body['subTopics[]']);

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
                if (isTeacher) {
                    existingTopic.submittedBy = req.session.user._id;
                }

                existingTopic.name = name.trim();
                existingTopic.code = code ? code.trim() : (existingTopic.code || '');
                existingTopic.classLevel = targetClasses[0];
                existingTopic.group = group || 'None';
                existingTopic.subject = subject.trim();
                if (segment !== undefined) existingTopic.segment = topicSegment;
                existingTopic.chapter = {
                    number: parseInt(chapterNumber, 10) || 1,
                    name: chapterName.trim()
                };
                existingTopic.difficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : (existingTopic.difficulty || 'Medium');
                existingTopic.keywords = keywordsArray;
                existingTopic.description = description ? description.trim() : '';
                if (subTopicsArray.length > 0 || req.body.subTopics !== undefined) {
                    existingTopic.subTopics = subTopicsArray;
                }
                existingTopic.order = parseInt(order, 10) || 0;
                existingTopic.group = await resolveGroupByClassAndSubject(targetClasses[0], subject.trim(), group || existingTopic.group);
                existingTopic.status = topicStatus;
                existingTopic.rejectionReason = '';
                existingTopic.updatedAt = new Date();
                await existingTopic.save();
                await ensureSubjectInAcademicClass(targetClasses[0], subject.trim(), group);

                // Sync / Clone to other selected classes on edit (e.g., Class 9 & Class 10, or Class 11 & Class 12)
                if (targetClasses.length > 1) {
                    for (let i = 1; i < targetClasses.length; i++) {
                        const extraCls = targetClasses[i];
                        let partnerTopic = await Topic.findOne({
                            $or: [
                                { _id: { $ne: existingTopic._id }, classLevel: new RegExp(`^${escapeRegex(extraCls)}$`, 'i'), subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'), 'chapter.number': existingTopic.chapter?.number, name: new RegExp(`^${escapeRegex(existingTopic.name)}$`, 'i') },
                                { _id: { $ne: existingTopic._id }, classLevel: new RegExp(`^${escapeRegex(extraCls)}$`, 'i'), subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'), 'chapter.number': parseInt(chapterNumber, 10) || 1, name: new RegExp(`^${escapeRegex(name)}$`, 'i') }
                            ],
                            isArchived: { $ne: true }
                        });

                        if (partnerTopic) {
                            partnerTopic.name = name.trim();
                            partnerTopic.code = code ? code.trim() : (partnerTopic.code || '');
                            partnerTopic.segment = topicSegment || existingTopic.segment || partnerTopic.segment || '';
                            partnerTopic.chapter = { number: parseInt(chapterNumber, 10) || 1, name: chapterName.trim() };
                            partnerTopic.difficulty = ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : (partnerTopic.difficulty || 'Medium');
                            partnerTopic.keywords = keywordsArray;
                            partnerTopic.description = description ? description.trim() : '';
                            if (subTopicsArray.length > 0 || req.body.subTopics !== undefined) {
                                partnerTopic.subTopics = subTopicsArray;
                            }
                            partnerTopic.order = parseInt(order, 10) || partnerTopic.order || 0;
                            partnerTopic.group = await resolveGroupByClassAndSubject(extraCls, subject.trim(), group || partnerTopic.group);
                            partnerTopic.submittedBy = isTeacher ? req.session.user._id : partnerTopic.submittedBy;
                            partnerTopic.status = topicStatus;
                            partnerTopic.rejectionReason = '';
                            partnerTopic.updatedAt = new Date();
                            await partnerTopic.save();
                        } else {
                            await Topic.create({
                                name: name.trim(),
                                code: code ? code.trim() : '',
                                classLevel: extraCls,
                                group: await resolveGroupByClassAndSubject(extraCls, subject.trim(), group),
                                subject: subject.trim(),
                                segment: topicSegment || existingTopic.segment || '',
                                chapter: { number: parseInt(chapterNumber, 10) || 1, name: chapterName.trim() },
                                difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
                                keywords: keywordsArray,
                                description: description ? description.trim() : '',
                                subTopics: existingTopic.subTopics || subTopicsArray,
                                order: parseInt(order, 10) || 0,
                                status: topicStatus,
                                submittedBy: isTeacher ? req.session.user._id : null,
                                createdBy: req.session && req.session.user ? req.session.user._id : null
                            });
                        }
                        await ensureSubjectInAcademicClass(extraCls, subject.trim(), group);
                    }
                }

                if (isTeacher) {
                    try {
                        const pushNotificationService = require('../services/pushNotificationService');
                        const teacherName = req.session.user ? req.session.user.name : 'Teacher';
                        const notifPayload = {
                            title: 'Topic Edited Awaiting Approval',
                            body: `Teacher ${teacherName} edited "${name.trim()}" (${targetClasses.join(', ')} - ${subject}).`,
                            url: '/superadmin/topics?tab=pending',
                            type: 'system'
                        };
                        pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                        pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
                    } catch (e) { }
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
                if (Array.isArray(subTopicsArray)) {
                    existing.subTopics = subTopicsArray;
                }
                if (existing.status === 'rejected') {
                    existing.status = topicStatus;
                    existing.rejectionReason = '';
                    existing.submittedBy = isTeacher ? req.session.user._id : existing.submittedBy;
                } else if (!isTeacher) {
                    existing.status = 'approved';
                }
                existing.updatedAt = new Date();
                await existing.save();
                createdTopics.push(existing);
            } else {
                const newTopic = await Topic.create({
                    name: name.trim(),
                    code: code ? code.trim() : '',
                    classLevel: cls,
                    group: await resolveGroupByClassAndSubject(cls, subject.trim(), group),
                    subject: subject.trim(),
                    segment: topicSegment,
                    chapter: {
                        number: parseInt(chapterNumber, 10) || 1,
                        name: chapterName.trim()
                    },
                    difficulty: ['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Medium',
                    keywords: keywordsArray,
                    description: description ? description.trim() : '',
                    subTopics: subTopicsArray,
                    order: parseInt(order, 10) || 0,
                    status: topicStatus,
                    submittedBy: isTeacher ? req.session.user._id : null,
                    createdBy: req.session && req.session.user ? req.session.user._id : null
                });
                createdTopics.push(newTopic);
            }
            await ensureSubjectInAcademicClass(cls, subject.trim(), group);
            await Topic.deleteMany({
                classLevel: new RegExp(`^${escapeRegex(cls)}$`, 'i'),
                subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                'chapter.name': new RegExp(`^${escapeRegex(chapterName)}$`, 'i'),
                isChapterPlaceholder: true
            }).catch(() => { });
        }

        // Ensure Subject folder and Chapter subfolder exist in Notes for these classes
        await ensureSyllabusFoldersForChapter(targetClasses, subject.trim(), chapterName.trim(), req.session && req.session.user ? req.session.user._id : null);

        const successMsg = isTeacher
            ? `Topic "${name.trim()}" submitted for Admin review across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`
            : `Topic "${name.trim()}" created successfully for ${targetClasses.length} class(es): ${targetClasses.join(', ')}`;

        if (isTeacher && createdTopics.length > 0) {
            try {
                const pushNotificationService = require('../services/pushNotificationService');
                const teacherName = req.session.user ? req.session.user.name : 'Teacher';
                const notifPayload = {
                    title: 'New Topic Awaiting Approval',
                    body: `Teacher ${teacherName} submitted "${name.trim()}" (${targetClasses.join(', ')} - ${subject}).`,
                    url: '/superadmin/topics',
                    type: 'system'
                };
                pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
            } catch (e) { }
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
        const { classLevel, classLevels, group, subject, chapterName, chapterNumber, topicList, difficulty, segment, isChapterEdit, oldChapterName } = req.body;
        const topicSegment = (segment || '').trim();

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

        let rawTopicsInput = req.body.topics || req.body.topicsData || topicList;
        if (typeof rawTopicsInput === 'string') {
            const trimmed = rawTopicsInput.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    rawTopicsInput = JSON.parse(trimmed);
                } catch (e) { }
            }
        }

        let topicsToProcess = [];
        if (Array.isArray(rawTopicsInput)) {
            topicsToProcess = rawTopicsInput.map(item => {
                if (typeof item === 'string') {
                    return { name: item.trim(), subTopics: [], difficulty: difficulty || 'Medium', code: '', description: '' };
                } else if (item && typeof item === 'object') {
                    return {
                        name: String(item.name || '').trim(),
                        subTopics: parseSubTopics(item.subTopics),
                        difficulty: item.difficulty || difficulty || 'Medium',
                        code: item.code ? String(item.code).trim() : '',
                        description: item.description ? String(item.description).trim() : ''
                    };
                }
                return null;
            }).filter(t => t && t.name);
        } else if (typeof rawTopicsInput === 'string') {
            topicsToProcess = rawTopicsInput.split(/[\n,]/).map(s => s.trim()).filter(Boolean).map(n => ({
                name: n,
                subTopics: [],
                difficulty: difficulty || 'Medium',
                code: '',
                description: ''
            }));
        }

        if (topicsToProcess.length === 0 && !isChapterEdit) {
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
            // If editing a chapter, handle any topics that were removed from the chapter in the editing form
            if (isChapterEdit) {
                const effectiveOldChName = (oldChapterName || chapterName).trim();
                const submittedNamesLower = new Set(topicsToProcess.map(t => t.name.toLowerCase()));

                const existingInChapter = await Topic.find({
                    classLevel: new RegExp(`^${escapeRegex(cls)}$`, 'i'),
                    subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                    'chapter.name': new RegExp(`^${escapeRegex(effectiveOldChName)}$`, 'i'),
                    isArchived: { $ne: true }
                });

                const removedTopics = existingInChapter.filter(t => !submittedNamesLower.has(t.name.trim().toLowerCase()));
                if (removedTopics.length > 0) {
                    if (isTeacher) {
                        // Unapproved (pending/rejected) topics removed from form are directly deleted
                        const unapprovedRemovedIds = removedTopics.filter(t => t.status === 'pending' || t.status === 'rejected').map(t => t._id);
                        if (unapprovedRemovedIds.length > 0) {
                            await Topic.deleteMany({ _id: { $in: unapprovedRemovedIds } });
                        }
                        // Already approved topics removed by teacher are submitted as deletion request
                        const approvedRemovedIds = removedTopics.filter(t => t.status === 'approved').map(t => t._id);
                        if (approvedRemovedIds.length > 0) {
                            await Topic.updateMany(
                                { _id: { $in: approvedRemovedIds } },
                                {
                                    $set: {
                                        'deletionRequest.isRequested': true,
                                        'deletionRequest.reason': 'Removed from chapter during teacher edit / চ্যাপ্টার সম্পাদনার সময় বাদ দেওয়া হয়েছে',
                                        'deletionRequest.requestedBy': req.session.user._id,
                                        'deletionRequest.requestedByName': req.session.user.name || 'Teacher',
                                        'deletionRequest.requestedAt': new Date(),
                                        'deletionRequest.status': 'pending'
                                    }
                                }
                            );
                        }
                    } else {
                        // For Superadmin/Admin: permanently delete removed topics and their sub-topics
                        const removedIds = removedTopics.map(t => t._id);
                        await Topic.deleteMany({ _id: { $in: removedIds } });
                    }
                }
            }

            if (topicsToProcess.length === 0 && isChapterEdit) {
                await Topic.findOneAndUpdate(
                    {
                        classLevel: cls,
                        subject: subject.trim(),
                        'chapter.name': chapterName.trim(),
                        isChapterPlaceholder: true
                    },
                    {
                        $set: {
                            name: '__EMPTY_CHAPTER__',
                            classLevel: cls,
                            subject: subject.trim(),
                            segment: topicSegment,
                            chapter: { number: chNum, name: chapterName.trim() },
                            status: 'approved',
                            isArchived: false,
                            isChapterPlaceholder: true
                        }
                    },
                    { upsert: true, new: true }
                );
            }

            for (let i = 0; i < topicsToProcess.length; i++) {
                const item = topicsToProcess[i];
                const name = item.name;
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
                        code: item.code || '',
                        classLevel: cls,
                        group: await resolveGroupByClassAndSubject(cls, subject.trim(), group),
                        subject: subject.trim(),
                        segment: topicSegment,
                        chapter: {
                            number: chNum,
                            name: chapterName.trim()
                        },
                        difficulty: ['Easy', 'Medium', 'Hard'].includes(item.difficulty) ? item.difficulty : 'Medium',
                        description: item.description || '',
                        subTopics: item.subTopics || [],
                        order: i + 1,
                        status: topicStatus,
                        submittedBy: isTeacher ? req.session.user._id : null,
                        createdBy: req.session && req.session.user ? req.session.user._id : null
                    });
                    createdTopics.push(topic);
                } else {
                    if (Array.isArray(item.subTopics)) {
                        existing.subTopics = item.subTopics;
                    }
                    if (existing.status === 'rejected') {
                        existing.status = topicStatus;
                        existing.rejectionReason = '';
                        existing.submittedBy = isTeacher ? req.session.user._id : existing.submittedBy;
                    } else if (!isTeacher) {
                        existing.status = 'approved';
                    }
                    existing.updatedAt = new Date();
                    await existing.save();
                    createdTopics.push(existing);
                }
            }
            await ensureSubjectInAcademicClass(cls, subject.trim(), group);
            await Topic.deleteMany({
                classLevel: new RegExp(`^${escapeRegex(cls)}$`, 'i'),
                subject: new RegExp(`^${escapeRegex(subject)}$`, 'i'),
                'chapter.name': new RegExp(`^${escapeRegex(chapterName)}$`, 'i'),
                isChapterPlaceholder: true
            }).catch(() => { });
        }

        // Ensure Subject folder and Chapter subfolder exist in Notes for these classes
        await ensureSyllabusFoldersForChapter(targetClasses, subject.trim(), chapterName.trim(), req.session && req.session.user ? req.session.user._id : null);

        const successMsg = isTeacher
            ? `${createdTopics.length} topics submitted for Admin review across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`
            : `${createdTopics.length} topics added to "${chapterName}" across ${targetClasses.length} class(es): ${targetClasses.join(', ')}`;

        if (isTeacher && createdTopics.length > 0) {
            try {
                const pushNotificationService = require('../services/pushNotificationService');
                const teacherName = req.session.user ? req.session.user.name : 'Teacher';
                const notifPayload = {
                    title: 'New Topics Submitted for Review',
                    body: `Teacher ${teacherName} submitted ${createdTopics.length} topic(s) under "${chapterName}" (${targetClasses.join(', ')} - ${subject}).`,
                    url: '/superadmin/topics',
                    type: 'system'
                };
                pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
            } catch (e) { }
        }

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
        const { name, code, classLevel, group, subject, chapterName, chapterNumber, difficulty, keywords, description, order, segment } = req.body;

        const updatePayload = {};
        if (name) updatePayload.name = name.trim();
        if (code !== undefined) updatePayload.code = String(code).trim();
        if (classLevel) updatePayload.classLevel = classLevel.trim();
        if (group) updatePayload.group = group;
        if (subject) updatePayload.subject = subject.trim();
        if (segment !== undefined) updatePayload.segment = String(segment).trim();
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
        if (req.body.subTopics !== undefined) {
            updatePayload.subTopics = parseSubTopics(req.body.subTopics);
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

        // Ensure chapter itself is NOT deleted if this was the last active topic
        if (updated.chapter && updated.chapter.name) {
            const chName = updated.chapter.name.trim();
            const remainingActive = await Topic.countDocuments({
                _id: { $ne: updated._id },
                classLevel: updated.classLevel,
                subject: updated.subject,
                'chapter.name': new RegExp(`^${escapeRegex(chName)}$`, 'i'),
                isArchived: { $nin: [true, 'true', 1] },
                isChapterPlaceholder: { $ne: true }
            });

            if (remainingActive === 0) {
                await Topic.findOneAndUpdate(
                    {
                        classLevel: updated.classLevel,
                        subject: updated.subject,
                        'chapter.name': chName,
                        isChapterPlaceholder: true
                    },
                    {
                        $set: {
                            name: '__EMPTY_CHAPTER__',
                            classLevel: updated.classLevel,
                            subject: updated.subject,
                            segment: updated.segment || '',
                            chapter: { number: updated.chapter.number || 1, name: chName },
                            status: 'approved',
                            isArchived: false,
                            isChapterPlaceholder: true
                        }
                    },
                    { upsert: true, new: true }
                );
            }
        }
        clearTopicsApiCache();

        res.json({
            success: true,
            message: `Topic "${updated.name}" moved to History Bucket (chapter preserved)`,
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

        // Ensure chapter itself is NOT deleted if this was the last active topic
        if (deleted.chapter && deleted.chapter.name) {
            const chName = deleted.chapter.name.trim();
            const remainingActive = await Topic.countDocuments({
                classLevel: deleted.classLevel,
                subject: deleted.subject,
                'chapter.name': new RegExp(`^${escapeRegex(chName)}$`, 'i'),
                isArchived: { $nin: [true, 'true', 1] },
                isChapterPlaceholder: { $ne: true }
            });

            if (remainingActive === 0) {
                await Topic.findOneAndUpdate(
                    {
                        classLevel: deleted.classLevel,
                        subject: deleted.subject,
                        'chapter.name': chName,
                        isChapterPlaceholder: true
                    },
                    {
                        $set: {
                            name: '__EMPTY_CHAPTER__',
                            classLevel: deleted.classLevel,
                            subject: deleted.subject,
                            segment: deleted.segment || '',
                            chapter: { number: deleted.chapter.number || 1, name: chName },
                            status: 'approved',
                            isArchived: false,
                            isChapterPlaceholder: true
                        }
                    },
                    { upsert: true, new: true }
                );
            }
        }
        clearTopicsApiCache();

        res.json({
            success: true,
            message: 'Topic permanently deleted from database (chapter preserved)'
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
        // Also remove any chapter placeholder since the chapter itself was deleted
        await Topic.deleteMany({
            classLevel: new RegExp(`^${escapedClass}$`, 'i'),
            subject: new RegExp(`^${escapedSubject}$`, 'i'),
            'chapter.name': new RegExp(`^${escapedChapter}$`, 'i'),
            isChapterPlaceholder: true
        });
        clearTopicsApiCache();

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

// Edit / Rename Chapter Name & Number across topics
const editChapter = async (req, res) => {
    try {
        await connectDB();
        const { classLevel, classLevels, subject, oldChapterName, newChapterName, newChapterNumber } = req.body;

        if (!classLevel || !subject || !oldChapterName || !newChapterName || !newChapterName.trim()) {
            return res.status(400).json({ success: false, error: 'Class, Subject, Old Chapter Name, and New Chapter Name are required' });
        }

        const isTeacher = req.session && req.session.user && req.session.user.role === 'teacher';

        // Normalize target classes (supports cross-class sync for Class 9-10 & 11-12)
        let targetClasses = [];
        if (Array.isArray(classLevels) && classLevels.length > 0) {
            targetClasses = classLevels.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof classLevels === 'string' && classLevels.trim()) {
            targetClasses = classLevels.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            const linked = getLinkedClasses(classLevel);
            targetClasses = Array.isArray(linked) && linked.length > 0 ? linked : [classLevel.trim()];
        }

        // Permission check for teachers
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

        const escapedOld = oldChapterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedSub = subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const classRegexes = targetClasses.map(c => new RegExp(`^${c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

        const filter = {
            classLevel: { $in: classRegexes },
            subject: new RegExp(`^${escapedSub}$`, 'i'),
            'chapter.name': new RegExp(`^${escapedOld}$`, 'i'),
            isArchived: { $ne: true }
        };

        const updateSet = {
            'chapter.name': newChapterName.trim(),
            updatedAt: new Date()
        };

        if (newChapterNumber !== undefined && !isNaN(parseInt(newChapterNumber, 10))) {
            updateSet['chapter.number'] = parseInt(newChapterNumber, 10);
        }

        if (isTeacher) {
            updateSet.status = 'pending';
            updateSet.submittedBy = req.session.user._id;
            updateSet.rejectionReason = '';
            updateSet.reviewedBy = null;
            updateSet.reviewedAt = null;
        }

        const result = await Topic.updateMany(filter, { $set: updateSet });

        // Update folder names in Notes if existing
        try {
            await Folder.updateMany(
                { name: new RegExp(`^${escapedOld}$`, 'i'), classLevel: { $in: classRegexes } },
                { $set: { name: newChapterName.trim() } }
            );
            await ensureSyllabusFoldersForChapter(targetClasses, subject.trim(), newChapterName.trim());
        } catch (e) { }

        clearTopicsApiCache();

        if (isTeacher) {
            try {
                const pushNotificationService = require('../services/pushNotificationService');
                const teacherName = req.session.user ? req.session.user.name : 'Teacher';
                const notifPayload = {
                    title: 'Chapter Name Edited Awaiting Approval',
                    body: `Teacher ${teacherName} renamed chapter "${oldChapterName.trim()}" to "${newChapterName.trim()}" (${targetClasses.join(', ')} - ${subject}).`,
                    url: '/superadmin/topics?tab=pending',
                    type: 'system'
                };
                pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
            } catch (e) { }
        }

        return res.json({
            success: true,
            message: isTeacher
                ? `Chapter name updated to "${newChapterName.trim()}" and submitted for Admin review (${result.modifiedCount} topics updated).`
                : `Chapter name updated to "${newChapterName.trim()}" successfully (${result.modifiedCount} topics updated).`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('editChapter Error:', error);
        return res.status(500).json({ success: false, error: 'Server error: ' + error.message });
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
            clearTopicsApiCache();
            return res.json({
                success: true,
                message: `${result.modifiedCount} topic(s) restored to live syllabus`,
                count: result.modifiedCount
            });
        } else {
            // Default: archive (move to History Bucket)
            const topicsToArchive = await Topic.find({ _id: { $in: validIds } }).select('classLevel subject segment chapter').lean();
            const result = await Topic.updateMany({ _id: { $in: validIds } }, { $set: { isArchived: true } });

            for (const t of topicsToArchive) {
                if (t.chapter && t.chapter.name) {
                    const chName = t.chapter.name.trim();
                    const remainingActive = await Topic.countDocuments({
                        classLevel: t.classLevel,
                        subject: t.subject,
                        'chapter.name': new RegExp(`^${escapeRegex(chName)}$`, 'i'),
                        isArchived: { $nin: [true, 'true', 1] },
                        isChapterPlaceholder: { $ne: true }
                    });

                    if (remainingActive === 0) {
                        await Topic.findOneAndUpdate(
                            {
                                classLevel: t.classLevel,
                                subject: t.subject,
                                'chapter.name': chName,
                                isChapterPlaceholder: true
                            },
                            {
                                $set: {
                                    name: '__EMPTY_CHAPTER__',
                                    classLevel: t.classLevel,
                                    subject: t.subject,
                                    segment: t.segment || '',
                                    chapter: { number: t.chapter.number || 1, name: chName },
                                    status: 'approved',
                                    isArchived: false,
                                    isChapterPlaceholder: true
                                }
                            },
                            { upsert: true, new: true }
                        );
                    }
                }
            }
            clearTopicsApiCache();

            return res.json({
                success: true,
                message: `${result.modifiedCount} topic(s) moved to History Bucket (chapters preserved)`,
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

        if (topic.submittedBy || topic.createdBy) {
            try {
                const teacherId = topic.submittedBy || topic.createdBy;
                const pushNotificationService = require('../services/pushNotificationService');
                pushNotificationService.sendToUser(teacherId, {
                    title: 'Topic Approved! 🎉',
                    body: `Your topic "${topic.name}" has been approved and published to the live syllabus.`,
                    url: '/teacher/topics?tab=submissions&subStatus=approved',
                    type: 'system'
                }).catch(() => { });
            } catch (e) { }
        }

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

        try {
            const pushNotificationService = require('../services/pushNotificationService');
            const teacherMap = new Map();
            topicsToApprove.forEach(t => {
                const uid = t.submittedBy || t.createdBy;
                if (uid) {
                    const strId = String(uid);
                    if (!teacherMap.has(strId)) teacherMap.set(strId, []);
                    teacherMap.get(strId).push(t);
                }
            });
            teacherMap.forEach((tList, uid) => {
                pushNotificationService.sendToUser(uid, {
                    title: 'Topics Approved! 🎉',
                    body: `${tList.length} of your submitted topic(s) have been approved and published to the live syllabus.`,
                    url: '/teacher/topics?tab=submissions&subStatus=approved',
                    type: 'system'
                }).catch(() => { });
            });
        } catch (e) { }

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

        if (topic.submittedBy || topic.createdBy) {
            try {
                const teacherId = topic.submittedBy || topic.createdBy;
                const pushNotificationService = require('../services/pushNotificationService');
                pushNotificationService.sendToUser(teacherId, {
                    title: 'Topic Revision Required ⚠️',
                    body: `Topic "${topic.name}" requires revision: ${reason || 'Please review syllabus alignment.'}`,
                    url: '/teacher/topics?tab=submissions&subStatus=rejected',
                    type: 'system'
                }).catch(() => { });
            } catch (e) { }
        }

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
        const topicsToReject = await Topic.find({ _id: { $in: validIds } }).select('name submittedBy createdBy').lean();
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

        try {
            const pushNotificationService = require('../services/pushNotificationService');
            const teacherMap = new Map();
            topicsToReject.forEach(t => {
                const uid = t.submittedBy || t.createdBy;
                if (uid) {
                    const strId = String(uid);
                    if (!teacherMap.has(strId)) teacherMap.set(strId, []);
                    teacherMap.get(strId).push(t);
                }
            });
            teacherMap.forEach((tList, uid) => {
                pushNotificationService.sendToUser(uid, {
                    title: 'Topics Revision Required ⚠️',
                    body: `${tList.length} of your submitted topic(s) require revision: ${reason || 'Please review and resubmit.'}`,
                    url: '/teacher/topics?tab=submissions&subStatus=rejected',
                    type: 'system'
                }).catch(() => { });
            });
        } catch (e) { }

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
        let selectedSubject = (req.query.subject || '').trim();

        const currentClassObj = classes.find(c => c.name.toLowerCase() === selectedClass.toLowerCase()) || classes[0] || null;

        // Resolve class subjects (Include common subjects + all group subjects + flat subjects)
        let classSubjects = [];
        if (currentClassObj) {
            if (currentClassObj.hasGroups && currentClassObj.groups && currentClassObj.groups.length > 0) {
                const allGrpSubs = currentClassObj.groups.flatMap(g => g.subjects || []);
                classSubjects = Array.from(new Set([
                    ...(currentClassObj.commonSubjects || []),
                    ...(currentClassObj.subjects || []),
                    ...allGrpSubs
                ]));
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

        // Automatically determine which group selectedSubject belongs to in this class
        let autoGroup = 'None';
        if (currentClassObj && currentClassObj.hasGroups && currentClassObj.groups) {
            const cleanSub = selectedSubject.trim().toLowerCase();
            const foundGroup = currentClassObj.groups.find(g => (g.subjects || []).some(s => s.trim().toLowerCase() === cleanSub || matchesSubject(s, [cleanSub])));
            if (foundGroup) {
                autoGroup = foundGroup.name; // 'Science', 'Commerce', 'Humanities'
            } else if (currentClassObj.commonSubjects && currentClassObj.commonSubjects.some(s => s.trim().toLowerCase() === cleanSub || matchesSubject(s, [cleanSub]))) {
                autoGroup = 'all';
            }
        }
        let selectedGroup = autoGroup;

        // Check Subject Segmentation Rules
        const { resolveSubjectSegments: resolveTeacherSegments } = require('../utils/subjectRuleHelper');
        const { hasSegments: subjectHasSegments, segments: subjectSegments } = await resolveTeacherSegments(selectedSubject, selectedClass);
        let selectedSegment = (req.query.segment || 'all').trim();

        // 2. Query Live Approved Topics (Only for assigned class & subject)
        let activeTopics = [];
        let chapters = [];
        let segmentStats = {};

        if (selectedClass && selectedSubject) {
            const escClass = selectedClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escSub = selectedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const activeFilter = {
                isArchived: { $nin: [true, 'true', 1] },
                status: { $nin: ['pending', 'rejected'] },
                classLevel: new RegExp('^' + escClass + '$', 'i'),
                subject: new RegExp('^' + escSub + '$', 'i')
            };

            if (selectedSegment && selectedSegment !== 'all') {
                activeFilter.segment = new RegExp('^' + selectedSegment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
            }

            activeTopics = await Topic.find(activeFilter).sort({ 'chapter.number': 1, order: 1, createdAt: 1 }).lean();

            const chaptersMap = new Map();
            activeTopics.forEach(top => {
                const chName = (top.chapter && top.chapter.name) ? top.chapter.name.trim() : 'General / অধ্যায়হীন';
                const chNum = (top.chapter && typeof top.chapter.number === 'number') ? top.chapter.number : 1;
                const isValidSeg = subjectHasSegments && top.segment && subjectSegments.some(s => s.toLowerCase() === top.segment.toLowerCase());
                const chSeg = isValidSeg ? top.segment : '';
                const key = subjectHasSegments ? `${chSeg}___${chName}` : chName;
                if (!chaptersMap.has(key)) {
                    chaptersMap.set(key, {
                        name: chName,
                        number: chNum,
                        segment: chSeg,
                        topics: []
                    });
                } else if (!chaptersMap.get(key).segment && chSeg) {
                    chaptersMap.get(key).segment = chSeg;
                }
                if (!top.isChapterPlaceholder && top.name !== '__EMPTY_CHAPTER__') {
                    chaptersMap.get(key).topics.push(top);
                }
            });

            if (subjectHasSegments) {
                const segOrderMap = new Map();
                (subjectSegments || []).forEach((s, idx) => segOrderMap.set(s.toLowerCase(), idx));
                chapters = Array.from(chaptersMap.values()).sort((a, b) => {
                    const segOrderA = segOrderMap.has((a.segment || '').toLowerCase()) ? segOrderMap.get(a.segment.toLowerCase()) : 999;
                    const segOrderB = segOrderMap.has((b.segment || '').toLowerCase()) ? segOrderMap.get(b.segment.toLowerCase()) : 999;
                    if (segOrderA !== segOrderB) return segOrderA - segOrderB;
                    return a.number - b.number;
                });
            } else {
                chapters = Array.from(chaptersMap.values()).sort((a, b) => a.number - b.number);
            }

            segmentStats = {};
            if (subjectHasSegments && Array.isArray(subjectSegments)) {
                subjectSegments.forEach(seg => {
                    const segLower = seg.toLowerCase();
                    const segChaps = chapters.filter(c => (c.segment || '').toLowerCase() === segLower);
                    const segTopics = activeTopics.filter(t => !t.isChapterPlaceholder && t.name !== '__EMPTY_CHAPTER__' && (t.segment || '').toLowerCase() === segLower);
                    segmentStats[seg] = {
                        chaptersCount: segChaps.length,
                        topicsCount: segTopics.length
                    };
                });
            }
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
        const myDeletionRequests = mySubmissions.filter(t => t.deletionRequest && t.deletionRequest.isRequested && t.deletionRequest.status === 'pending');

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
            subjectHasSegments,
            subjectSegments: subjectSegments || [],
            segmentStats: segmentStats || {},
            selectedSegment,
            assignedClasses,
            assignedSubjects,
            chapters,
            activeTopics: (activeTopics || []).filter(t => !t.isChapterPlaceholder && t.name !== '__EMPTY_CHAPTER__'),
            mySubmissions,
            mySubmissionChapters,
            myPendingTopics,
            myRejectedTopics,
            myApprovedTopics,
            myDeletionRequests,
            totalActiveCount: (activeTopics || []).filter(t => !t.isChapterPlaceholder && t.name !== '__EMPTY_CHAPTER__').length,
            pendingCount: myPendingTopics.length,
            deletionRequestCount: myDeletionRequests.length,
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
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Valid topic ID required' });
        }

        const existing = await Topic.findById(id).lean();
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Topic not found' });
        }

        if (existing.status === 'approved') {
            return res.status(403).json({
                success: false,
                error: 'Approved topics cannot be deleted by teachers. Only administrators have permission to delete approved syllabus topics.'
            });
        }

        const topic = await Topic.findOneAndDelete({
            _id: id,
            $or: [{ submittedBy: req.session.user._id }, { createdBy: req.session.user._id }],
            status: { $in: ['pending', 'rejected'] }
        });

        if (!topic) {
            return res.status(403).json({ success: false, error: 'You do not have permission to delete this topic submission.' });
        }

        res.json({ success: true, message: 'Submission removed successfully' });
    } catch (error) {
        console.error('deletePendingTeacherTopic Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bulk Action for Teacher Submissions (Delete or Resubmit)
const bulkActionTeacherSubmissions = async (req, res) => {
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

        const userId = req.session.user && req.session.user._id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        if (action === 'delete') {
            // Strictly check if ANY of the topics are approved
            const approvedItems = await Topic.find({
                _id: { $in: validIds },
                status: 'approved'
            }).select('name').lean();

            if (approvedItems.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: `Deletion rejected: ${approvedItems.length} selected topic(s) (including "${approvedItems[0].name}") are already approved. Teachers cannot delete approved topics or chapters.`
                });
            }

            const baseQuery = {
                _id: { $in: validIds },
                $or: [{ submittedBy: userId }, { createdBy: userId }],
                status: { $in: ['pending', 'rejected'] }
            };

            const result = await Topic.deleteMany(baseQuery);
            return res.json({
                success: true,
                message: `${result.deletedCount} topic submission(s) removed successfully`,
                count: result.deletedCount
            });
        } else if (action === 'resubmit') {
            const resubmitQuery = {
                _id: { $in: validIds },
                $or: [{ submittedBy: userId }, { createdBy: userId }],
                status: 'rejected'
            };
            const result = await Topic.updateMany(resubmitQuery, {
                $set: {
                    status: 'pending',
                    rejectionReason: '',
                    updatedAt: new Date()
                }
            });

            if (result.modifiedCount > 0) {
                try {
                    const pushNotificationService = require('../services/pushNotificationService');
                    const teacherName = req.session.user ? req.session.user.name : 'Teacher';
                    const notifPayload = {
                        title: 'Topics Resubmitted for Review',
                        body: `Teacher ${teacherName} resubmitted ${result.modifiedCount} topic(s) for review.`,
                        url: '/superadmin/topics',
                        type: 'system'
                    };
                    pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                    pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
                } catch (e) { }
            }

            return res.json({
                success: true,
                message: `${result.modifiedCount} rejected topic(s) resubmitted for review`,
                count: result.modifiedCount
            });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid bulk action specified' });
        }
    } catch (error) {
        console.error('bulkActionTeacherSubmissions Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// API: Check if a topic (with same subject & chapter) exists in other classes syllabus
const checkCrossClassTopic = async (req, res) => {
    try {
        if (mongoose.connection && mongoose.connection.readyState !== 1) {
            try { await connectDB(); } catch (e) { }
        }
        const { subject, topic, chapter } = req.query;
        const currentClassesRaw = req.query.currentClasses || req.query.currentClass || "";
        let currentClasses = [];
        if (Array.isArray(currentClassesRaw)) {
            currentClasses = currentClassesRaw.flatMap(c => String(c).split(",")).map(c => c.trim().toLowerCase()).filter(Boolean);
        } else if (currentClassesRaw) {
            currentClasses = String(currentClassesRaw).split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
        }

        if (!subject || (!topic && !chapter)) {
            return res.json({ success: true, hasCrossClass: false, matchingClasses: [], details: [] });
        }

        const cleanSubject = String(subject).trim();
        const rawTopicList = (Array.isArray(topic) ? topic : String(topic || '').split(','))
            .map(t => String(t || '').trim())
            .filter(Boolean);
        const cleanChapter = chapter ? String(chapter).trim() : "";

        if (rawTopicList.length === 0 && !cleanChapter) {
            return res.json({ success: true, hasCrossClass: false, matchingClasses: [], details: [] });
        }

        // Normalize string helper (removes parentheticals, chapter prefixes, extra spaces)
        const normalizeText = (str) => {
            if (!str) return "";
            return String(str)
                .toLowerCase()
                .replace(/^(?:অধ্যায়|অধ্যায়|chapter|ch)[\s\d:.-]+/i, "")
                .replace(/\([^\)]*\)/g, "")
                .replace(/[\s\-_:]+/g, " ")
                .trim();
        };

        const isChapterMatch = (chap1, chap2) => {
            if (!chap1 || !chap2) return false;
            const c1 = String(chap1).trim().toLowerCase();
            const c2 = String(chap2).trim().toLowerCase();
            if (c1 === c2) return true;
            const n1 = normalizeText(c1);
            const n2 = normalizeText(c2);
            if (n1 && n2 && (n1 === n2 || n1.includes(n2) || n2.includes(n1))) return true;
            return false;
        };

        const isTopicMatch = (t1, t2) => {
            if (!t1 || !t2) return false;
            const a = String(t1).trim().toLowerCase();
            const b = String(t2).trim().toLowerCase();
            if (a === b) return true;
            const na = normalizeText(a);
            const nb = normalizeText(b);
            if (na && nb && (na === nb || na.includes(nb) || nb.includes(na))) return true;
            return false;
        };

        // Find approved/active topics in syllabus with matching subject
        const aliases = getSubjectAliases(cleanSubject);
        const filter = {
            isArchived: { $nin: [true, "true", 1] },
            status: { $nin: ["pending", "rejected"] },
            subject: new RegExp('^(?:' + aliases.map(escapeRegex).join('|') + ')$', 'i')
        };

        const matchingTopics = await Topic.find(filter).select("classLevel subject chapter name").lean();

        // Group by classLevel, filtering out currently selected classes
        const classMap = new Map();
        matchingTopics.forEach(t => {
            const cls = (t.classLevel || "").trim();
            if (!cls) return;
            const clsLower = cls.toLowerCase();

            // Check if this class is already in currentClasses
            const isCurrent = currentClasses.some(cc => cc === clsLower);
            if (isCurrent) return;

            // Check if topic matches any of the requested topics (if topic was specified)
            const tName = (t.name || "").trim();
            if (rawTopicList.length > 0) {
                const matchedReqTopic = rawTopicList.some(reqT => isTopicMatch(reqT, tName));
                if (!matchedReqTopic) return;
            }

            const tChapName = (t.chapter && t.chapter.name) ? t.chapter.name.trim() : "";

            // If chapter is provided, enforce architectural match
            if (cleanChapter) {
                if (!tChapName || !isChapterMatch(cleanChapter, tChapName)) {
                    return; // Chapter architecture did not match!
                }
            }

            if (!classMap.has(cls)) {
                classMap.set(cls, {
                    classLevel: cls,
                    chapterName: tChapName || cleanChapter,
                    topicName: tName,
                    subject: t.subject
                });
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

// ==========================================
// DELETION REQUEST SYSTEM (TEACHER & ADMIN)
// ==========================================

// Teacher: Request Delete Topics (with mandatory reason)
const requestDeleteTopics = async (req, res) => {
    try {
        await connectDB();
        const userId = req.session.user ? (req.session.user._id || req.session.user.id) : null;
        const userName = req.session.user ? req.session.user.name : 'Teacher';
        const { topicIds, reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, error: 'অনুগ্রহ করে মুছে ফেলার কারণ উল্লেখ করুন (Please provide a reason for deletion).' });
        }

        const ids = Array.isArray(topicIds) ? topicIds : [topicIds];
        const validIds = ids.filter(id => id && mongoose.Types.ObjectId.isValid(id));

        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid topic IDs provided' });
        }

        const trimmedReason = reason.trim();

        // Update topics with deletion request details
        const result = await Topic.updateMany(
            { _id: { $in: validIds } },
            {
                $set: {
                    'deletionRequest.isRequested': true,
                    'deletionRequest.reason': trimmedReason,
                    'deletionRequest.requestedBy': userId,
                    'deletionRequest.requestedByName': userName,
                    'deletionRequest.requestedAt': new Date(),
                    'deletionRequest.status': 'pending',
                    'deletionRequest.declinedReason': ''
                }
            }
        );

        if (result.modifiedCount > 0) {
            try {
                const pushNotificationService = require('../services/pushNotificationService');
                const notifPayload = {
                    title: 'Topic Deletion Request ⚠️',
                    body: `Teacher ${userName} requested deletion for ${result.modifiedCount} topic(s). Reason: ${trimmedReason.substring(0, 80)}`,
                    url: '/superadmin/topics?tab=deletion',
                    type: 'system'
                };
                pushNotificationService.sendToRole('superadmin', notifPayload).catch(() => { });
                pushNotificationService.sendToRole('admin', notifPayload).catch(() => { });
            } catch (e) { }
        }

        return res.json({
            success: true,
            message: `${result.modifiedCount} টি টপিক মুছে ফেলার অনুরোধ এডমিনের অনুমোদনের জন্য পাঠানো হয়েছে।`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('requestDeleteTopics Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Teacher: Cancel Pending Deletion Request
const cancelDeleteRequest = async (req, res) => {
    try {
        await connectDB();
        const userId = req.session.user ? (req.session.user._id || req.session.user.id) : null;
        const { topicId, topicIds } = req.body;
        const rawIds = topicIds || (topicId ? [topicId] : []);
        const ids = Array.isArray(rawIds) ? rawIds : [rawIds];
        const validIds = ids.filter(id => id && mongoose.Types.ObjectId.isValid(id));

        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid topic IDs provided' });
        }

        const query = {
            _id: { $in: validIds },
            'deletionRequest.isRequested': true,
            'deletionRequest.status': 'pending'
        };

        // If teacher, only allow cancelling own requests
        if (req.session.user && req.session.user.role === 'teacher') {
            query['deletionRequest.requestedBy'] = userId;
        }

        const result = await Topic.updateMany(query, {
            $set: {
                'deletionRequest.isRequested': false,
                'deletionRequest.status': 'none',
                'deletionRequest.reason': ''
            }
        });

        return res.json({
            success: true,
            message: 'মুছে ফেলার অনুরোধ বাতিল করা হয়েছে।',
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('cancelDeleteRequest Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Admin / SuperAdmin: Approve Deletion Request (Permanent delete or Archive to History Bucket)
const approveDeletionRequest = async (req, res) => {
    try {
        await connectDB();
        const { topicIds, ids, id, deleteMode } = req.body;
        const rawIds = topicIds || ids || (id ? [id] : []);
        const idList = Array.isArray(rawIds) ? rawIds : [rawIds];
        const validIds = idList.filter(i => i && mongoose.Types.ObjectId.isValid(i));

        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid topic IDs provided' });
        }

        const topics = await Topic.find({ _id: { $in: validIds } }).lean();
        if (topics.length === 0) {
            return res.status(404).json({ success: false, error: 'No matching topics found' });
        }

        const adminId = req.session.user ? (req.session.user._id || req.session.user.id) : null;
        const adminName = req.session.user ? req.session.user.name : 'Administrator';

        if (deleteMode === 'permanent') {
            await Topic.deleteMany({ _id: { $in: validIds } });
        } else {
            // Default: archive to History Bucket and clear pending request status
            await Topic.updateMany({ _id: { $in: validIds } }, {
                $set: {
                    isArchived: true,
                    'deletionRequest.isRequested': false,
                    'deletionRequest.status': 'none',
                    'deletionRequest.reviewedBy': adminId,
                    'deletionRequest.reviewedAt': new Date()
                }
            });
        }

        // Notify requesting teachers
        try {
            const pushNotificationService = require('../services/pushNotificationService');
            const teacherMap = new Map();
            topics.forEach(t => {
                const reqUser = t.deletionRequest?.requestedBy || t.submittedBy || t.createdBy;
                if (reqUser) {
                    const strId = String(reqUser);
                    if (!teacherMap.has(strId)) teacherMap.set(strId, []);
                    teacherMap.get(strId).push(t);
                }
            });

            teacherMap.forEach((tList, uid) => {
                pushNotificationService.sendToUser(uid, {
                    title: 'Deletion Request Approved ✅',
                    body: `Admin ${adminName} approved deletion for ${tList.length} topic(s).`,
                    url: '/teacher/topics',
                    type: 'system'
                }).catch(() => { });
            });
        } catch (e) { }

        return res.json({
            success: true,
            message: `${topics.length} টি টপিক মুছে ফেলার অনুরোধ সফলভাবে অনুমোদন করা হয়েছে (${deleteMode === 'permanent' ? 'Permanently Deleted' : 'Moved to History Bucket'})।`,
            count: topics.length
        });
    } catch (error) {
        console.error('approveDeletionRequest Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Admin / SuperAdmin: Decline Deletion Request (with feedback reason)
const declineDeletionRequest = async (req, res) => {
    try {
        await connectDB();
        const { topicIds, ids, id, reason } = req.body;
        const rawIds = topicIds || ids || (id ? [id] : []);
        const idList = Array.isArray(rawIds) ? rawIds : [rawIds];
        const validIds = idList.filter(i => i && mongoose.Types.ObjectId.isValid(i));

        if (validIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid topic IDs provided' });
        }

        const declineReason = (reason && String(reason).trim()) ? String(reason).trim() : 'Deletion request declined by administrator.';
        const adminId = req.session.user ? (req.session.user._id || req.session.user.id) : null;
        const adminName = req.session.user ? req.session.user.name : 'Administrator';

        const topics = await Topic.find({ _id: { $in: validIds } }).lean();

        await Topic.updateMany({ _id: { $in: validIds } }, {
            $set: {
                'deletionRequest.isRequested': false,
                'deletionRequest.status': 'declined',
                'deletionRequest.declinedReason': declineReason,
                'deletionRequest.reviewedBy': adminId,
                'deletionRequest.reviewedAt': new Date()
            }
        });

        // Notify teachers
        try {
            const pushNotificationService = require('../services/pushNotificationService');
            const teacherMap = new Map();
            topics.forEach(t => {
                const reqUser = t.deletionRequest?.requestedBy || t.submittedBy || t.createdBy;
                if (reqUser) {
                    const strId = String(reqUser);
                    if (!teacherMap.has(strId)) teacherMap.set(strId, []);
                    teacherMap.get(strId).push(t);
                }
            });

            teacherMap.forEach((tList, uid) => {
                pushNotificationService.sendToUser(uid, {
                    title: 'Deletion Request Declined ⚠️',
                    body: `Deletion request for ${tList.length} topic(s) was declined: ${declineReason}`,
                    url: '/teacher/topics',
                    type: 'system'
                }).catch(() => { });
            });
        } catch (e) { }

        return res.json({
            success: true,
            message: `${topics.length} টি টপিক মুছে ফেলার অনুরোধ প্রত্যাখ্যান করা হয়েছে।`,
            count: topics.length
        });
    } catch (error) {
        console.error('declineDeletionRequest Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
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
    editChapter,
    bulkActionTopics,
    approveTopic,
    bulkApproveTopics,
    rejectTopic,
    bulkRejectTopics,
    getTeacherTopicsPage,
    deletePendingTeacherTopic,
    bulkActionTeacherSubmissions,
    addSubjectToClasses,
    copyTopicsToClasses,
    checkCrossClassTopic,
    requestDeleteTopics,
    cancelDeleteRequest,
    approveDeletionRequest,
    declineDeletionRequest,
    seedMasterCurriculumApi,
    clearTopicsApiCache
};