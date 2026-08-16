const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oddhay_db';

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    role: String,
    status: { type: String, default: 'active' },
    phone: String,
    lastActive: Date,
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema, 'users');

const firstNames = ['Rahim', 'Karim', 'Sumaiya', 'Fatema', 'Arif', 'Nusrat', 'Jahid', 'Tahmina', 'Sakib', 'Rina', 'Rafiq', 'Salma', 'Kamal', 'Nasir', 'Huma', 'Rizwan', 'Ayesha', 'Biplob', 'Dalia', 'Emon', 'Farhana', 'Gias', 'Hasan', 'Imran', 'Jesmin', 'Kabir', 'Liza', 'Mina', 'Nabil', 'Oishi', 'Polash', 'Rani', 'Sadia', 'Tareq', 'Umme', 'Vaskar', 'Wahid', 'Xenia', 'Yamin', 'Zakir'];
const lastNames = ['Islam', 'Khan', 'Hossain', 'Ahmed', 'Rahman', 'Das', 'Paul', 'Saha', 'Sarker', 'Miah', 'Chowdhury', 'Akter', 'Begum', 'Uddin', 'Sheikh'];

async function seedUsers() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing demo users (emails containing @demo.com)
        await User.deleteMany({ email: /@demo\.com$/ });
        console.log('Cleared existing demo users');

        const defaultPassword = await bcrypt.hash('12345678', 10);
        const users = [];

        // Generate 30 Students
        for (let i = 1; i <= 30; i++) {
            users.push({
                name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
                email: `student${i}@demo.com`,
                password: defaultPassword,
                role: 'student',
                phone: `01700000${String(i).padStart(2, '0')}`,
                lastActive: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000) : null,
            });
        }

        // Generate 10 Teachers
        for (let i = 1; i <= 10; i++) {
            users.push({
                name: `Teacher ${firstNames[Math.floor(Math.random() * firstNames.length)]}`,
                email: `teacher${i}@demo.com`,
                password: defaultPassword,
                role: 'teacher',
                phone: `01800000${String(i).padStart(2, '0')}`,
                lastActive: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000),
            });
        }

        // Generate 5 Guardians
        for (let i = 1; i <= 5; i++) {
            users.push({
                name: `Guardian ${firstNames[Math.floor(Math.random() * firstNames.length)]}`,
                email: `guardian${i}@demo.com`,
                password: defaultPassword,
                role: 'guardian',
                phone: `01900000${String(i).padStart(2, '0')}`,
                lastActive: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000),
            });
        }

        // Generate 3 Admins
        for (let i = 1; i <= 3; i++) {
            users.push({
                name: `Admin ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
                email: `admin${i}@demo.com`,
                password: defaultPassword,
                role: 'admin',
                phone: `01500000${String(i).padStart(2, '0')}`,
                lastActive: new Date(),
            });
        }

        // Generate 2 Super Admins
        for (let i = 1; i <= 2; i++) {
            users.push({
                name: `Super Admin ${i}`,
                email: `superadmin${i}@demo.com`,
                password: defaultPassword,
                role: 'superadmin',
                phone: `01300000${String(i).padStart(2, '0')}`,
                lastActive: new Date(),
            });
        }

        await User.insertMany(users);
        console.log(`Successfully created ${users.length} demo users`);
        console.log('Default Password: 12345678');

        mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

seedUsers();
