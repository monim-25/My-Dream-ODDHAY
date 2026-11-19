/**
 * Official NCTB Master Curriculum Seeder
 * Wipes legacy/sample topics and seeds the complete NCTB curriculum for SSC & HSC
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const Folder = require('../models/Folder');
const curriculum = require('./nctbMasterCurriculum');

const curriculumConfigs = [
    // SSC (Class 9 & Class 10)
    {
        dataset: curriculum.sscPhysics,
        classes: ['Class 9', 'Class 10'],
        subject: 'Physics',
        codePrefix: 'SSC-PHY',
        group: 'Science',
        segment: ''
    },
    {
        dataset: curriculum.sscChemistry,
        classes: ['Class 9', 'Class 10'],
        subject: 'Chemistry',
        codePrefix: 'SSC-CHE',
        group: 'Science',
        segment: ''
    },
    {
        dataset: curriculum.sscGeneralMath,
        classes: ['Class 9', 'Class 10'],
        subject: 'Mathematics',
        codePrefix: 'SSC-GMATH',
        group: 'None',
        segment: ''
    },
    {
        dataset: curriculum.sscHigherMath,
        classes: ['Class 9', 'Class 10'],
        subject: 'Higher Mathematics',
        codePrefix: 'SSC-HMATH',
        group: 'Science',
        segment: ''
    },
    {
        dataset: curriculum.sscBiology,
        classes: ['Class 9', 'Class 10'],
        subject: 'Biology',
        codePrefix: 'SSC-BIO',
        group: 'Science',
        segment: ''
    },
    {
        dataset: curriculum.sscICT,
        classes: ['Class 9', 'Class 10'],
        subject: 'Information and Communication Technology',
        codePrefix: 'SSC-ICT',
        group: 'None',
        segment: ''
    },

    // HSC (Class 11 & Class 12)
    {
        dataset: curriculum.hscPhysics1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Physics',
        codePrefix: 'HSC-PHY1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: curriculum.hscPhysics2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Physics',
        codePrefix: 'HSC-PHY2',
        group: 'Science',
        segment: '২য় পত্র'
    },
    {
        dataset: curriculum.hscChemistry1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Chemistry',
        codePrefix: 'HSC-CHE1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: curriculum.hscChemistry2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Chemistry',
        codePrefix: 'HSC-CHE2',
        group: 'Science',
        segment: '২য় পত্র'
    },
    {
        dataset: curriculum.hscHigherMath1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Higher Mathematics',
        codePrefix: 'HSC-HMATH1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: curriculum.hscHigherMath2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Higher Mathematics',
        codePrefix: 'HSC-HMATH2',
        group: 'Science',
        segment: '২য় পত্র'
    },
    {
        dataset: curriculum.hscBiology1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Biology 1st Paper',
        codePrefix: 'HSC-BIO1',
        group: 'Science',
        segment: '১ম পত্র (উদ্ভিদবিজ্ঞান)'
    },
    {
        dataset: curriculum.hscBiology2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Biology 2nd Paper',
        codePrefix: 'HSC-BIO2',
        group: 'Science',
        segment: '২য় পত্র (প্রাণীবিজ্ঞান)'
    },
    {
        dataset: curriculum.hscICT,
        classes: ['Class 11', 'Class 12'],
        subject: 'ICT',
        codePrefix: 'HSC-ICT',
        group: 'None',
        segment: 'আবশ্যিক'
    }
];

const buildCurriculumTopics = () => {
    const docs = [];

    for (const config of curriculumConfigs) {
        if (!config.dataset || !Array.isArray(config.dataset)) continue;

        for (const cls of config.classes) {
            let chOrder = 0;
            for (const ch of config.dataset) {
                chOrder++;
                const chapterNumber = ch.chapterNumber || chOrder;
                const chapterName = ch.chapterName || `অধ্যায় ${chapterNumber}`;

                if (Array.isArray(ch.topics) && ch.topics.length > 0) {
                    let topOrder = 0;
                    for (const top of ch.topics) {
                        topOrder++;
                        docs.push({
                            name: top.name,
                            code: `${config.codePrefix}-C${chapterNumber}-T${topOrder}`,
                            classLevel: cls,
                            subject: config.subject,
                            segment: config.segment || '',
                            group: config.group || 'None',
                            chapter: {
                                number: chapterNumber,
                                name: chapterName
                            },
                            subTopics: Array.isArray(top.subTopics) ? top.subTopics : [],
                            difficulty: 'Medium',
                            status: 'approved',
                            isArchived: false,
                            order: topOrder
                        });
                    }
                }
            }
        }
    }

    return docs;
};

const seedMasterCurriculum = async ({ wipeExisting = true } = {}) => {
    console.log(`[SeedCurriculum] Starting NCTB curriculum seeding (wipeExisting: ${wipeExisting})...`);

    if (wipeExisting) {
        const delRes = await Topic.deleteMany({});
        console.log(`[SeedCurriculum] Deleted ${delRes.deletedCount} existing topics.`);
    }

    const docs = buildCurriculumTopics();
    console.log(`[SeedCurriculum] Prepared ${docs.length} NCTB topics across classes and subjects.`);

    if (docs.length > 0) {
        const inserted = await Topic.insertMany(docs, { ordered: false });
        console.log(`[SeedCurriculum] Successfully inserted ${inserted.length} topics into MongoDB.`);
    }

    // Synchronize notes syllabus folders
    try {
        const { syncAllSyllabusFolders } = require('../controllers/topicController');
        if (typeof syncAllSyllabusFolders === 'function') {
            console.log('[SeedCurriculum] Syncing Notes syllabus folders...');
            await syncAllSyllabusFolders();
            console.log('[SeedCurriculum] Notes syllabus folders synced.');
        }
    } catch (e) {
        console.warn('[SeedCurriculum] Note folder sync warning:', e.message);
    }

    const totalCount = await Topic.countDocuments();
    console.log(`[SeedCurriculum] Finished. Total topics in database: ${totalCount}`);
    return { success: true, count: totalCount };
};

// If run directly from CLI
if (require.main === module) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay';
    mongoose.connect(mongoUri)
        .then(async () => {
            console.log('[SeedCurriculum] Connected to MongoDB:', mongoUri);
            await seedMasterCurriculum({ wipeExisting: true });
            process.exit(0);
        })
        .catch(err => {
            console.error('[SeedCurriculum] Error:', err);
            process.exit(1);
        });
}

module.exports = {
    seedMasterCurriculum,
    buildCurriculumTopics,
    curriculumConfigs
};
