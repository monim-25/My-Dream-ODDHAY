/**
 * SMS Service for ODDHAY
 * Supports Bangladeshi SMS Gateways (Greenweb, BulkSMS BD) and Twilio,
 * with graceful fallback to console simulation when no SMS gateway is configured.
 */

const https = require('https');
const http = require('http');

/**
 * Clean phone number to Bangladeshi format
 * e.g. "01712345678" or "+8801712345678" -> "8801712345678" & "01712345678"
 */
function normalizePhone(rawPhone) {
    if (!rawPhone) return { local: '', international: '' };
    const bengaliDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    let clean = String(rawPhone).replace(/[০-৯]/g, d => bengaliDigits[d]).replace(/[\s\-\+\(\)\.]/g, '');
    
    if (clean.startsWith('00880')) {
        clean = '880' + clean.slice(5);
    } else if (clean.startsWith('8800')) {
        clean = '880' + clean.slice(4);
    } else if (clean.startsWith('0')) {
        clean = '880' + clean.slice(1);
    } else if (/^1[3-9]\d{8}$/.test(clean)) {
        clean = '880' + clean;
    } else if (!clean.startsWith('880')) {
        clean = '880' + clean;
    }

    const local = '0' + clean.slice(3);
    return {
        local,
        international: clean
    };
}

/**
 * Send SMS OTP
 * @param {string} phone - Target phone number
 * @param {string} otp - 6-digit verification code
 * @param {string} purpose - 'registration' | 'password_reset' | 'verification'
 */
async function sendSmsOtp(phone, otp, purpose = 'verification') {
    const { local, international } = normalizePhone(phone);
    let messageText;
    if (purpose === 'login') {
        messageText = `Your ODDHAY Login verification OTP is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    } else if (purpose === 'phone_verification' || purpose === 'verification') {
        messageText = `Your ODDHAY Phone verification OTP is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    } else {
        const purposeText = purpose === 'registration' 
            ? 'Account Registration' 
            : purpose === 'password_reset' 
            ? 'Password Reset' 
            : 'Verification';
        messageText = `Your ODDHAY ${purposeText} verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    }

    // 1. Check Alpha SMS Gateway (Alpha Net: sms.net.bd or alphasms.biz)
    const alphaKey = process.env.ALPHA_SMS_API_KEY || process.env.ALPHASMS_API_KEY || (process.env.SMS_PROVIDER === 'alphasms' || process.env.SMS_PROVIDER === 'alphanet' ? process.env.SMS_API_KEY : null);
    if (alphaKey || process.env.SMS_PROVIDER === 'alphasms' || process.env.SMS_PROVIDER === 'alphanet') {
        try {
            const senderId = process.env.SMS_SENDER_ID || process.env.ALPHA_SMS_SENDER_ID || '';
            const isAlphaBiz = process.env.ALPHA_SMS_TYPE === 'biz' || (process.env.ALPHA_SMS_URL && process.env.ALPHA_SMS_URL.includes('alphasms.biz'));
            
            let url;
            if (isAlphaBiz) {
                const u = process.env.ALPHA_SMS_USER || '';
                url = `https://alphasms.biz/index.php?app=ws&u=${encodeURIComponent(u)}&h=${encodeURIComponent(alphaKey)}&op=pv&to=${encodeURIComponent(international)}&msg=${encodeURIComponent(messageText)}`;
            } else {
                // Default: Alpha Net Official API (https://api.sms.net.bd/sendsms)
                url = `https://api.sms.net.bd/sendsms?api_key=${encodeURIComponent(alphaKey)}&to=${encodeURIComponent(international)}&msg=${encodeURIComponent(messageText)}` + (senderId ? `&sender_id=${encodeURIComponent(senderId)}` : '');
            }

            const result = await makeHttpRequest(url);
            let parsed = null;
            try { parsed = JSON.parse(result); } catch (e) {}

            if (parsed && parsed.error !== 0) {
                console.error(`[SMS Gateway Error - Alpha SMS]: ${parsed.msg || 'Failed'} (Error code: ${parsed.error})`);
                return { success: false, provider: 'alphasms', error: parsed.msg, code: parsed.error, result };
            }

            console.log(`[SMS Gateway: Alpha SMS] Successfully dispatched to ${local}. Response:`, result);
            return { success: true, provider: 'alphasms', result, requestId: parsed?.data?.request_id };
        } catch (err) {
            console.error('[SMS Gateway Error - Alpha SMS]:', err.message);
        }
    }

    // 2. Check Greenweb SMS Gateway
    const greenwebToken = process.env.GREENWEB_TOKEN || (process.env.SMS_PROVIDER === 'greenweb' ? process.env.SMS_API_KEY : null);
    if (greenwebToken && !process.env.BULKSMS_API_KEY) {
        try {
            const url = `https://api.greenweb.com.bd/api.php?token=${encodeURIComponent(greenwebToken)}&to=${encodeURIComponent(international)}&message=${encodeURIComponent(messageText)}`;
            const result = await makeHttpRequest(url);
            console.log(`[SMS Gateway: Greenweb] Sent to ${local}. Response:`, result);
            return { success: true, provider: 'greenweb', result };
        } catch (err) {
            console.error('[SMS Gateway Error - Greenweb]:', err.message);
        }
    }

    // 2. Check BulkSMS BD Gateway
    const bulksmsKey = process.env.BULKSMS_API_KEY || (process.env.SMS_PROVIDER === 'bulksms' ? process.env.SMS_API_KEY : null);
    if (bulksmsKey) {
        try {
            const senderId = process.env.SMS_SENDER_ID || 'ODDHAY';
            const url = `http://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(bulksmsKey)}&type=text&number=${encodeURIComponent(international)}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(messageText)}`;
            const result = await makeHttpRequest(url);
            console.log(`[SMS Gateway: BulkSMS BD] Sent to ${local}. Response:`, result);
            return { success: true, provider: 'bulksms', result };
        } catch (err) {
            console.error('[SMS Gateway Error - BulkSMS BD]:', err.message);
        }
    }

    // 3. Fallback / Development Simulation Log
    // Clearly log in terminal so tester / admin can see and test immediately
    const border = '='.repeat(62);
    console.log(`\n${border}`);
    console.log(`[ODDHAY SMS OTP GATEWAY - SIMULATION / CONSOLE LOG]`);
    console.log(`Purpose   : ${purposeText}`);
    console.log(`Recipient : ${local} (${international})`);
    console.log(`OTP Code  : ${otp}`);
    console.log(`Message   : ${messageText}`);
    console.log(`Status    : Code active for 10 minutes.`);
    console.log(`Note      : To send actual SMS, add SMS_API_KEY in .env file.`);
    console.log(`${border}\n`);

    return {
        success: true,
        simulated: true,
        recipient: local,
        otp
    };
}

/**
 * Simple HTTP/HTTPS GET request helper with timeout
 */
function makeHttpRequest(urlStr) {
    return new Promise((resolve, reject) => {
        const client = urlStr.startsWith('https') ? https : http;
        const req = client.get(urlStr, { timeout: 8000 }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('SMS gateway request timed out'));
        });
        req.on('error', (err) => reject(err));
    });
}

module.exports = {
    sendSmsOtp,
    normalizePhone
};

