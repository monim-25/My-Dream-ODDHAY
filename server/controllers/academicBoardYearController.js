const AcademicBoard = require('../models/AcademicBoard');
const AcademicYear = require('../models/AcademicYear');
const { connectDB } = require('../config');

const DEFAULT_BOARDS = [
    { name: 'Dhaka Board', code: 'DHK', order: 1 },
    { name: 'Rajshahi Board', code: 'RAJ', order: 2 },
    { name: 'Comilla Board', code: 'COM', order: 3 },
    { name: 'Jessore Board', code: 'JES', order: 4 },
    { name: 'Chittagong Board', code: 'CTG', order: 5 },
    { name: 'Barisal Board', code: 'BAR', order: 6 },
    { name: 'Sylhet Board', code: 'SYL', order: 7 },
    { name: 'Dinajpur Board', code: 'DIN', order: 8 },
    { name: 'Mymensingh Board', code: 'MYM', order: 9 },
    { name: 'Madrasah Board', code: 'MAD', order: 10 },
    { name: 'Technical Board', code: 'TEC', order: 11 },
    { name: 'All Board', code: 'ALL', order: 12 }
];

const DEFAULT_YEARS = [
    '2026', '2025', '2024', '2023', '2022', '2021',
    '2020', '2019', '2018', '2017', '2016', '2015'
];

/**
 * Ensure default boards and years are seeded if collections are empty
 */
async function ensureDefaultBoardsAndYears() {
    try {
        await connectDB();
        const boardCount = await AcademicBoard.countDocuments();
        if (boardCount === 0) {
            await AcademicBoard.insertMany(DEFAULT_BOARDS.map(b => ({
                name: b.name,
                code: b.code,
                order: b.order,
                isActive: true
            })));
        }

        const yearCount = await AcademicYear.countDocuments();
        if (yearCount === 0) {
            await AcademicYear.insertMany(DEFAULT_YEARS.map((y, idx) => ({
                year: String(y).trim(),
                order: idx + 1,
                isActive: true
            })));
        }
    } catch (err) {
        console.error('Error ensuring default boards and years:', err);
    }
}

/**
 * Get active board names as array of strings
 */
async function getActiveBoardNames() {
    await connectDB();
    await ensureDefaultBoardsAndYears();
    const boards = await AcademicBoard.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
    return boards.map(b => b.name);
}

/**
 * Get active years as array of strings (ordered)
 */
async function getActiveYearStrings() {
    await connectDB();
    await ensureDefaultBoardsAndYears();
    const years = await AcademicYear.find({ isActive: true }).sort({ order: 1, year: -1 }).lean();
    return years.map(y => y.year);
}

/**
 * API: Get active boards and years for any authenticated user / client form
 */
async function getActiveBoardsAndYearsApi(req, res) {
    try {
        await connectDB();
        await ensureDefaultBoardsAndYears();
        const [boards, years] = await Promise.all([
            AcademicBoard.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
            AcademicYear.find({ isActive: true }).sort({ order: 1, year: -1 }).lean()
        ]);
        res.json({
            success: true,
            boards: boards.map(b => b.name),
            boardDetails: boards,
            years: years.map(y => y.year),
            yearDetails: years
        });
    } catch (err) {
        console.error('API getActiveBoardsAndYears error:', err);
        res.status(500).json({ success: false, error: 'Failed to load boards and years' });
    }
}

// ==========================================
// SUPERADMIN BOARD CRUD
// ==========================================

async function addBoard(req, res) {
    try {
        await connectDB();
        const { name, code } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Board name is required' });
        }
        const trimmedName = name.trim();
        const existing = await AcademicBoard.findOne({
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
        });
        if (existing) {
            return res.status(400).json({ success: false, error: `Board "${trimmedName}" already exists.` });
        }

        const maxOrder = await AcademicBoard.findOne().sort({ order: -1 }).select('order').lean();
        const nextOrder = (maxOrder && typeof maxOrder.order === 'number') ? maxOrder.order + 1 : 1;

        const newBoard = new AcademicBoard({
            name: trimmedName,
            code: (code || '').trim().toUpperCase(),
            order: nextOrder,
            isActive: true,
            createdBy: req.session?.user?._id
        });
        await newBoard.save();

        res.json({ success: true, message: 'Board added successfully', board: newBoard });
    } catch (err) {
        console.error('Error adding board:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function updateBoard(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const { name, code, order, isActive } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Board name is required' });
        }
        const trimmedName = name.trim();

        // Check if name is taken by another board
        const existing = await AcademicBoard.findOne({
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
        });
        if (existing) {
            return res.status(400).json({ success: false, error: `Board "${trimmedName}" already exists.` });
        }

        const updateData = {
            name: trimmedName,
            code: (code || '').trim().toUpperCase(),
            updatedBy: req.session?.user?._id
        };
        if (typeof order !== 'undefined') updateData.order = parseInt(order, 10) || 0;
        if (typeof isActive !== 'undefined') updateData.isActive = Boolean(isActive);

        const updated = await AcademicBoard.findByIdAndUpdate(id, updateData, { new: true });
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Board not found' });
        }

        res.json({ success: true, message: 'Board updated successfully', board: updated });
    } catch (err) {
        console.error('Error updating board:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function toggleBoardStatus(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const board = await AcademicBoard.findById(id);
        if (!board) {
            return res.status(404).json({ success: false, error: 'Board not found' });
        }

        board.isActive = !board.isActive;
        board.updatedBy = req.session?.user?._id;
        await board.save();

        res.json({
            success: true,
            message: `Board marked as ${board.isActive ? 'Active' : 'Inactive'}`,
            isActive: board.isActive
        });
    } catch (err) {
        console.error('Error toggling board status:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function deleteBoard(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const board = await AcademicBoard.findByIdAndDelete(id);
        if (!board) {
            return res.status(404).json({ success: false, error: 'Board not found' });
        }
        res.json({ success: true, message: 'Board deleted successfully' });
    } catch (err) {
        console.error('Error deleting board:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function reorderBoards(req, res) {
    try {
        await connectDB();
        const { boardIds } = req.body;
        if (!Array.isArray(boardIds)) {
            return res.status(400).json({ success: false, error: 'Invalid boardIds array' });
        }

        const updates = boardIds.map((id, index) => 
            AcademicBoard.findByIdAndUpdate(id, { order: index + 1 })
        );
        await Promise.all(updates);

        res.json({ success: true, message: 'Board order updated' });
    } catch (err) {
        console.error('Error reordering boards:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

// ==========================================
// SUPERADMIN YEAR CRUD
// ==========================================

async function addYear(req, res) {
    try {
        await connectDB();
        const { year } = req.body;
        if (!year || !String(year).trim()) {
            return res.status(400).json({ success: false, error: 'Year is required' });
        }
        const trimmedYear = String(year).trim();

        const existing = await AcademicYear.findOne({ year: trimmedYear });
        if (existing) {
            return res.status(400).json({ success: false, error: `Year "${trimmedYear}" already exists.` });
        }

        const maxOrder = await AcademicYear.findOne().sort({ order: -1 }).select('order').lean();
        const nextOrder = (maxOrder && typeof maxOrder.order === 'number') ? maxOrder.order + 1 : 1;

        const newYear = new AcademicYear({
            year: trimmedYear,
            order: nextOrder,
            isActive: true,
            createdBy: req.session?.user?._id
        });
        await newYear.save();

        res.json({ success: true, message: 'Year added successfully', year: newYear });
    } catch (err) {
        console.error('Error adding year:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function updateYear(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const { year, order, isActive } = req.body;

        if (!year || !String(year).trim()) {
            return res.status(400).json({ success: false, error: 'Year is required' });
        }
        const trimmedYear = String(year).trim();

        const existing = await AcademicYear.findOne({
            _id: { $ne: id },
            year: trimmedYear
        });
        if (existing) {
            return res.status(400).json({ success: false, error: `Year "${trimmedYear}" already exists.` });
        }

        const updateData = {
            year: trimmedYear,
            updatedBy: req.session?.user?._id
        };
        if (typeof order !== 'undefined') updateData.order = parseInt(order, 10) || 0;
        if (typeof isActive !== 'undefined') updateData.isActive = Boolean(isActive);

        const updated = await AcademicYear.findByIdAndUpdate(id, updateData, { new: true });
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Year not found' });
        }

        res.json({ success: true, message: 'Year updated successfully', year: updated });
    } catch (err) {
        console.error('Error updating year:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function toggleYearStatus(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const yearDoc = await AcademicYear.findById(id);
        if (!yearDoc) {
            return res.status(404).json({ success: false, error: 'Year not found' });
        }

        yearDoc.isActive = !yearDoc.isActive;
        yearDoc.updatedBy = req.session?.user?._id;
        await yearDoc.save();

        res.json({
            success: true,
            message: `Year marked as ${yearDoc.isActive ? 'Active' : 'Inactive'}`,
            isActive: yearDoc.isActive
        });
    } catch (err) {
        console.error('Error toggling year status:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function deleteYear(req, res) {
    try {
        await connectDB();
        const { id } = req.params;
        const yearDoc = await AcademicYear.findByIdAndDelete(id);
        if (!yearDoc) {
            return res.status(404).json({ success: false, error: 'Year not found' });
        }
        res.json({ success: true, message: 'Year deleted successfully' });
    } catch (err) {
        console.error('Error deleting year:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

async function reorderYears(req, res) {
    try {
        await connectDB();
        const { yearIds } = req.body;
        if (!Array.isArray(yearIds)) {
            return res.status(400).json({ success: false, error: 'Invalid yearIds array' });
        }

        const updates = yearIds.map((id, index) => 
            AcademicYear.findByIdAndUpdate(id, { order: index + 1 })
        );
        await Promise.all(updates);

        res.json({ success: true, message: 'Year order updated' });
    } catch (err) {
        console.error('Error reordering years:', err);
        res.status(500).json({ success: false, error: err.message || 'Server error' });
    }
}

module.exports = {
    ensureDefaultBoardsAndYears,
    getActiveBoardNames,
    getActiveYearStrings,
    getActiveBoardsAndYearsApi,
    addBoard,
    updateBoard,
    toggleBoardStatus,
    deleteBoard,
    reorderBoards,
    addYear,
    updateYear,
    toggleYearStatus,
    deleteYear,
    reorderYears
};

module.exports = {
    ensureDefaultBoardsAndYears,
    getActiveBoardNames,
    getActiveYearStrings,
    getActiveBoardsAndYearsApi,
    addBoard,
    updateBoard,
    toggleBoardStatus,
    deleteBoard,
    reorderBoards,
    addYear,
    updateYear,
    toggleYearStatus,
    deleteYear,
    reorderYears
};
