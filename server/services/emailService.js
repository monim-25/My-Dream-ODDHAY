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

/**
 * পেমেন্ট এপ্রুভাল ইমেইল পাঠানো
 */
const sendPaymentApprovalEmail = async (toEmail, userName, courseName, amount) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"ODDHAY শিক্ষা প্ল্যাটফর্ম" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: 'পেমেন্ট অনুমোদিত হয়েছে - ODDHAY 🎓',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f0f4f8; border-radius: 16px;">
                <h1 style="color: #1a73e8; text-align: center;">✅ পেমেন্ট সফল!</h1>
                <p style="color: #333; font-size: 16px;">প্রিয় <strong>${userName}</strong>,</p>
                <p style="color: #555; line-height: 1.7;">
                    আপনার পেমেন্ট (৳${amount}) সফলভাবে অনুমোদিত হয়েছে।
                    <strong>${courseName}</strong> কোর্সে আপনার অ্যাক্সেস চালু করা হয়েছে।
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.BASE_URL || 'http://localhost:3005'}/dashboard" 
                       style="background: #1a73e8; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 15px;">
                        ক্লাস শুরু করুন →
                    </a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center;">© 2025 ODDHAY শিক্ষা প্ল্যাটফর্ম</p>
            </div>
            `
        });
        console.log(`✅ Payment approval email sent to ${toEmail}`);
    } catch (err) {
        console.warn(`⚠️ Payment approval email failed: ${err.message}`);
    }
};

/**
 * Send password reset notification (admin reset)
 */
const sendPasswordResetNotificationEmail = async (toEmail, userName, tempPassword) => {
    const transporter = createTransporter();
    try {
        await transporter.sendMail({
            from: `"ODDHAY Command Center" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: 'Security Alert: Your Password Has Been Reset - ODDHAY',
            html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
                <div style="background: #f8fafc; padding: 40px; border-bottom: 3px solid #ef4444;">
                    <h2 style="margin: 0; color: #ef4444;">Security Alert</h2>
                    <p style="color: #64748b;">Your ODDHAY password has been reset by an Administrator.</p>
                </div>
                <div style="padding: 40px; background: white;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>Your password has been reset. Please use the temporary password below to log in:</p>
                    <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #0f172a; margin: 20px 0;">
                        ${tempPassword}
                    </div>
                    <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 16px; border-radius: 8px; margin-top: 20px;">
                        <strong>Important:</strong> For security reasons, you will be required to change this password immediately upon logging in.
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
                    © ${new Date().getFullYear()} ODDHAY Command Center
                </div>
            </div>`
        });
        console.log(`✅ Password reset notification sent to ${toEmail}`);
    } catch (err) { console.error(`❌ Failed to send password reset notification: ${err.message}`); }
};

/**
 * Send staff account invitation
 */
const sendStaffInviteEmail = async (toEmail, userName, role, password) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
    const transporter = createTransporter();
    try {
        await transporter.sendMail({
            from: `"ODDHAY Command Center" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: 'Welcome to the Team: Your ODDHAY Staff Account - ODDHAY',
            html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: #0f172a; padding: 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">Welcome to ODDHAY</h1>
                    <p style="color: #94a3b8; margin-top: 8px;">Your staff account is ready</p>
                </div>
                <div style="padding: 40px;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>An administrative account has been created for you on the <strong>ODDHAY</strong> platform with the role of <strong>${role.toUpperCase()}</strong>.</p>
                    <p>You can log in using the credentials below:</p>
                    
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Login Email</td>
                                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${toEmail}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Temporary Password</td>
                                <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #2563eb;">${password}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${process.env.BASE_URL || 'http://localhost:3005'}/login" 
                           style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                            Log In to Dashboard
                        </a>
                    </div>

                    <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 16px; border-radius: 8px; font-size: 13px; color: #9a3412;">
                        <strong>Security Note:</strong> Please change your password immediately after your first login for security purposes.
                    </div>
                </div>
                <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 11px;">
                    © ${new Date().getFullYear()} ODDHAY Platforms Ltd. All rights reserved.
                </div>
            </div>`
        });
        console.log(`✅ Staff invite email sent to ${toEmail}`);
    } catch (err) { console.error(`❌ Failed to send staff invite: ${err.message}`); }
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail, sendPaymentApprovalEmail, sendPasswordResetNotificationEmail, sendStaffInviteEmail };
