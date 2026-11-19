require('dotenv').config();
const mongoose = require('mongoose');
const Topic = require('../models/Topic');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const total = await Topic.countDocuments();
    console.log('Total topics in MongoDB:', total);

    const stats = await Topic.aggregate([
        {
            $group: {
                _id: { classLevel: '$classLevel', subject: '$subject' },
                topicsCount: { $sum: 1 },
                chapters: { $addToSet: '$chapter.name' }
            }
        },
        {
            $project: {
                _id: 1,
                topicsCount: 1,
                chapterCount: { $size: '$chapters' }
            }
        },
        {
            $sort: { '_id.classLevel': 1, '_id.subject': 1 }
        }
    ]);

    console.table(stats.map(s => ({
        Class: s._id.classLevel,
        Subject: s._id.subject,
        Chapters: s.chapterCount,
        Topics: s.topicsCount
    })));

    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
