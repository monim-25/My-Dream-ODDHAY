require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.findOneAndUpdate({ email: 'monimmdmonim41@gmail.com' }, { password: hashedPassword });
    console.log('Password updated to: admin123');
    mongoose.disconnect();
});
