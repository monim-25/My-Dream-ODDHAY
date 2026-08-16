const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    subject: { type: String, required: true },
    classLevel: { type: String, default: 'General' },
    parentId: { type: String, default: null }, // _id of parent folder or null for top-level inside subject
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Folder', folderSchema);
