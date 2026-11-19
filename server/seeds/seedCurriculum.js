/**
 * Official NCTB Master Curriculum Seeder for ALL Subjects (Class 9 - 12)
 * Covers 100% of subjects in AcademicClass across Science, Commerce, Humanities, and Compulsory
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const Folder = require('../models/Folder');

const science = require('./nctbMasterCurriculum');
const compulsory = require('./curriculumCompulsory');
const commerce = require('./curriculumCommerce');
const humanities = require('./curriculumHumanities');

const curriculumConfigs = [
    // ==========================================
    // SSC (Class 9 & Class 10) - COMPULSORY
    // ==========================================
    {
        dataset: compulsory.sscBangla1,
        classes: ['Class 9', 'Class 10'],
        subject: 'Bangla 1st Paper',
        codePrefix: 'SSC-BAN1',
        group: 'None',
        segment: 'সাহিত্য'
    },
    {
        dataset: compulsory.sscBangla2,
        classes: ['Class 9', 'Class 10'],
        subject: 'Bangla 2nd Paper',
        codePrefix: 'SSC-BAN2',
        group: 'None',
        segment: 'ব্যাকরণ ও নির্মিতি'
    },
    {
        dataset: compulsory.sscEnglish1,
        classes: ['Class 9', 'Class 10'],
        subject: 'English 1st Paper',
        codePrefix: 'SSC-ENG1',
        group: 'None',
        segment: 'English for Today'
    },
    {
        dataset: compulsory.sscEnglish2,
        classes: ['Class 9', 'Class 10'],
        subject: 'English 2nd Paper',
        codePrefix: 'SSC-ENG2',
        group: 'None',
        segment: 'Grammar & Composition'
    },
    {
        dataset: science.sscGeneralMath,
        classes: ['Class 9', 'Class 10'],
        subject: 'Mathematics',
        codePrefix: 'SSC-GMATH',
        group: 'None',
        segment: 'সাধারণ গণিত'
    },
    {
        dataset: science.sscICT,
        classes: ['Class 9', 'Class 10'],
        subject: 'Information and Communication Technology',
        codePrefix: 'SSC-ICT',
        group: 'None',
        segment: 'আইসিটি'
    },
    {
        dataset: compulsory.sscReligion,
        classes: ['Class 9', 'Class 10'],
        subject: 'Religion & Moral Education',
        codePrefix: 'SSC-REL',
        group: 'None',
        segment: 'ইসলাম ও নৈতিক শিক্ষা'
    },
    {
        dataset: compulsory.sscBGS,
        classes: ['Class 9', 'Class 10'],
        subject: 'Bangladesh & Global Studies',
        codePrefix: 'SSC-BGS',
        group: 'None',
        segment: 'বাংলাদেশ ও বিশ্বপরিচয়'
    },

    // ==========================================
    // SSC (Class 9 & Class 10) - SCIENCE
    // ==========================================
    {
        dataset: science.sscPhysics,
        classes: ['Class 9', 'Class 10'],
        subject: 'Physics',
        codePrefix: 'SSC-PHY',
        group: 'Science',
        segment: 'পদার্থবিজ্ঞান'
    },
    {
        dataset: science.sscChemistry,
        classes: ['Class 9', 'Class 10'],
        subject: 'Chemistry',
        codePrefix: 'SSC-CHE',
        group: 'Science',
        segment: 'রসায়ন'
    },
    {
        dataset: science.sscBiology,
        classes: ['Class 9', 'Class 10'],
        subject: 'Biology',
        codePrefix: 'SSC-BIO',
        group: 'Science',
        segment: 'জীববিজ্ঞান'
    },
    {
        dataset: science.sscHigherMath,
        classes: ['Class 9', 'Class 10'],
        subject: 'Higher Mathematics',
        codePrefix: 'SSC-HMATH',
        group: 'Science',
        segment: 'উচ্চতর গণিত'
    },

    // ==========================================
    // SSC (Class 9 & Class 10) - COMMERCE
    // ==========================================
    {
        dataset: commerce.sscAccounting,
        classes: ['Class 9', 'Class 10'],
        subject: 'Accounting',
        codePrefix: 'SSC-ACC',
        group: 'Commerce',
        segment: 'হিসাববিজ্ঞান'
    },
    {
        dataset: commerce.sscBusinessEnt,
        classes: ['Class 9', 'Class 10'],
        subject: 'Business Entrepreneurship',
        codePrefix: 'SSC-ENT',
        group: 'Commerce',
        segment: 'ব্যবসায় উদ্যোগ'
    },
    {
        dataset: commerce.sscFinance,
        classes: ['Class 9', 'Class 10'],
        subject: 'Finance & Banking',
        codePrefix: 'SSC-FIN',
        group: 'Commerce',
        segment: 'ফিন্যান্স ও ব্যাংকিং'
    },

    // ==========================================
    // SSC (Class 9 & Class 10) - HUMANITIES
    // ==========================================
    {
        dataset: humanities.sscGeography,
        classes: ['Class 9', 'Class 10'],
        subject: 'Geography & Environment',
        codePrefix: 'SSC-GEO',
        group: 'Humanities',
        segment: 'ভূগোল ও পরিবেশ'
    },
    {
        dataset: humanities.sscCivics,
        classes: ['Class 9', 'Class 10'],
        subject: 'Civics & Citizenship',
        codePrefix: 'SSC-CIV',
        group: 'Humanities',
        segment: 'পৌরনীতি ও নাগরিকতা'
    },
    {
        dataset: humanities.sscEconomics,
        classes: ['Class 9', 'Class 10'],
        subject: 'Economics',
        codePrefix: 'SSC-ECO',
        group: 'Humanities',
        segment: 'অর্থনীতি'
    },
    {
        dataset: humanities.sscHistory,
        classes: ['Class 9', 'Class 10'],
        subject: 'History of Bangladesh & World Civilization',
        codePrefix: 'SSC-HIS',
        group: 'Humanities',
        segment: 'বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা'
    },

    // ==========================================
    // HSC (Class 11 & Class 12) - COMPULSORY
    // ==========================================
    {
        dataset: compulsory.hscBangla1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Bangla 1st Paper',
        codePrefix: 'HSC-BAN1',
        group: 'None',
        segment: 'সাহিত্যপাঠ'
    },
    {
        dataset: compulsory.hscBangla2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Bangla 2nd Paper',
        codePrefix: 'HSC-BAN2',
        group: 'None',
        segment: 'ব্যাকরণ ও নির্মিতি'
    },
    {
        dataset: compulsory.hscEnglish1,
        classes: ['Class 11', 'Class 12'],
        subject: 'English 1st Paper',
        codePrefix: 'HSC-ENG1',
        group: 'None',
        segment: 'English for Today'
    },
    {
        dataset: compulsory.hscEnglish2,
        classes: ['Class 11', 'Class 12'],
        subject: 'English 2nd Paper',
        codePrefix: 'HSC-ENG2',
        group: 'None',
        segment: 'Grammar and Composition'
    },
    {
        dataset: science.hscICT,
        classes: ['Class 11', 'Class 12'],
        subject: 'ICT',
        codePrefix: 'HSC-ICT',
        group: 'None',
        segment: 'আবশ্যিক'
    },

    // ==========================================
    // HSC (Class 11 & Class 12) - SCIENCE
    // ==========================================
    {
        dataset: science.hscPhysics1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Physics',
        codePrefix: 'HSC-PHY1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: science.hscPhysics2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Physics',
        codePrefix: 'HSC-PHY2',
        group: 'Science',
        segment: '২য় পত্র'
    },
    {
        dataset: science.hscChemistry1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Chemistry',
        codePrefix: 'HSC-CHE1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: science.hscChemistry2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Chemistry',
        codePrefix: 'HSC-CHE2',
        group: 'Science',
        segment: '২য় পত্র'
    },
    {
        dataset: science.hscBiology1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Biology 1st Paper',
        codePrefix: 'HSC-BIO1',
        group: 'Science',
        segment: '১ম পত্র (উদ্ভিদবিজ্ঞান)'
    },
    {
        dataset: science.hscBiology2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Biology 2nd Paper',
        codePrefix: 'HSC-BIO2',
        group: 'Science',
        segment: '২য় পত্র (প্রাণীবিজ্ঞান)'
    },
    {
        dataset: science.hscHigherMath1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Higher Mathematics',
        codePrefix: 'HSC-HMATH1',
        group: 'Science',
        segment: '১ম পত্র'
    },
    {
        dataset: science.hscHigherMath2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Higher Mathematics',
        codePrefix: 'HSC-HMATH2',
        group: 'Science',
        segment: '২য় পত্র'
    },

    // ==========================================
    // HSC (Class 11 & Class 12) - COMMERCE
    // ==========================================
    {
        dataset: commerce.hscAccounting1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Accounting',
        codePrefix: 'HSC-ACC1',
        group: 'Commerce',
        segment: '১ম পত্র'
    },
    {
        dataset: commerce.hscAccounting2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Accounting',
        codePrefix: 'HSC-ACC2',
        group: 'Commerce',
        segment: '২য় পত্র'
    },
    {
        dataset: commerce.hscBusinessOrg1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Business Organization & Management',
        codePrefix: 'HSC-BOM1',
        group: 'Commerce',
        segment: '১ম পত্র'
    },
    {
        dataset: commerce.hscBusinessOrg2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Business Organization & Management',
        codePrefix: 'HSC-BOM2',
        group: 'Commerce',
        segment: '২য় পত্র'
    },
    {
        dataset: commerce.hscFinance1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Finance',
        codePrefix: 'HSC-FIN',
        group: 'Commerce',
        segment: '১ম পত্র'
    },
    {
        dataset: commerce.hscFinance2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Banking & Insurance',
        codePrefix: 'HSC-BNK',
        group: 'Commerce',
        segment: '২য় পত্র'
    },
    {
        dataset: commerce.hscProduction1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Production Management & Marketing',
        codePrefix: 'HSC-PMM1',
        group: 'Commerce',
        segment: '১ম পত্র'
    },
    {
        dataset: commerce.hscProduction2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Production Management & Marketing',
        codePrefix: 'HSC-PMM2',
        group: 'Commerce',
        segment: '২য় পত্র'
    },

    // ==========================================
    // HSC (Class 11 & Class 12) - HUMANITIES
    // ==========================================
    {
        dataset: humanities.hscEconomics1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Economics',
        codePrefix: 'HSC-ECO1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscEconomics2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Economics',
        codePrefix: 'HSC-ECO2',
        group: 'Humanities',
        segment: '২য় পত্র'
    },
    {
        dataset: humanities.hscCivics1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Civics & Good Governance',
        codePrefix: 'HSC-CGG1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscCivics2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Civics & Good Governance',
        codePrefix: 'HSC-CGG2',
        group: 'Humanities',
        segment: '২য় পত্র'
    },
    {
        dataset: humanities.hscHistory1,
        classes: ['Class 11', 'Class 12'],
        subject: 'History',
        codePrefix: 'HSC-HIS1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscHistory2,
        classes: ['Class 11', 'Class 12'],
        subject: 'History',
        codePrefix: 'HSC-HIS2',
        group: 'Humanities',
        segment: '২য় পত্র'
    },
    {
        dataset: humanities.hscIslamicHistory1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Islamic History & Culture',
        codePrefix: 'HSC-IHC1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscIslamicHistory2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Islamic History & Culture',
        codePrefix: 'HSC-IHC2',
        group: 'Humanities',
        segment: '২য় পত্র'
    },
    {
        dataset: humanities.hscLogic1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Logic',
        codePrefix: 'HSC-LOG1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscLogic2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Logic',
        codePrefix: 'HSC-LOG2',
        group: 'Humanities',
        segment: '২য় পত্র'
    },
    {
        dataset: humanities.hscSociology1,
        classes: ['Class 11', 'Class 12'],
        subject: 'Sociology',
        codePrefix: 'HSC-SOC1',
        group: 'Humanities',
        segment: '১ম পত্র'
    },
    {
        dataset: humanities.hscSociology2,
        classes: ['Class 11', 'Class 12'],
        subject: 'Sociology',
        codePrefix: 'HSC-SOC2',
        group: 'Humanities',
        segment: '২য় পত্র'
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
    console.log(`[SeedCurriculum] Starting complete NCTB curriculum seeding (wipeExisting: ${wipeExisting})...`);

    if (wipeExisting) {
        const delRes = await Topic.deleteMany({});
        console.log(`[SeedCurriculum] Deleted ${delRes.deletedCount} existing topics.`);
    }

    const docs = buildCurriculumTopics();
    console.log(`[SeedCurriculum] Prepared ${docs.length} NCTB topics for all subjects in Class 9-12.`);

    if (docs.length > 0) {
        const inserted = await Topic.insertMany(docs, { ordered: false });
        console.log(`[SeedCurriculum] Successfully inserted ${inserted.length} topics into MongoDB.`);
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
