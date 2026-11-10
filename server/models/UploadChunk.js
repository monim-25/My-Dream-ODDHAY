const mongoose = require('mongoose');

const uploadChunkSchema = new mongoose.Schema({
    uploadId: { type: String, required: true, index: true },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, required: true },
    data: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now, expires: 7200 } // Auto-expire after 2 hours (TTL)
});

uploadChunkSchema.index({ uploadId: 1, chunkIndex: 1 }, { unique: true });

module.exports = mongoose.model('UploadChunk', uploadChunkSchema);
