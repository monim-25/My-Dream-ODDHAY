const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const { connectDB, Payment, Course } = require('./server/config');

async function testAgg() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const approvedPayments = await Payment.countDocuments({ status: 'approved' });
        console.log('Approved Payments Count:', approvedPayments);

        const agg = await Payment.aggregate([
            { $match: { status: 'approved' } },
            { 
                $lookup: { 
                    from: 'courses', 
                    localField: 'course', 
                    foreignField: '_id', 
                    as: 'c' 
                } 
            },
            { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
            { 
                $group: { 
                    _id: '$c.category', 
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                } 
            }
        ]);

        console.log('Aggregation Results:');
        console.dir(agg, { depth: null });

        if (agg.length > 0) {
            console.log('Categories found:', agg.map(a => a._id || 'Uncategorized').join(', '));
        } else {
            console.log('No aggregation results found.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Agg Test Error:', err);
        process.exit(1);
    }
}

testAgg();
