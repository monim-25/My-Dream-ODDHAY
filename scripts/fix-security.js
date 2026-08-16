const fs = require('fs');

const path = 'server/routes/admin.js';
let data = fs.readFileSync(path, 'utf8');

// 1. Fix Role Confusion: 'admin' instead of 'teacher' for data isolation
data = data.replace(/role === 'admin' \? \{ instructor:/g, "role === 'teacher' ? { instructor:");
data = data.replace(/role === 'admin' \? \{ addedBy:/g, "role === 'teacher' ? { addedBy:");

// 2. Fix the Delete Vulnerability
// Replace Delete Course
const oldDeleteCourse = `// Delete Course
router.get('/course/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const course = await Course.findByIdAndDelete(req.params.id);`;
const newDeleteCourse = `// Delete Course
router.get('/course/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const courseToVerify = await Course.findById(req.params.id);
        if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
            return res.status(403).send('অনুমতি নেই। এটি আপনার কোর্স নয়।');
        }
        const course = await Course.findByIdAndDelete(req.params.id);`;

data = data.replace(oldDeleteCourse, newDeleteCourse);

// Replace Delete Class
const oldDeleteClass = `// Delete Class (Video Lesson)
router.get('/class/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        await Course.updateOne(
            { 'chapters.recordedClasses._id': req.params.id },
            { $pull: { 'chapters.$.recordedClasses': { _id: req.params.id } } }
        );`;
const newDeleteClass = `// Delete Class (Video Lesson)
router.get('/class/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const courseToVerify = await Course.findOne({ 'chapters.recordedClasses._id': req.params.id });
        if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
            return res.status(403).send('অনুমতি নেই।');
        }
        await Course.updateOne(
            { 'chapters.recordedClasses._id': req.params.id },
            { $pull: { 'chapters.$.recordedClasses': { _id: req.params.id } } }
        );`;

data = data.replace(oldDeleteClass, newDeleteClass);

// Replace Chapter Item Deletion
const oldChapterItemDel = `// Chapter Item Deletion
router.get('/course/:cid/chapter/:chid/item/:itid/delete/:type', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();`;
const newChapterItemDel = `// Chapter Item Deletion
router.get('/course/:cid/chapter/:chid/item/:itid/delete/:type', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const courseToVerify = await Course.findById(req.params.cid);
        if (courseToVerify && req.session.user.role === 'teacher' && courseToVerify.instructor.toString() !== req.session.userId) {
            return res.status(403).send('অনুমতি নেই।');
        }`;

data = data.replace(oldChapterItemDel, newChapterItemDel);

// Add auth check to /quiz/:id delete, /note/:id/delete, /question-bank/:id/delete
const oldDeleteQuiz = `// Delete entire quiz
router.delete('/quiz/:id', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        await Quiz.findByIdAndDelete(req.params.id);`;
const newDeleteQuiz = `// Delete entire quiz
router.delete('/quiz/:id', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await Quiz.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
            return res.status(403).json({ success: false, error: 'অনুমতি নেই।' });
        }
        await Quiz.findByIdAndDelete(req.params.id);`;
data = data.replace(oldDeleteQuiz, newDeleteQuiz);

const oldDeleteNote = `// Delete Note
router.get('/note/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        await Note.findByIdAndDelete(req.params.id);`;
const newDeleteNote = `// Delete Note
router.get('/note/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await Note.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
             return res.status(403).send('অনুমতি নেই।');
        }
        await Note.findByIdAndDelete(req.params.id);`;
data = data.replace(oldDeleteNote, newDeleteNote);

const oldDeleteQb = `// Delete Question Bank entry
router.get('/question-bank/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        await QuestionBank.findByIdAndDelete(req.params.id);`;
const newDeleteQb = `// Delete Question Bank entry
router.get('/question-bank/:id/delete', contentAdminProtect, async (req, res) => {
    try {
        await connectDB();
        const targetToVerify = await QuestionBank.findById(req.params.id);
        if (targetToVerify && req.session.user.role === 'teacher' && targetToVerify.addedBy.toString() !== req.session.userId) {
             return res.status(403).send('অনুমতি নেই।');
        }
        await QuestionBank.findByIdAndDelete(req.params.id);`;
data = data.replace(oldDeleteQb, newDeleteQb);

fs.writeFileSync(path, data);
console.log('Fixed role confusion and delete security bugs!');
