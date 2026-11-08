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

module.exports = {
    CANONICAL_CLASSES,
    VALID_GROUPS,
    normalizeClass,
    normalizeGroup,
    isClassWithGroups,
    getLinkedClasses,
    buildClassQuery,
    extractSubjectsForStudent,
    getStudentSubjects
};

