const SubjectRule = require('../models/SubjectRule');

let rulesCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL, invalidated immediately on writes

function clearSubjectRulesCache() {
    rulesCache = null;
    lastCacheTime = 0;
}

async function getAllActiveSubjectRules() {
    const now = Date.now();
    if (rulesCache && (now - lastCacheTime < CACHE_TTL_MS)) {
        return rulesCache;
    }
    const rules = await SubjectRule.find({ isActive: true }).sort({ order: 1, createdAt: -1 }).lean();
    rulesCache = rules;
    lastCacheTime = now;
    return rules;
}

/**
 * Resolves whether a subject has a segmentation rule for a given class
 * @param {string} subjectName 
 * @param {string|string[]} classLevel 
 * @returns {Promise<{ hasSegments: boolean, segments: string[], rule: object|null }>}
 */
async function resolveSubjectSegments(subjectName, classLevel = '') {
    if (!subjectName || typeof subjectName !== 'string') {
        return { hasSegments: false, segments: [], rule: null };
    }

    const trimmedSubject = subjectName.trim().toLowerCase();
    const rules = await getAllActiveSubjectRules();

    let targetClasses = [];
    if (Array.isArray(classLevel)) {
        targetClasses = classLevel.map(c => String(c || '').trim().toLowerCase()).filter(Boolean);
    } else if (typeof classLevel === 'string' && classLevel.trim()) {
        targetClasses = [classLevel.trim().toLowerCase()];
    }

    // Find rule matching subject
    const matchingRules = rules.filter(r => (r.subjectName || '').trim().toLowerCase() === trimmedSubject);
    if (matchingRules.length === 0) {
        return { hasSegments: false, segments: [], rule: null };
    }

    // Check class-specific rule first
    if (targetClasses.length > 0) {
        for (const r of matchingRules) {
            const ruleClasses = (r.classLevels || []).map(c => String(c || '').trim().toLowerCase()).filter(Boolean);
            if (ruleClasses.length > 0 && !ruleClasses.includes('all')) {
                const hasMatch = targetClasses.some(tc => ruleClasses.includes(tc));
                if (hasMatch && r.hasSegments && Array.isArray(r.segments) && r.segments.length > 0) {
                    return {
                        hasSegments: true,
                        segments: r.segments.filter(Boolean),
                        rule: r
                    };
                }
            }
        }
    }

    // Check fallback general/all-classes rule
    const generalRule = matchingRules.find(r => {
        const rc = (r.classLevels || []).map(c => String(c || '').trim().toLowerCase());
        return rc.length === 0 || rc.includes('all');
    });

    if (generalRule && generalRule.hasSegments && Array.isArray(generalRule.segments) && generalRule.segments.length > 0) {
        return {
            hasSegments: true,
            segments: generalRule.segments.filter(Boolean),
            rule: generalRule
        };
    }

    return { hasSegments: false, segments: [], rule: null };
}

module.exports = {
    getAllActiveSubjectRules,
    resolveSubjectSegments,
    clearSubjectRulesCache
};
