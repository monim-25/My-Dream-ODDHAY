require('dotenv').config();
const mongoose = require('mongoose');
const QA = require('./models/QA');

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const userId = '69ca76f6a711e9ae45bd85e9'; // From previous check
        const statuses = ['open', 'resolved'];
        const questions = [
            "How can I access the course material?",
            "Is there a certificate after completion?",
            "When is the next live class?",
            "I'm having trouble with the quiz.",
            "Can I change my subscription plan?",
            "Where can I find the recorded sessions?",
            "What is the deadline for the assignment?",
            "The video is not loading properly.",
            "Are there any group study sessions?",
            "How do I reset my password?",
            "Is the platform available on mobile?",
            "Can I download the lecture notes?",
            "How to contact the instructor directly?",
            "Is there any discount for group enrollment?",
            "What are the prerequisites for this course?",
            "I found a bug in the dashboard.",
            "Can I get a refund if I'm not satisfied?",
            "How do I submit my project?",
            "Where is the notification center?",
            "Is the content updated regularly?",
            "Can I pause my course subscription?",
            "How to join the student forum?",
            "Is there a dark mode for the app?",
            "What payment methods are supported?",
            "How long do I have access to the course?",
            "Are there any mock exams available?",
            "Can I skip some modules?",
            "How to earn reward points?",
            "Is there any peer review system?",
            "What happens after I finish all modules?"
        ];

        const fakeQAs = [];
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 10)); // Last 10 days
            
            fakeQAs.push({
                question: questions[i % questions.length],
                askedBy: userId,
                askedByName: 'Test Student ' + (i + 1),
                answer: i % 2 === 0 ? 'This is a sample answer for testing purposes.' : null,
                status: i % 2 === 0 ? 'resolved' : 'open',
                createdAt: date
            });
        }

        await QA.insertMany(fakeQAs);
        console.log('Successfully inserted 30 fake QAs');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
}

seed();
