const nodemailer = require('nodemailer');

// Create transporter - Gmail SMTP
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS  // Gmail App Password (not regular password)
        }
    });
};

/**
 * পাসওয়ার্ড রিসেট ইমেইল পাঠানো
 * @param {string} toEmail - প্রাপকের ইমেইল
 * @param {string} userName - প্রাপকের নাম
 * @param {string} resetLink - রিসেট লিঙ্ক
 */
const sendPasswordResetEmail = async (toEmail, userName, resetLink) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: `"ODDHAY শিক্ষা প্ল্যাটফর্ম" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'পাসওয়ার্ড রিসেট করুন - ODDHAY',
        html: `
        <!DOCTYPE html>
        <html lang="bn">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; }
                .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #1a73e8, #0d47a1); padding: 40px 30px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
                .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
                .body { padding: 40px 30px; }
                .greeting { font-size: 18px; font-weight: 700; color: #1a1a2e; margin-bottom: 16px; }
                .message { color: #555; line-height: 1.7; font-size: 15px; margin-bottom: 30px; }
                .btn { display: block; width: fit-content; margin: 0 auto; padding: 16px 40px; background: linear-gradient(135deg, #1a73e8, #0d47a1); color: white; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; text-align: center; box-shadow: 0 6px 20px rgba(26,115,232,0.4); }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 8px; margin-top: 30px; font-size: 13px; color: #856404; }
                .link-box { background: #f8f9fa; border: 1px dashed #dee2e6; border-radius: 8px; padding: 12px; margin-top: 20px; word-break: break-all; font-size: 12px; color: #666; }
                .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee; }
                .footer p { color: #999; font-size: 12px; margin: 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎓 ODDHAY</h1>
                    <p>শিক্ষার নতুন দিগন্ত</p>
                </div>
                <div class="body">
                    <p class="greeting">প্রিয় ${userName},</p>
                    <p class="message">
                        আপনি আপনার ODDHAY অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার অনুরোধ করেছেন।
                        নিচের বাটনে ক্লিক করে নতুন পাসওয়ার্ড সেট করুন।
                    </p>
                    <a href="${resetLink}" class="btn">🔐 পাসওয়ার্ড রিসেট করুন</a>
                    <div class="warning">
                        ⚠️ এই লিঙ্কটি <strong>১ ঘণ্টা</strong> পর মেয়াদ শেষ হয়ে যাবে।
                        যদি আপনি এই অনুরোধ না করে থাকেন, তাহলে এই ইমেইলটি উপেক্ষা করুন।
                    </div>
                    <div class="link-box">
                        <strong>লিঙ্ক কাজ না করলে এটি কপি করুন:</strong><br>
                        ${resetLink}
                    </div>
                </div>
                <div class="footer">
                    <p>© 2025 ODDHAY শিক্ষা প্ল্যাটফর্ম। সর্বস্বত্ব সংরক্ষিত।</p>
                    <p style="margin-top: 6px;">এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে, উত্তর দেবেন না।</p>
                </div>
            </div>
        </body>
        </html>
        `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${toEmail}. MessageId: ${info.messageId}`);
    return info;
};

/**
 * ওয়েলকাম ইমেইল পাঠানো (নতুন রেজিস্ট্রেশনে)
 */
const sendWelcomeEmail = async (toEmail, userName) => {
    // Only send if email config is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"ODDHAY শিক্ষা প্ল্যাটফর্ম" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: 'ODDHAY-তে স্বাগতম! 🎓',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f0f4f8; border-radius: 16px;">
                <h1 style="color: #1a73e8; text-align: center;">🎓 ODDHAY-তে স্বাগতম!</h1>
                <p style="color: #333; font-size: 16px;">প্রিয় <strong>${userName}</strong>,</p>
                <p style="color: #555; line-height: 1.7;">
                    ODDHAY শিক্ষা প্ল্যাটফর্মে আপনাকে স্বাগতম! আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।
                    এখন আপনি কোর্স, কুইজ, নোটস এবং আরও অনেক কিছু অ্যাক্সেস করতে পারবেন।
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL || 'http://localhost:3005'}/dashboard" 
                       style="background: #1a73e8; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 15px;">
                        ড্যাশবোর্ডে যান →
                    </a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center;">© 2025 ODDHAY শিক্ষা প্ল্যাটফর্ম</p>
            </div>
            `
        });
        console.log(`✅ Welcome email sent to ${toEmail}`);
    } catch (err) {
        // Non-critical, don't throw
        console.warn(`⚠️ Welcome email failed (non-critical): ${err.message}`);
    }
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };
