require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('./models/Course');

const FAKE_LIVE_TITLES = ['Live Class - Chapter 1 Revision','Live Class - Practice Session','Live Class - Mock Test Discussion'];
const FAKE_RECORDED_TITLES = ['Recorded Class 1 - Basics','Recorded Class 2 - Deep Dive','Class 1 - Foundation Concepts','Class 2 - Core Principles'];

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const courses = await Course.find({}).lean();
    let removed = 0;
    for (const c of courses) {
        let changed = false;
        const chapters = c.chapters.map(ch => {
            const liveBefore = (ch.liveClasses||[]).length;
            ch.liveClasses = (ch.liveClasses||[]).filter(lc =>
                !FAKE_LIVE_TITLES.includes(lc.title) &&
                !(lc.title && lc.title.startsWith('Live: ') && (lc.title.endsWith('- Revision Class') || lc.title.endsWith('- Q&A Session')))
            );
            const recBefore = (ch.recordedClasses||[]).length;
            ch.recordedClasses = (ch.recordedClasses||[]).filter(rc => !FAKE_RECORDED_TITLES.includes(rc.title));
            if (ch.liveClasses.length !== liveBefore || ch.recordedClasses.length !== recBefore) {
                removed += (liveBefore - ch.liveClasses.length) + (recBefore - ch.recordedClasses.length);
                changed = true;
            }
            return ch;
        });
        if (changed) {
            await Course.updateOne({ _id: c._id }, { $set: { chapters } });
            console.log('Cleaned:', c.title);
        }
    }
    console.log(`Done. Removed ${removed} fake entries.`);
    process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
