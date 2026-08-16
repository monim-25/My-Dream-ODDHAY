// seed-fake-students.js
// Run: node scripts/seed-fake-students.js
// Inserts 100 fake students into the same classLevel as Monim Islam

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../server/models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const bangladeshiNames = [
    'Rahim Uddin', 'Karim Hossain', 'Arif Khan', 'Sakib Ahmed', 'Nabil Islam',
    'Tanvir Hassan', 'Mahfuz Rahman', 'Riyad Hossain', 'Imran Ali', 'Faisal Chowdhury',
    'Zahid Hasan', 'Asif Iqbal', 'Rubel Mia', 'Shamim Ahmed', 'Jubayer Islam',
    'Nahid Hassan', 'Rasel Khan', 'Mizan Rahman', 'Sohel Rana', 'Belal Hossain',
    'Tauhid Islam', 'Sumon Das', 'Biplab Roy', 'Parvez Alam', 'Akib Hasan',
    'Farhan Ahmed', 'Sabbir Rahman', 'Murad Ali', 'Monir Hossain', 'Liton Sarkar',
    'Joynal Abedin', 'Shorif Uddin', 'Tohin Mia', 'Rakib Hassan', 'Arafat Islam',
    'Shafiq Rahman', 'Biplob Biswas', 'Salim Khan', 'Nur Islam', 'Mahmudul Hasan',
    'Tushar Ahmed', 'Rony Hossain', 'Mostofa Kamal', 'Hafiz Uddin', 'Suman Ghosh',
    'Pintu Sarkar', 'Ripon Chowdhury', 'Mahin Islam', 'Alimul Haque', 'Ridoy Sarkar',
    'Tasnim Akter', 'Sadia Islam', 'Nusrat Jahan', 'Mithila Hossain', 'Rabeya Begum',
    'Shirin Akter', 'Tamanna Islam', 'Fahmida Khatun', 'Roksana Begum', 'Sabrina Akter',
    'Meherun Nesa', 'Shapna Begum', 'Jesmin Akter', 'Rehana Parvin', 'Rokeya Sultana',
    'Naznin Akter', 'Halima Begum', 'Ayesha Khatun', 'Nasrin Akter', 'Poly Begum',
    'Sumaia Islam', 'Asha Rani', 'Mamata Roy', 'Kalpona Das', 'Mitu Akter',
    'Salma Khatun', 'Monika Rani', 'Prity Das', 'Rima Akter', 'Shanta Parvin',
    'Arman Hossain', 'Jahidul Islam', 'Tofazzal Hossain', 'Minhaj Uddin', 'Rezaul Karim',
    'Shahadat Hossain', 'Nurul Amin', 'Ahsan Habib', 'Mehedi Hasan', 'Kawsar Ahmed',
    'Delwar Hossain', 'Shawon Islam', 'Nazmul Hoque', 'Abul Kalam', 'Jalal Uddin',
    'Feroz Khan', 'Habibur Rahman', 'Kamrul Islam', 'Lutfor Rahman', 'Mamun Hossain'
];

async function seed() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find Monim's classLevel — look by role student with most XP or by name
    const monim = await User.findOne({ name: /monim/i }).lean();
    console.log('Found user:', monim ? { name: monim.name, classLevel: monim.classLevel, role: monim.role } : 'NOT FOUND');
    
    // If classLevel is undefined/null, list all students and their classes
    if (!monim || !monim.classLevel) {
        const students = await User.find({ role: 'student' }).select('name classLevel totalXP').sort({ totalXP: -1 }).limit(5).lean();
        console.log('Top students:', students.map(s => ({ name: s.name, classLevel: s.classLevel })));
    }

    const classLevel = (monim && monim.classLevel) ? monim.classLevel : 'Class 10';
    console.log(`📚 Using classLevel: "${classLevel}"`);

    // Delete previously seeded fake students
    await User.deleteMany({ email: { $regex: /^fakestudent_/ } });
    console.log('🗑️ Removed old fake students');

    const fakeStudents = bangladeshiNames.slice(0, 100).map((name, i) => ({
        name,
        email: `fakestudent_${i + 1}@oddhay-test.com`,
        password: '$2a$10$fakehashedpasswordfortest123456789012345678', // pre-hashed dummy
        role: 'student',
        classLevel,
        totalXP: Math.floor(Math.random() * 3000) + 50,
        streak: Math.floor(Math.random() * 30),
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
    }));

    await User.insertMany(fakeStudents, { ordered: false });
    console.log(`✅ Inserted ${fakeStudents.length} fake students in ${classLevel}`);

    await mongoose.disconnect();
    console.log('Done!');
}

seed().catch(err => { console.error(err); process.exit(1); });
