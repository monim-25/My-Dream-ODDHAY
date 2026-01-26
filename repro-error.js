const mongoose = require('mongoose');
const User = require('./server/models/User');
require('dotenv').config();

async function reproduce() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected');

        const userData = {
            name: "Test Bug",
            password: "password123",
            role: "student",
            classLevel: "Class 10"
        };

        // Try with a fresh email
        userData.email = "bugtest-" + Date.now() + "@example.com";

        console.log('Attempting to save user:', JSON.stringify(userData, null, 2));
        const newUser = new User(userData);
        await newUser.save();
        console.log('Save successful!');

        await User.deleteOne({ _id: newUser._id });
        process.exit(0);
    } catch (err) {
        console.error('FAILED TO SAVE:');
        console.error('Name:', err.name);
        console.error('Message:', err.message);
        if (err.errors) {
            console.error('Validation Errors:', JSON.stringify(err.errors, null, 2));
        }
        process.exit(1);
    }
}

reproduce();
