const { connectDB, Course, QA, User } = require('./config');
const mongoose = require('mongoose');

async function seed() {
    await connectDB();
    
    // Find a student
    const student = await User.findOne({ role: 'student' });
    if (!student) {
        console.log('No student found');
        process.exit();
    }

    // Find the teacher (the one currently logged in)
    const teacher = await User.findOne({ email: 'antigravitycode12@gmail.com' });
    if (!teacher) {
        console.log('No teacher found');
        process.exit();
    }

    // Find 5 random courses and assign them to the teacher so they have diverse subjects
    const allCourses = await Course.find().limit(5);
    for (let c of allCourses) {
        if (!c.permittedTeachers.includes(teacher._id)) {
            c.permittedTeachers.push(teacher._id);
            await c.save();
        }
    }

    const courses = await Course.find({
        $or: [{ instructor: teacher._id }, { permittedTeachers: teacher._id }]
    });

    const fakeQuestions = [
        "Why does water expand when it freezes?",
        "Can you help me balance this chemical equation?",
        "How do I determine the domain of this function?",
        "What were the economic impacts of the Industrial Revolution?",
        "Can you explain string theory in simple terms?",
        "How do you conjugate this verb in Spanish?",
        "What is the difference between mitosis and meiosis?",
        "How does a four-stroke engine work?",
        "What are the key themes in Shakespeare's Macbeth?",
        "How do I calculate the area under this curve?"
    ];

    for (let i = 0; i < 10; i++) {
        const course = courses[i % courses.length];
        await QA.create({
            question: fakeQuestions[i],
            askedBy: student._id,
            askedByName: student.name,
            course: course._id,
            status: 'open'
        });
    }

    console.log(`10 QA inserted successfully into teacher's courses!`);
    process.exit();
}

seed();
