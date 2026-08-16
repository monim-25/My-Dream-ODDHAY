const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const SystemLog = require('./models/SystemLog');
const User = require('./models/User');
const { connectDB } = require('./config');

const run = async () => {
    try {
        await connectDB();
        
        // Get a superadmin or admin user to act as the performer
        const user = await User.findOne({ role: { $in: ['superadmin', 'admin', 'teacher'] } });
        if (!user) {
            console.log('No staff user found to assign logs to.');
            process.exit(1);
        }

        const actions = ['CREATE', 'UPDATE', 'DELETE', 'FREE', 'PAID', 'SETTING', 'APPROVE', 'REJECT', 'LOGIN'];
        const entities = ['User', 'Course', 'Quiz', 'Payment', 'System Settings', 'Role', 'Video Lesson'];
        
        const fakeLogs = [];
        const now = new Date();

        for (let i = 0; i < 20; i++) {
            const action = actions[Math.floor(Math.random() * actions.length)];
            const entityType = entities[Math.floor(Math.random() * entities.length)];
            
            let actionDetails = '';
            switch (action) {
                case 'CREATE': actionDetails = `Created new ${entityType} record in the database`; break;
                case 'UPDATE': actionDetails = `Updated properties for ${entityType} #` + Math.floor(Math.random() * 9999); break;
                case 'DELETE': actionDetails = `Removed ${entityType} from the system entirely`; break;
                case 'FREE': actionDetails = `Changed access type to Free for ${entityType}`; break;
                case 'PAID': actionDetails = `Changed access type to Premium/Paid for ${entityType}`; break;
                case 'SETTING': actionDetails = `Modified global configuration for ${entityType}`; break;
                case 'APPROVE': actionDetails = `Approved pending ${entityType} request`; break;
                case 'REJECT': actionDetails = `Rejected invalid ${entityType} submission`; break;
                case 'LOGIN': actionDetails = `Successful authentication and login via web portal`; break;
            }

            // Distribute logs over the last 10 days
            const pastDate = new Date(now.getTime() - (Math.random() * 10 * 24 * 60 * 60 * 1000));

            fakeLogs.push({
                action,
                actionDetails,
                performedBy: user._id,
                entityType,
                createdAt: pastDate,
                updatedAt: pastDate
            });
        }

        await SystemLog.insertMany(fakeLogs);
        console.log(`Successfully added ${fakeLogs.length} fake system logs!`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
