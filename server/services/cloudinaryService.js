const cloudinary = require('cloudinary').v2;
const fs = require('fs');

const isConfigured = Boolean(
    process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

if (isConfigured) {
    if (process.env.CLOUDINARY_URL) {
        cloudinary.config();
    } else {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true
        });
    }
    console.log('✅ Cloudinary configured successfully');
} else {
    console.log('ℹ️ Cloudinary credentials not detected; falling back to local file storage.');
}

/**
 * Upload a local file (from multer /tmp/ or local path) to Cloudinary
 * @param {string} filePath - Absolute or relative path to file on disk
 * @param {string} folder - Target folder in Cloudinary (e.g. 'thumbnails', 'avatars', 'notes', 'videos')
 * @param {object} options - Optional cloudinary upload options
 * @returns {Promise<{url: string, public_id: string}|null>}
 */
async function uploadToCloudinary(filePath, folder = 'oddhay', options = {}) {
    if (!isConfigured || !filePath || !fs.existsSync(filePath)) {
        return null;
    }

    try {
        const uploadOptions = {
            folder: `oddhay/${folder}`,
            resource_type: 'auto', // handles image, video, raw pdf
            ...options
        };

        const result = await cloudinary.uploader.upload(filePath, uploadOptions);

        // Optionally clean up local temp file after successful upload to save disk
        try {
            if (filePath.includes('/tmp/') || filePath.includes('\\tmp\\') || filePath.includes('tmp')) {
                fs.unlinkSync(filePath);
            }
        } catch (e) { /* ignore cleanup error */ }

        return {
            url: result.secure_url || result.url,
            public_id: result.public_id,
            resource_type: result.resource_type
        };
    } catch (err) {
        console.error(`❌ Cloudinary upload error for ${filePath}:`, err.message);
        return null;
    }
}

/**
 * Delete an asset from Cloudinary
 * @param {string} publicId
 * @param {string} resourceType - 'image', 'video', 'raw'
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
    if (!isConfigured || !publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (err) {
        console.error(`Cloudinary delete error for ${publicId}:`, err.message);
    }
}

/**
 * Universal helper for Multer req.file
 * Uploads file to Cloudinary if configured, otherwise falls back to local relative path
 * @param {object} file - multer req.file object
 * @param {string} folder - target subfolder (e.g. 'avatars', 'thumbnails', 'notes', 'videos')
 * @returns {Promise<string>} - Returns full Cloudinary URL or local relative path
 */
async function processUploadedFile(file, folder = 'uploads') {
    if (!file) return '';
    const filePath = file.path;
    if (isConfigured && filePath) {
        const uploadResult = await uploadToCloudinary(filePath, folder);
        if (uploadResult && uploadResult.url) {
            return uploadResult.url;
        }
    }
    return `/uploads/${folder}/${file.filename || (require('path').basename(filePath))}`;
}

async function processUploadedFiles(filesArray, folder = 'uploads') {
    if (!Array.isArray(filesArray) || filesArray.length === 0) return [];
    const results = [];
    for (const f of filesArray) {
        const url = await processUploadedFile(f, folder);
        if (url) results.push(url);
    }
    return results;
}

module.exports = {
    cloudinary,
    isConfigured: () => isConfigured,
    uploadToCloudinary,
    deleteFromCloudinary,
    processUploadedFile,
    processUploadedFiles
};
