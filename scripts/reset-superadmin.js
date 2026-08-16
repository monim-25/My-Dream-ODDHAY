require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');
const bcrypt = require('bcrypt');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const password = await bcrypt.hash('admin123', 10);
    await User.findOneAndUpdate({ email: 'monimmdmonim41@gmail.com' }, { password });
    console.log('Password updated to: admin123');
    mongoose.disconnect();
});
