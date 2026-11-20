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
    let matchingRules = rules.filter(r => (r.subjectName || '').trim().toLowerCase() === trimmedSubject);
    if (matchingRules.length === 0) {
        // Alias / fuzzy matching: e.g. 'bangla' or 'বাংলা' matches 'Bangla 1st Paper', 'বাংলা ১ম পত্র' etc.
        if (trimmedSubject.includes('bangla') || trimmedSubject.includes('বাংলা') || trimmedSubject.includes('bengali')) {
            matchingRules = rules.filter(r => {
                const sub = (r.subjectName || '').trim().toLowerCase();
                return sub.includes('bangla') || sub.includes('বাংলা') || sub.includes('bengali');
            });
        }
    }

    if (matchingRules.length === 0) {
        // Built-in standard segments for Bangla if no custom rule exists
        if (trimmedSubject.includes('bangla') || trimmedSubject.includes('বাংলা') || trimmedSubject.includes('bengali')) {
            return {
                hasSegments: true,
                segments: ['গদ্য', 'পদ্য', 'উপন্যাস', 'নাটক', 'সহপাঠ', 'ব্যাকরণ', 'নির্মিতি'],
                rule: null
            };
        }
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

    // Fallback: Use any matching rule for this subject that has segments defined
    const anyRuleWithSegments = matchingRules.find(r => r.hasSegments && Array.isArray(r.segments) && r.segments.length > 0);
    if (anyRuleWithSegments) {
        return {
            hasSegments: true,
            segments: anyRuleWithSegments.segments.filter(Boolean),
            rule: anyRuleWithSegments
        };
    }

    if (trimmedSubject.includes('bangla') || trimmedSubject.includes('বাংলা') || trimmedSubject.includes('bengali')) {
        return {
            hasSegments: true,
            segments: ['গদ্য', 'পদ্য', 'উপন্যাস', 'নাটক', 'সহপাঠ', 'ব্যাকরণ', 'নির্মিতি'],
            rule: null
        };
    }

    return { hasSegments: false, segments: [], rule: null };
}

module.exports = {
    getAllActiveSubjectRules,
    resolveSubjectSegments,
    clearSubjectRulesCache
};
