require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const superadmin = await User.findOne({ role: 'superadmin' });
    console.log('Superadmin:', superadmin);
    mongoose.disconnect();
});
