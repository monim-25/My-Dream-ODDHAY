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

    // Match numbers 6 through 12
    const numMatch = str.match(/\b(6|7|8|9|10|11|12)\b/);
    if (numMatch) {
        return `Class ${numMatch[1]}`;
    }

    const simpleDigits = str.replace(/[^0-9]/g, '');
    if (simpleDigits && parseInt(simpleDigits, 10) >= 6 && parseInt(simpleDigits, 10) <= 12) {
        return `Class ${simpleDigits}`;
    }

    // Capitalize first letter of each word
    return str.replace(/\b\w/g, c => c.toUpperCase());
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
    const exactOldRegex = new RegExp(`^${escapedOld}$`, 'i');

    try {
        // 1. Update User records (Teachers and Students)
        const users = await User.find({
            $or: [
                { teachingSubjects: { $in: [cleanOld, exactOldRegex] } },
                { teachingSubject: { $regex: new RegExp(escapedOld, 'i') } },
                { subject: { $regex: new RegExp(escapedOld, 'i') } },
                { subjects: { $in: [cleanOld, exactOldRegex] } }
            ]
        });

        for (const u of users) {
            let modified = false;

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

        // 2. Cascade across other academic collections
        const updateTasks = [];

        try {
            const Question = require('../models/Question');
            updateTasks.push(Question.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const QuestionBank = require('../models/QuestionBank');
            updateTasks.push(QuestionBank.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Quiz = require('../models/Quiz');
            updateTasks.push(Quiz.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Topic = require('../models/Topic');
            updateTasks.push(Topic.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Note = require('../models/Note');
            updateTasks.push(Note.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Book = require('../models/Book');
            updateTasks.push(Book.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
        } catch (_) { }

        try {
            const Folder = require('../models/Folder');
            updateTasks.push(Folder.updateMany({ subject: exactOldRegex }, { $set: { subject: cleanNew } }));
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

        console.log(`✅ Cascaded subject rename: "${cleanOld}" -> "${cleanNew}" across users and academic records.`);
    } catch (err) {
        console.error(`❌ Error cascading subject rename "${cleanOld}" -> "${cleanNew}":`, err);
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

    const classSet = new Set(defaultClasses);
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
    getAllAcademicFilters
};

