const fs = require('fs');
const path = 'server/routes/admin.js';
let data = fs.readFileSync(path, 'utf8');

const replacementConfigs = [
    {
        old: `router.post('/course/:id/add-chapter', contentAdminProtect, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');`,
        new: `router.post('/course/:id/add-chapter', contentAdminProtect, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
    const courseToVerify = await Course.findById(req.params.id);
    if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
        return res.status(403).send('অনুমতি নেই। এটি আপনার কোর্স নয়।');
    }`
    },
    {
        old: `}, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
    const videoPath = req.file ? \`/uploads/videos/\${req.file.filename}\` : null;
    await Course.updateOne({ _id: req.params.cid, 'chapters._id': req.params.chid }, { $push: { 'chapters.$.recordedClasses': { title: req.body.title, videoPath, duration: req.body.duration } } });
    res.redirect(\`/superadmin/course/\${req.params.cid}\`);
});`,
        new: `}, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
    const courseToVerify = await Course.findById(req.params.cid);
    if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
        return res.status(403).send('অনুমতি নেই। এটি আপনার কোর্স নয়।');
    }
    const videoPath = req.file ? \`/uploads/videos/\${req.file.filename}\` : null;
    await Course.updateOne({ _id: req.params.cid, 'chapters._id': req.params.chid }, { $push: { 'chapters.$.recordedClasses': { title: req.body.title, videoPath, duration: req.body.duration } } });
    res.redirect(\`/superadmin/course/\${req.params.cid}\`);
});`
    },
    {
        old: `}, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
    const filePath = req.file ? \`/uploads/notes/\${req.file.filename}\` : null;
    await Course.updateOne({ _id: req.params.cid, 'chapters._id': req.params.chid }, { $push: { 'chapters.$.notes': { title: req.body.title, filePath } } });
    res.redirect(\`/superadmin/course/\${req.params.cid}\`);
});`,
        new: `}, async (req, res) => {
    await connectDB();
    if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
    const courseToVerify = await Course.findById(req.params.cid);
    if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
        return res.status(403).send('অনুমতি নেই। এটি আপনার কোর্স নয়।');
    }
    const filePath = req.file ? \`/uploads/notes/\${req.file.filename}\` : null;
    await Course.updateOne({ _id: req.params.cid, 'chapters._id': req.params.chid }, { $push: { 'chapters.$.notes': { title: req.body.title, filePath } } });
    res.redirect(\`/superadmin/course/\${req.params.cid}\`);
});`
    },
    {
        old: `router.post('/course/:cid/chapter/:chid/add-live', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');`,
        new: `router.post('/course/:cid/chapter/:chid/add-live', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        if (req.session.user.role === 'superadmin') return res.status(403).send('সুপার অ্যাডমিন কন্টেন্ট যোগ করতে পারবেন না।');
        const courseToVerify = await Course.findById(req.params.cid);
        if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
            return res.status(403).send('অনুমতি নেই। এটি আপনার কোর্স নয়।');
        }`
    },
    {
        old: `router.post('/quiz/:id/add-question', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const { questionText, optionA, optionB, optionC, optionD, correctAnswerIndex, explanation } = req.body;`,
        new: `router.post('/quiz/:id/add-question', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await Quiz.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'অনুমতি নেই।' });
        }
        const { questionText, optionA, optionB, optionC, optionD, correctAnswerIndex, explanation } = req.body;`
    },
    {
        old: `router.put('/quiz/:id/question/:qid', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const { questionText, optionA, optionB, optionC, optionD, correctAnswerIndex, explanation } = req.body;`,
        new: `router.put('/quiz/:id/question/:qid', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await Quiz.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'অনুমতি নেই।' });
        }
        const { questionText, optionA, optionB, optionC, optionD, correctAnswerIndex, explanation } = req.body;`
    },
    {
        old: `router.put('/quiz/:id', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const { title, duration, courseId } = req.body;`,
        new: `router.put('/quiz/:id', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await Quiz.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'অনুমতি নেই।' });
        }
        const { title, duration, courseId } = req.body;`
    }
];

replacementConfigs.forEach(config => {
    data = data.replace(config.old, config.new);
});

fs.writeFileSync(path, data);
console.log('Fixed ownership bypass bugs for adding/editing items!');
