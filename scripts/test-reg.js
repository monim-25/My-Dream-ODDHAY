const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function testReg() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected');

        const testUser = {
            name: "Test Student " + Date.now(),
            password: "password123",
            role: "student",
            classLevel: "Class 10"
        };

        // Random phone to avoid duplicate error during test
        testUser.phone = "test" + Date.now();

        const newUser = new User(testUser);
        await newUser.save();
        console.log('Successfully created student user');

        await User.deleteOne({ _id: newUser._id });
        console.log('Deleted test user');

        process.exit(0);
    } catch (err) {
        console.error('Registration Test Failed:', err);
        process.exit(1);
    }
}

testReg();
