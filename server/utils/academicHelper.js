/**

* Academic System Helper for ODDHAY
 * Standardizes Class Names, Group/Stream Management, Multi-Class Sharing, and Subject Resolution.
 */

const CANONICAL_CLASSES = [
    'Class 6',
    'Class 7',
    'Class 8',
    'Class 9',
    'Class 10',
    'Class 11',
    'Class 12'
];

const VALID_GROUPS = ['Science', 'Commerce', 'Humanities', 'General'];

/**
 * Standardize Class Name representation
 * e.g., 'class 10', '10', 'Class10' -> 'Class 10'
 * 'ssc' -> 'Class 10'
 * 'hsc' -> 'Class 12'
 */
function normalizeClass(input) {
    if (!input) return 'Class 10';
    if (Array.isArray(input)) {
        return input.map(normalizeClass).filter(Boolean);
    }
    const str = String(input).trim();
    if (!str) return 'Class 10';

    const lower = str.toLowerCase();

    if (lower === 'all' || lower === 'all classes' || lower === 'all class') {
        return 'All Classes';
    }
    if (lower === 'ssc' || lower === 'class 9-10' || lower === '9-10') {
        return 'Class 10';
    }
    if (lower === 'hsc' || lower === 'class 11-12' || lower === '11-12') {
        return 'Class 12';
    }

    // Exact number or 'class <num>'
    const classNumMatch = str.match(/^class\s*(\d+)$/i);
    if (classNumMatch) {
        return `Class ${classNumMatch[1]}`;
    }
    const pureNumMatch = str.match(/^(\d+)$/);
    if (pureNumMatch) {
        return `Class ${pureNumMatch[1]}`;
    }

    // Capitalize first letter of each word if all lowercase
    if (str === lower) {
        return str.replace(/\b\w/g, c => c.toUpperCase());
    }
    return str;
}

/**
 * Standardize Group / Stream name
 * e.g., 'বিজ্ঞান', 'science' -> 'Science'
 * 'ব্যবসায় শিক্ষা', 'commerce', 'business studies' -> 'Commerce'
 * 'মানবিক', 'arts', 'humanities' -> 'Humanities'
 */
function normalizeGroup(input) {
    if (!input) return 'General';
    const str = String(input).trim().toLowerCase();

    if (str.includes('sci') || str.includes('বিজ্ঞা') || str === 'science') {
        return 'Science';
    }
    if (str.includes('comm') || str.includes('busi') || str.includes('ব্যবসা') || str.includes('বাণিজ্য') || str === 'commerce') {
        return 'Commerce';
    }
    if (str.includes('human') || str.includes('art') || str.includes('মানবি') || str === 'humanities') {
        return 'Humanities';
    }
    return 'General';
}

/**
 * Determine if a class has stream/group division (SSC & HSC)
 */
function isClassWithGroups(className) {
    const norm = normalizeClass(className);
    return ['Class 9', 'Class 10', 'Class 11', 'Class 12'].includes(norm);
}

/**
 * Return linked classes for shared curriculum (e.g. SSC: 9 & 10, HSC: 11 & 12)
 */
function getLinkedClasses(className) {
    const norm = normalizeClass(className);
    if (norm === 'Class 9' || norm === 'Class 10') {
        return ['Class 9', 'Class 10', 'SSC', 'Class 9-10'];
    }
    if (norm === 'Class 11' || norm === 'Class 12') {
        return ['Class 11', 'Class 12', 'HSC', 'Class 11-12'];
    }
    return [norm];
}

/**
 * Build a MongoDB query condition for multi-class and shared content
 * Matches scalar string, array of strings, and 'All Classes'
 */
function buildClassQuery(fieldName, classLevel, options = {}) {
    const { includeShared = true, includeAll = true } = options;

    if (!classLevel) {
        return includeAll ? { [fieldName]: { $in: ['All Classes', 'All'] } } : {};
    }

    const norm = normalizeClass(classLevel);
    const targetSet = new Set();

    if (norm) targetSet.add(norm);
    if (typeof classLevel === 'string') targetSet.add(classLevel.trim());

    if (includeShared && norm) {
        getLinkedClasses(norm).forEach(c => targetSet.add(c));
    }

    if (includeAll) {
        targetSet.add('All Classes');
        targetSet.add('All');
        targetSet.add('all');
    }

    const targets = Array.from(targetSet);
    return {
        [fieldName]: { $in: targets }
    };
}

/**
 * Extract resolved subjects for a student based on class doc and their group
 */
function extractSubjectsForStudent(classDoc, groupName) {
    if (!classDoc) return [];

    const normGroup = normalizeGroup(groupName);

    // If class has groups configured (Class 9, 10, 11, 12)
    if (classDoc.hasGroups && Array.isArray(classDoc.groups) && classDoc.groups.length > 0) {
        const common = (classDoc.commonSubjects || []).map(s => String(s || '').trim()).filter(Boolean);

        if (normGroup !== 'General') {
            const matchedGroup = classDoc.groups.find(g =>
                normalizeGroup(g.name) === normGroup
            );
            if (matchedGroup && Array.isArray(matchedGroup.subjects)) {
                const groupSubs = matchedGroup.subjects.map(s => String(s || '').trim()).filter(Boolean);
                return Array.from(new Set([...common, ...groupSubs]));
            }
        }

        // If General or no specific group matched, return common + flat subjects or all group subjects
        const allGroupSubs = classDoc.groups.flatMap(g => g.subjects || []);
        const fallbackSubs = classDoc.subjects || [];
        return Array.from(new Set([...common, ...fallbackSubs, ...allGroupSubs].map(s => String(s || '').trim()).filter(Boolean)));
    }

    // Default class without groups (Class 6, 7, 8)
    if (Array.isArray(classDoc.subjects) && classDoc.subjects.length > 0) {
        return classDoc.subjects.map(s => String(s || '').trim()).filter(Boolean);
    }

    return [];
}

/**
 * High-level async resolver: get student subjects directly from user object
 */
async function getStudentSubjects(user) {
    if (!user) return [];

    // 1. If user has customized subjects array stored in user.subjects, return them directly
    if (Array.isArray(user.subjects) && user.subjects.length > 0) {
        const cleanSubs = user.subjects.map(s => String(s || '').trim()).filter(Boolean);
        if (cleanSubs.length > 0) {
            return Array.from(new Set(cleanSubs));
        }
    }

    const AcademicClass = require('../models/AcademicClass');
    const userClass = normalizeClass(user.classLevel || 'Class 10');
    const userGroup = normalizeGroup(user.group || 'General');

    let classDoc = await AcademicClass.findOne({ name: userClass }).lean();
    if (!classDoc) {
        // Fallback case-insensitive regex
        classDoc = await AcademicClass.findOne({
            name: { $regex: new RegExp(`^${userClass}$`, 'i') }
        }).lean();
    }

    if (!classDoc) {
        // Second fallback: any class matching the digit
        const num = userClass.replace(/[^0-9]/g, '');
        if (num) {
            classDoc = await AcademicClass.findOne({
                name: { $regex: new RegExp(`Class\\s*${num}`, 'i') }
            }).lean();
        }
    }

    if (classDoc) {
        return extractSubjectsForStudent(classDoc, userGroup);
    }

    // Safe default standard list if DB is not seeded yet
    return ['Bangla', 'English', 'Mathematics', 'ICT'];
}

/**
 * String similarity using Levenshtein distance
 */
function stringSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;

    const costs = [];
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[shorter.length] = lastValue;
    }
    const distance = costs[shorter.length];
    return (longer.length - distance) / longer.length;
}

/**
 * Detect subject renames or spelling fixes between old and new subject lists
 */
function detectSubjectRenames(oldList = [], newList = []) {
    const renames = [];
    const oldNorm = (oldList || []).map(s => String(s || '').trim()).filter(Boolean);
    const newNorm = (newList || []).map(s => String(s || '').trim()).filter(Boolean);

    const newSet = new Set(newNorm);
    const oldSet = new Set(oldNorm);

    const removed = oldNorm.filter(s => !newSet.has(s));
    const added = newNorm.filter(s => !oldSet.has(s));

    if (removed.length === 0 || added.length === 0) {
        return renames;
    }

    // 1. Position-based check when lengths are identical
    if (oldNorm.length === newNorm.length) {
        for (let i = 0; i < oldNorm.length; i++) {
            const oldItem = oldNorm[i];
            const newItem = newNorm[i];
            if (oldItem !== newItem && !newSet.has(oldItem) && !oldSet.has(newItem)) {
                renames.push({ oldSubject: oldItem, newSubject: newItem });
            }
        }
        if (renames.length > 0) {
            return renames;
        }
    }

    // 2. Exact 1-to-1 change (1 removed, 1 added)
    if (removed.length === 1 && added.length === 1) {
        renames.push({ oldSubject: removed[0], newSubject: added[0] });
        return renames;
    }

    // 3. Similarity-based matching for remaining removed/added
    const availableAdded = [...added];
    for (const rem of removed) {
        if (availableAdded.length === 0) break;

        let bestMatch = null;
        let highestScore = 0;

        for (const add of availableAdded) {
            const score = stringSimilarity(rem.toLowerCase(), add.toLowerCase());
            if (score > highestScore) {
                highestScore = score;
                bestMatch = add;
            }
        }

        if (bestMatch && highestScore >= 0.4) {
            renames.push({ oldSubject: rem, newSubject: bestMatch });
            const idx = availableAdded.indexOf(bestMatch);
            if (idx > -1) availableAdded.splice(idx, 1);
        }
    }

    return renames;
}

/**
 * Cascade subject rename across Users (teachers, students) and academic collections
 */
async function cascadeSubjectRename(oldSubject, newSubject, className = null) {
    if (!oldSubject || !newSubject || oldSubject.trim().toLowerCase() === newSubject.trim().toLowerCase()) return;

    const cleanOld = oldSubject.trim();
    const cleanNew = newSubject.trim();
    const User = require('../models/User');
    const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactOldRegex = new RegExp(`^\\s*${escapedOld}\\s*$`, 'i');

    try {
        console.log(`[Subject Rename] Cascading subject rename: "${cleanOld}" -> "${cleanNew}" (class: ${className || 'ALL'})...`);

        // Check if other active classes also share this oldSubject
        let isSharedSubject = false;
        if (className) {
            try {
                const AcademicClass = require('../models/AcademicClass');
                const otherClasses = await AcademicClass.find({
                    name: { $ne: className },
                    isArchived: { $ne: true },
                    $or: [
                        { subjects: exactOldRegex },
                        { commonSubjects: exactOldRegex },
                        { 'groups.subjects': exactOldRegex }
                    ]
                }).lean();
                if (otherClasses.length > 0) isSharedSubject = true;
            } catch (_) { }
        }

        // 1. Update User records (Teachers and Students)
        const userQuery = {
            $or: [
                { teachingSubjects: { $in: [cleanOld, exactOldRegex] } },
                { teachingSubject: { $regex: new RegExp(escapedOld, 'i') } },
                { subject: { $regex: new RegExp(escapedOld, 'i') } },
                { subjects: { $in: [cleanOld, exactOldRegex] } }
            ]
        };

        const users = await User.find(userQuery);

        for (const u of users) {
            let modified = false;

            // If subject is shared by other classes and teacher teaches multiple classes,
            // check if teacher is assigned to this specific class
            if (isSharedSubject && className) {
                const teacherClasses = [
                    ...(Array.isArray(u.assignedClasses) ? u.assignedClasses : []),
                    ...(Array.isArray(u.classes) ? u.classes : []),
                    ...(u.classLevel ? u.classLevel.split(/[,;/]+/).map(s => s.trim()) : [])
                ].map(c => c.toLowerCase());

                if (!teacherClasses.includes(className.toLowerCase())) {
                    continue; // Skip teachers not assigned to this class
                }
            }

            // teachingSubjects array
            if (Array.isArray(u.teachingSubjects) && u.teachingSubjects.length > 0) {
                const updatedList = u.teachingSubjects.map(s => {
                    if (String(s || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
                        modified = true;
                        return cleanNew;
                    }
                    return s;
                });
                if (modified) {
                    u.teachingSubjects = Array.from(new Set(updatedList));
                    u.teachingSubject = u.teachingSubjects.join(', ');
                }
            } else if (u.teachingSubject) {
                const parts = u.teachingSubject.split(/[,;/]+/).map(p => p.trim());
                let strChanged = false;
                const newParts = parts.map(p => {
                    if (p.toLowerCase() === cleanOld.toLowerCase()) {
                        strChanged = true;
                        return cleanNew;
                    }
                    return p;
                });
                if (strChanged) {
                    u.teachingSubject = Array.from(new Set(newParts)).join(', ');
                    modified = true;
                }
            }

            // Fallback subject string
            if (u.subject) {
                if (u.subject.trim().toLowerCase() === cleanOld.toLowerCase()) {
                    u.subject = cleanNew;
                    modified = true;
                } else if (u.subject.toLowerCase().includes(cleanOld.toLowerCase())) {
                    u.subject = u.subject.replace(new RegExp(escapedOld, 'gi'), cleanNew);
                    modified = true;
                }
            }

            // Student subjects array
            if (Array.isArray(u.subjects) && u.subjects.length > 0) {
                let subsChanged = false;
                u.subjects = u.subjects.map(s => {
                    if (String(s || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
                        subsChanged = true;
                        return cleanNew;
                    }
                    return s;
                });
                if (subsChanged) {
                    u.subjects = Array.from(new Set(u.subjects));
                    modified = true;
                }
            }

            if (modified) {
                await u.save().catch(err => console.error(`Error updating teacher/user ${u._id} subject:`, err.message));
            }
        }

        // 2. Cascade across academic collections
        const updateTasks = [];
        const classFilter = (isSharedSubject && className) ? { classLevel: new RegExp(`^\\s*${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') } : {};

        try {
            const Question = require('../models/Question');
            updateTasks.push(Question.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const QuestionBank = require('../models/QuestionBank');
            updateTasks.push(QuestionBank.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Quiz = require('../models/Quiz');
            updateTasks.push(Quiz.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Topic = require('../models/Topic');
            updateTasks.push(Topic.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const SubjectRule = require('../models/SubjectRule');
            updateTasks.push(SubjectRule.updateMany({ subjectName: exactOldRegex }, { $set: { subjectName: cleanNew } }));
        } catch (_) { }

        try {
            const Note = require('../models/Note');
            updateTasks.push(Note.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Book = require('../models/Book');
            updateTasks.push(Book.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Folder = require('../models/Folder');
            updateTasks.push(Folder.updateMany({ ...classFilter, subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Course = require('../models/Course');
            updateTasks.push(Course.updateMany(
                { subject: exactOldRegex },
                { $set: { 'subject.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        try {
            const AIKnowledge = require('../models/AIKnowledge');
            updateTasks.push(AIKnowledge.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        if (updateTasks.length > 0) {
            await Promise.allSettled(updateTasks);
        }

        // Invalidate caches
        try {
            const { clearSubjectRulesCache } = require('./subjectRuleHelper');
            clearSubjectRulesCache();
        } catch (_) { }
        try {
            const { clearTopicsApiCache } = require('../controllers/topicController');
            if (clearTopicsApiCache) clearTopicsApiCache();
        } catch (_) { }

        console.log(`✅ Cascaded subject rename: "${cleanOld}" -> "${cleanNew}" across users and academic records.`);
    } catch (err) {
        console.error(`❌ Error cascading subject rename "${cleanOld}" -> "${cleanNew}":`, err);
    }
}

/**
 * Cascade class rename across Users (teachers, students) and all academic collections
 */
async function cascadeClassRename(oldClassName, newClassName) {
    if (!oldClassName || !newClassName || oldClassName.trim().toLowerCase() === newClassName.trim().toLowerCase()) return;

    const cleanOld = oldClassName.trim();
    const cleanNew = newClassName.trim();
    const User = require('../models/User');
    const escapedOld = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactOldRegex = new RegExp(`^\\s*${escapedOld}\\s*$`, 'i');

    try {
        console.log(`[Class Rename] Cascading class rename: "${cleanOld}" -> "${cleanNew}" across all collections...`);

        // 1. Update User records (Teachers and Students)
        const users = await User.find({
            $or: [
                { classLevel: exactOldRegex },
                { classLevel: { $regex: new RegExp(`(^|[,;/\\s]+)${escapedOld}([,;/\\s]+|$)`, 'i') } },
                { assignedClasses: exactOldRegex },
                { classes: exactOldRegex },
                { 'teacher.assignedClasses': exactOldRegex },
                { 'teacher.classLevel': exactOldRegex },
                { 'student.classLevel': exactOldRegex }
            ]
        });

        for (const u of users) {
            let modified = false;

            // assignedClasses array (Teachers)
            if (Array.isArray(u.assignedClasses) && u.assignedClasses.length > 0) {
                let changed = false;
                const updatedAssigned = u.assignedClasses.map(c => {
                    if (String(c || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
                        changed = true;
                        return cleanNew;
                    }
                    return c;
                });
                if (changed) {
                    u.assignedClasses = Array.from(new Set(updatedAssigned));
                    modified = true;
                }
            }

            // classes array (Teachers)
            if (Array.isArray(u.classes) && u.classes.length > 0) {
                let changed = false;
                const updatedClasses = u.classes.map(c => {
                    if (String(c || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
                        changed = true;
                        return cleanNew;
                    }
                    return c;
                });
                if (changed) {
                    u.classes = Array.from(new Set(updatedClasses));
                    modified = true;
                }
            }

            // classLevel string (Students or Teachers with comma-separated classes)
            if (u.classLevel) {
                if (u.classLevel.trim().toLowerCase() === cleanOld.toLowerCase()) {
                    u.classLevel = cleanNew;
                    modified = true;
                } else if (u.classLevel.includes(',') || u.classLevel.includes(';') || u.classLevel.includes('/')) {
                    const parts = u.classLevel.split(/[,;/]+/).map(p => p.trim());
                    let partChanged = false;
                    const newParts = parts.map(p => {
                        if (p.toLowerCase() === cleanOld.toLowerCase()) {
                            partChanged = true;
                            return cleanNew;
                        }
                        return p;
                    });
                    if (partChanged) {
                        u.classLevel = Array.from(new Set(newParts)).join(', ');
                        modified = true;
                    }
                }
            }

            // Nested teacher object if exists
            if (u.teacher) {
                if (Array.isArray(u.teacher.assignedClasses)) {
                    let changed = false;
                    u.teacher.assignedClasses = u.teacher.assignedClasses.map(c => {
                        if (String(c || '').trim().toLowerCase() === cleanOld.toLowerCase()) {
                            changed = true;
                            return cleanNew;
                        }
                        return c;
                    });
                    if (changed) {
                        u.teacher.assignedClasses = Array.from(new Set(u.teacher.assignedClasses));
                        modified = true;
                    }
                }
                if (u.teacher.classLevel && u.teacher.classLevel.trim().toLowerCase() === cleanOld.toLowerCase()) {
                    u.teacher.classLevel = cleanNew;
                    modified = true;
                }
            }

            // Nested student object if exists
            if (u.student && u.student.classLevel && u.student.classLevel.trim().toLowerCase() === cleanOld.toLowerCase()) {
                u.student.classLevel = cleanNew;
                modified = true;
            }

            if (modified) {
                await u.save().catch(err => console.error(`Error updating user ${u._id} class rename:`, err.message));
            }
        }

        // 2. Cascade across academic collections
        const updateTasks = [];

        // Topic: classLevel string
        try {
            const Topic = require('../models/Topic');
            updateTasks.push(Topic.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        // Question: classLevel can be string or array
        try {
            const Question = require('../models/Question');
            updateTasks.push(Question.updateMany(
                { classLevel: { $type: 'string', $regex: exactOldRegex } },
                { $set: { classLevel: cleanNew } }
            ));
            updateTasks.push(Question.updateMany(
                { classLevel: { $type: 'array', $elemMatch: exactOldRegex } },
                { $set: { 'classLevel.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // QuestionBank: classLevel array of strings
        try {
            const QuestionBank = require('../models/QuestionBank');
            updateTasks.push(QuestionBank.updateMany(
                { classLevel: exactOldRegex },
                { $set: { 'classLevel.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // Quiz: classLevel string, classes array
        try {
            const Quiz = require('../models/Quiz');
            updateTasks.push(Quiz.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
            updateTasks.push(Quiz.updateMany(
                { classes: exactOldRegex },
                { $set: { 'classes.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // SubjectRule: classLevels array of strings
        try {
            const SubjectRule = require('../models/SubjectRule');
            updateTasks.push(SubjectRule.updateMany(
                { classLevels: exactOldRegex },
                { $set: { 'classLevels.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // Course: classLevel array of strings, featuredForClasses array of strings
        try {
            const Course = require('../models/Course');
            updateTasks.push(Course.updateMany(
                { classLevel: exactOldRegex },
                { $set: { 'classLevel.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
            updateTasks.push(Course.updateMany(
                { featuredForClasses: exactOldRegex },
                { $set: { 'featuredForClasses.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // Note: classLevel can be array or string
        try {
            const Note = require('../models/Note');
            updateTasks.push(Note.updateMany(
                { classLevel: { $type: 'string', $regex: exactOldRegex } },
                { $set: { classLevel: cleanNew } }
            ));
            updateTasks.push(Note.updateMany(
                { classLevel: { $type: 'array', $elemMatch: exactOldRegex } },
                { $set: { 'classLevel.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // Book: classLevel string
        try {
            const Book = require('../models/Book');
            updateTasks.push(Book.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        // Folder: classLevel string
        try {
            const Folder = require('../models/Folder');
            updateTasks.push(Folder.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        // AIKnowledge: classLevel string
        try {
            const AIKnowledge = require('../models/AIKnowledge');
            updateTasks.push(AIKnowledge.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        // AiConversation: classLevel string
        try {
            const AiConversation = require('../models/AiConversation');
            updateTasks.push(AiConversation.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        // VideoAsset: targetClass array of strings
        try {
            const VideoAsset = require('../models/VideoAsset');
            updateTasks.push(VideoAsset.updateMany(
                { targetClass: exactOldRegex },
                { $set: { 'targetClass.$[elem]': cleanNew } },
                { arrayFilters: [{ 'elem': exactOldRegex }] }
            ));
        } catch (_) { }

        // Coupon: applicableClass string
        try {
            const Coupon = require('../models/Coupon');
            updateTasks.push(Coupon.updateMany(
                { applicableClass: exactOldRegex },
                { $set: { applicableClass: cleanNew } }
            ));
        } catch (_) { }

        // NotificationLog: classLevel string
        try {
            const NotificationLog = require('../models/NotificationLog');
            updateTasks.push(NotificationLog.updateMany(
                { classLevel: exactOldRegex },
                { $set: { classLevel: cleanNew } }
            ));
        } catch (_) { }

        if (updateTasks.length > 0) {
            await Promise.allSettled(updateTasks);
        }

        // 3. Invalidate caches
        try {
            const { clearSubjectRulesCache } = require('./subjectRuleHelper');
            clearSubjectRulesCache();
        } catch (_) { }
        try {
            const { clearTopicsApiCache } = require('../controllers/topicController');
            if (clearTopicsApiCache) clearTopicsApiCache();
        } catch (_) { }

        console.log(`✅ Cascaded class rename: "${cleanOld}" -> "${cleanNew}" across users and all collections successfully.`);
    } catch (err) {
        console.error(`❌ Error cascading class rename "${cleanOld}" -> "${cleanNew}":`, err);
    }
}

/**
 * Return all distinct active classes and subjects for filter dropdowns across the platform
 */
async function getAllAcademicFilters() {
    const AcademicClass = require('../models/AcademicClass');
    const QuestionBank = require('../models/QuestionBank');
    const Question = require('../models/Question');

    const defaultClasses = [
        'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'
    ];
    const defaultSubjects = [
        'Bangla', 'English', 'Mathematics', 'Higher Mathematics', 'Physics',
        'Chemistry', 'Biology', 'ICT', 'Accounting', 'Finance & Banking',
        'Business Organization', 'Economics', 'General Science', 'Bangladesh & Global Studies'
    ];

    const [classDocs, qbSubjects, qbClasses, qSubjects, qClasses] = await Promise.all([
        AcademicClass.find({ isArchived: { $ne: true } }).sort({ order: 1, name: 1 }).lean().catch(() => []),
        QuestionBank.distinct('subject').catch(() => []),
        QuestionBank.distinct('classLevel').catch(() => []),
        Question.distinct('subject').catch(() => []),
        Question.distinct('classLevel').catch(() => [])
    ]);

    const classSet = new Set();
    if (!classDocs || classDocs.length === 0) {
        defaultClasses.forEach(c => classSet.add(c));
    }
    const addClass = (raw) => {
        if (!raw) return;
        const str = String(raw).trim();
        if (str.includes(',')) {
            str.split(',').forEach(part => addClass(part));
            return;
        }
        if (/^(6|7|8|9|10|11|12)$/.test(str)) {
            classSet.add(`Class ${str}`);
            return;
        }
        const norm = normalizeClass(str);
        if (norm && norm !== 'All Classes') {
            classSet.add(norm);
        } else if (str) {
            classSet.add(str);
        }
    };

    (classDocs || []).forEach(cd => {
        if (cd && cd.name) addClass(cd.name);
    });
    [...(qbClasses || []), ...(qClasses || [])].forEach(cl => {
        if (Array.isArray(cl)) {
            cl.forEach(c => addClass(c));
        } else if (cl) {
            addClass(cl);
        }
    });

    const subjectSet = new Set(defaultSubjects);
    const addSubject = (raw) => {
        if (!raw) return;
        const str = String(raw).trim();
        if (str.includes(',')) {
            str.split(',').forEach(part => addSubject(part));
            return;
        }
        if (str.length > 1) {
            subjectSet.add(str);
        }
    };

    (classDocs || []).forEach(cd => {
        if (!cd) return;
        (cd.subjects || []).forEach(s => addSubject(s));
        (cd.commonSubjects || []).forEach(s => addSubject(s));
        (cd.groups || []).forEach(g => {
            (g.subjects || []).forEach(s => addSubject(s));
        });
    });
    [...(qbSubjects || []), ...(qSubjects || [])].forEach(s => {
        if (Array.isArray(s)) {
            s.forEach(sub => addSubject(sub));
        } else if (s) {
            addSubject(s);
        }
    });

    const sortedClasses = Array.from(classSet).filter(Boolean).sort((a, b) => {
        const numA = parseInt(String(a).replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(String(b).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return a.localeCompare(b);
    });

    const sortedSubjects = Array.from(subjectSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

    return {
        classes: sortedClasses,
        subjects: sortedSubjects
    };
}

module.exports = {
    CANONICAL_CLASSES,
    VALID_GROUPS,
    normalizeClass,
    normalizeGroup,
    isClassWithGroups,
    getLinkedClasses,
    buildClassQuery,
    extractSubjectsForStudent,
    getStudentSubjects,
    stringSimilarity,
    detectSubjectRenames,
    cascadeSubjectRename,
    cascadeClassRename,
    getAllAcademicFilters
};

