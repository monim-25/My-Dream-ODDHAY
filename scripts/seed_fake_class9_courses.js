require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../server/models/Course');
const User = require('../server/models/User');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const fakeCourses = [
    {
        title: 'Class 9 Physics: Motion, Force & Energy Masterclass',
        subject: ['Physics'],
        category: ['Science', 'Academic'],
        classLevel: ['Class 9'],
        description: 'Comprehensive preparation for Class 9 Physics covering conceptual video lectures, live problem solving, and chapter-wise interactive quizzes.',
        thumbnail: 'uploads/thumbnails/1786697895969-Whisk_9ab66dde6d806d99c074fa44c798ca21dr (1).jpeg',
        accessType: 'paid',
        price: 1200,
        discountPrice: 850,
        difficulty: 'Intermediate',
        tags: ['Physics', 'Class 9', 'Science'],
        chapters: [
            {
                title: 'Chapter 1: Physical Quantities & Measurements',
                recordedClasses: [
                    { title: 'Units and Dimensions', duration: '25m', accessType: 'paid', views: 45 },
                    { title: 'Vernier Calipers & Screw Gauge', duration: '30m', accessType: 'paid', views: 60 }
                ],
                liveClasses: [
                    { title: 'Live Doubt Clearing on Measurements', date: new Date(Date.now() + 86400000 * 2) }
                ],
                notes: [
                    { title: 'Physics Formula Sheet (Ch 1-3)', filePath: 'uploads/notes/physics-formula.pdf' }
                ]
            },
            {
                title: 'Chapter 2: Motion and Kinematics',
                recordedClasses: [
                    { title: 'Speed, Velocity & Acceleration', duration: '35m', accessType: 'paid', views: 78 },
                    { title: 'Equations of Motion Solved Examples', duration: '40m', accessType: 'paid', views: 92 }
                ],
                liveClasses: [],
                notes: [
                    { title: 'Kinematics Practice Sheet', filePath: 'uploads/notes/kinematics.pdf' }
                ]
            }
        ]
    },
    {
        title: 'Class 9 Higher Mathematics: Algebra & Coordinate Geometry',
        subject: ['Higher Mathematics'],
        category: ['Science', 'Academic'],
        classLevel: ['Class 9'],
        description: 'Master all tricky mathematical problems with step-by-step solutions, board question analysis, and live weekly doubt-clearing sessions.',
        thumbnail: 'uploads/thumbnails/1778005520860-a-premium-vector-logo-design-featuring-t_43m4WCPET9ScDBlEtjYuiA_MH6hFURNTE6Zv8HQ3IIHpg_cover_sd.jpeg',
        accessType: 'paid',
        price: 1500,
        discountPrice: 990,
        difficulty: 'Advanced',
        tags: ['Higher Math', 'Class 9', 'Algebra'],
        chapters: [
            {
                title: 'Chapter 1: Set and Functions',
                recordedClasses: [
                    { title: 'Domain and Range concepts', duration: '30m', accessType: 'paid', views: 55 },
                    { title: 'One-to-One and Onto Functions', duration: '28m', accessType: 'paid', views: 42 }
                ],
                liveClasses: [
                    { title: 'Mastering Trigonometry Live', date: new Date(Date.now() + 86400000 * 3) }
                ],
                notes: [
                    { title: 'Set Theory & Function Notes', filePath: 'uploads/notes/set-functions.pdf' }
                ]
            }
        ]
    },
    {
        title: 'Class 9 Chemistry: Structure of Matter & Periodic Table',
        subject: ['Chemistry'],
        category: ['Science', 'Academic'],
        classLevel: ['Class 9'],
        description: 'Explore fundamental concepts of atoms, chemical bonding, and reactions with 3D animated lessons and interactive model tests.',
        thumbnail: 'uploads/thumbnails/1772119181176-gallery_img_63aaf28f9cddb.jpg',
        accessType: 'paid',
        price: 1100,
        discountPrice: 750,
        difficulty: 'Beginner',
        tags: ['Chemistry', 'Class 9', 'Matter'],
        chapters: [
            {
                title: 'Chapter 3: Structure of Matter',
                recordedClasses: [
                    { title: 'Rutherford & Bohr Atomic Model', duration: '32m', accessType: 'paid', views: 64 },
                    { title: 'Electronic Configuration Principles', duration: '26m', accessType: 'paid', views: 50 }
                ],
                liveClasses: [],
                notes: [
                    { title: 'Periodic Table Quick Reference Sheet', filePath: 'uploads/notes/periodic-table.pdf' }
                ]
            }
        ]
    },
    {
        title: 'Class 9 Biology: Cell Structure, Genetics & Life Processes',
        subject: ['Biology'],
        category: ['Science', 'Academic'],
        classLevel: ['Class 9'],
        description: 'High-yield diagrams, revision notes, and past paper solutions to score top grades in your Class 9 Biology exams.',
        thumbnail: 'uploads/thumbnails/1778775981311-digital-art-isolated-house.jpg',
        accessType: 'paid',
        price: 1000,
        discountPrice: 650,
        difficulty: 'Beginner',
        tags: ['Biology', 'Class 9', 'Cells'],
        chapters: [
            {
                title: 'Chapter 2: Cells and Tissue',
                recordedClasses: [
                    { title: 'Plant Cell vs Animal Cell', duration: '22m', accessType: 'paid', views: 38 },
                    { title: 'Cell Division: Mitosis & Meiosis', duration: '35m', accessType: 'paid', views: 72 }
                ],
                liveClasses: [
                    { title: 'Cell Biology Live Review', date: new Date(Date.now() + 86400000 * 4) }
                ],
                notes: [
                    { title: 'Complete Biology Diagram Pack', filePath: 'uploads/notes/bio-diagrams.pdf' }
                ]
            }
        ]
    },
    {
        title: 'Class 9 English Grammar & Creative Writing Mastery',
        subject: ['English'],
        category: ['General', 'Academic'],
        classLevel: ['Class 9'],
        description: 'Master English 1st and 2nd Paper with grammar rules, paragraph writing, formal letters, and live speaking practice.',
        thumbnail: 'uploads/thumbnails/1778841764737-Bangla 1st paper  class routine (1).png',
        accessType: 'paid',
        price: 950,
        discountPrice: 600,
        difficulty: 'Intermediate',
        tags: ['English', 'Class 9', 'Grammar'],
        chapters: [
            {
                title: 'Chapter 1: Right Forms of Verbs & Transformation',
                recordedClasses: [
                    { title: 'Top 20 Rules for Right Form of Verbs', duration: '30m', accessType: 'paid', views: 88 },
                    { title: 'Sentence Transformation Techniques', duration: '28m', accessType: 'paid', views: 65 }
                ],
                liveClasses: [
                    { title: 'Live Essay & Paragraph Workshop', date: new Date(Date.now() + 86400000 * 5) }
                ],
                notes: [
                    { title: 'English 2nd Paper Grammar Cheat Sheet', filePath: 'uploads/notes/english-grammar.pdf' }
                ]
            }
        ]
    }
];

async function seed() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB at', uri);

        // Find an admin/teacher user to assign as instructor
        const teacher = await User.findOne({ role: { $in: ['teacher', 'admin', 'superadmin'] } });
        const teacherId = teacher ? teacher._id : null;

        for (const courseData of fakeCourses) {
            // Check if already exists by title
            const existing = await Course.findOne({ title: courseData.title });
            if (existing) {
                console.log(`Course "${courseData.title}" already exists. Skipping.`);
            } else {
                courseData.instructor = teacherId;
                const created = await Course.create(courseData);
                console.log(`Created course: "${created.title}" (ID: ${created._id})`);
            }
        }

        console.log('Seeding complete! 5 Class 9 courses are ready in the database.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
}

seed();
