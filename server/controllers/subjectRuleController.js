const mongoose = require('mongoose');
const SubjectRule = require('../models/SubjectRule');
const { clearSubjectRulesCache, resolveSubjectSegments, getAllActiveSubjectRules } = require('../utils/subjectRuleHelper');

// Save or Update Subject Segmentation Rule
const saveSubjectRule = async (req, res) => {
    try {
        const { id, subjectName, classLevels, hasSegments, segments, isMandatory, description, order, isActive } = req.body;

        if (!subjectName || !subjectName.trim()) {
            return res.status(400).json({ success: false, error: 'Subject name is required' });
        }

        const trimmedSubject = subjectName.trim();

        // Parse segments list (array or comma-separated string)
        let segmentsList = [];
        if (Array.isArray(segments)) {
            segmentsList = segments.map(s => String(s || '').trim()).filter(Boolean);
        } else if (typeof segments === 'string' && segments.trim()) {
            segmentsList = segments.split(',').map(s => s.trim()).filter(Boolean);
        }

        // Parse classLevels list
        let classList = [];
        if (Array.isArray(classLevels)) {
            classList = classLevels.map(c => String(c || '').trim()).filter(Boolean);
        } else if (typeof classLevels === 'string' && classLevels.trim()) {
            classList = classLevels.split(',').map(c => c.trim()).filter(Boolean);
        }

        const userId = req.session && req.session.user ? (req.session.user._id || req.session.user.id) : null;

        let rule;
        if (id && mongoose.Types.ObjectId.isValid(id)) {
            rule = await SubjectRule.findById(id);
            if (!rule) {
                return res.status(404).json({ success: false, error: 'Subject rule not found' });
            }
            rule.subjectName = trimmedSubject;
            rule.classLevels = classList;
            rule.hasSegments = hasSegments !== undefined ? Boolean(hasSegments) : true;
            rule.segments = segmentsList;
            rule.isMandatory = isMandatory !== undefined ? Boolean(isMandatory) : true;
            rule.description = description !== undefined ? String(description).trim() : rule.description;
            if (order !== undefined) rule.order = parseInt(order, 10) || 0;
            if (isActive !== undefined) rule.isActive = Boolean(isActive);
            if (userId) rule.updatedBy = userId;
            await rule.save();
        } else {
            // Check if rule already exists for exact subject and class combination
            rule = new SubjectRule({
                subjectName: trimmedSubject,
                classLevels: classList,
                hasSegments: hasSegments !== undefined ? Boolean(hasSegments) : true,
                segments: segmentsList,
                isMandatory: isMandatory !== undefined ? Boolean(isMandatory) : true,
                description: description ? String(description).trim() : '',
                order: parseInt(order, 10) || 0,
                isActive: isActive !== undefined ? Boolean(isActive) : true,
                createdBy: userId,
                updatedBy: userId
            });
            await rule.save();
        }

        clearSubjectRulesCache();

        res.json({
            success: true,
            message: `Segmentation rule for "${trimmedSubject}" saved successfully.`,
            rule
        });
    } catch (error) {
        console.error('saveSubjectRule Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Delete Subject Rule
const deleteSubjectRule = async (req, res) => {
    try {
        const targetId = req.body.id || req.params.id;
        if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ success: false, error: 'Valid rule ID is required' });
        }

        const deleted = await SubjectRule.findByIdAndDelete(targetId);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Subject rule not found' });
        }

        clearSubjectRulesCache();

        res.json({
            success: true,
            message: `Segmentation rule for "${deleted.subjectName}" removed successfully.`
        });
    } catch (error) {
        console.error('deleteSubjectRule Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

// Get all rules list
const getSubjectRules = async (req, res) => {
    try {
        const rules = await SubjectRule.find().sort({ order: 1, createdAt: -1 }).populate('createdBy', 'name email').lean();
        res.json({ success: true, rules });
    } catch (error) {
        console.error('getSubjectRules Error:', error);
        res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    }
};

module.exports = {
    saveSubjectRule,
    deleteSubjectRule,
    getSubjectRules
};
