# 📋 MANUAL SETUP CHECKLIST - Push Notifications

## ✅ What's Already Done (Automatic)
- ✅ All code files created
- ✅ Models and services implemented
- ✅ API routes added
- ✅ Admin panel created
- ✅ Service worker configured
- ✅ VAPID keys generated and added to .env
- ✅ web-push package installed
- ✅ Code pushed to GitHub

---

## 🔧 MANUAL STEPS YOU NEED TO DO

### Step 1: Update .env on Production (Vercel/Render)

**IMPORTANT:** You need to add these environment variables to your production deployment:

Go to your hosting platform (Vercel/Render) and add:

```env
VAPID_PUBLIC_KEY=BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0
VAPID_PRIVATE_KEY=m6wqhB4H9nKQaGb84EJ7QSj-OQ8y30C89uSR_FKSxk8
VAPID_SUBJECT=mailto:admin@oddhay.com
```

**For Vercel:**
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable above
5. Redeploy your app

**For Render:**
1. Go to your dashboard
2. Select your web service
3. Go to Environment
4. Add each variable
5. Save (auto-redeploys)

---

### Step 2: Add Notification Icons (Optional but Recommended)

Create notification icons for better appearance:

**Create these images:**
- `client/public/images/icon-192.png` (192x192 pixels)
- `client/public/images/badge-72.png` (72x72 pixels)

**Quick way:** Use your ODDHAY logo and resize it.

**If you don't have icons:**
The system will work without them, but notifications won't have custom icons.

---

### Step 3: Add Push Notification Script to Student Dashboard

**File:** `client/views/dashboard-unified.ejs`

**Add before closing `</body>` tag:**

```html
<!-- Push Notification Manager -->
<script src="/js/push-notifications.js"></script>

<!-- Notification Settings Component (Optional - add where you want) -->
<%- include('partials/notification-settings') %>
```

**Where to add the component:**
Find a good spot in your dashboard layout (maybe in a settings section or sidebar).

---

### Step 4: Test Locally First

Before deploying, test everything locally:

```bash
# 1. Start server
npm run dev

# 2. Open browser
http://localhost:3005

# 3. Login as admin
Go to: /admin/notifications

# 4. Test notification
Click "টেস্ট" button

# 5. Login as student
Enable notifications from dashboard

# 6. Send notification from admin panel
```

---

### Step 5: Deploy to Production

```bash
# If using Vercel
vercel --prod

# If using Render
# Just push to GitHub - auto-deploys
git push origin main
```

---

## 🎯 HOW IT WORKS - Complete Flow

### For Students:

1. **First Time:**
   - Student logs in
   - Sees notification settings card
   - Clicks toggle to enable
   - Browser asks for permission
   - Student clicks "Allow"
   - ✅ Subscribed!

2. **Receiving Notifications:**
   - Admin sends notification
   - Student gets notification (even if browser is closed!)
   - Student clicks notification
   - Opens the linked page

### For Admins:

1. **Sending Notifications:**
   - Login as admin
   - Go to `/admin/notifications`
   - Select target (user/role/class/all)
   - Write title and message
   - Choose type and priority
   - Click "নোটিফিকেশন পাঠান"
   - ✅ Sent!

2. **View Analytics:**
   - See statistics on the same page
   - Total sent, success rate, click rate
   - View notification logs

---

## 🔍 HOW TO USE - Practical Examples

### Example 1: Announce New Course

```
Target: সব স্টুডেন্ট (Role: student)
Title: নতুন কোর্স যুক্ত হয়েছে!
Message: গণিত - ত্রিকোণমিতি কোর্স এখন উপলব্ধ
Type: কোর্স
URL: /courses
Priority: Normal
```

### Example 2: Exam Reminder

```
Target: ক্লাস অনুযায়ী (Class 10)
Title: পরীক্ষার সময়সূচী
Message: আগামীকাল সকাল ১০টায় গণিত পরীক্ষা
Type: পরীক্ষা
URL: /exams
Priority: High
```

### Example 3: Individual Message

```
Target: নির্দিষ্ট ইউজার (User ID: 65abc123...)
Title: আপনার রিপোর্ট কার্ড প্রস্তুত
Message: আপনার মাসিক রিপোর্ট কার্ড দেখুন
Type: অর্জন
URL: /profile/report-card
Priority: Normal
```

### Example 4: System Announcement

```
Target: সবাইকে (All users)
Title: সিস্টেম মেইনটেন্যান্স
Message: আগামীকাল রাত ১২টা থেকে ২টা পর্যন্ত সিস্টেম বন্ধ থাকবে
Type: সিস্টেম
URL: /
Priority: Urgent
```

---

## 🤖 AUTOMATIC NOTIFICATIONS (Advanced)

You can trigger notifications automatically from your code:

### When New Course is Added:

**File:** `server/server.js` (in your course creation route)

```javascript
const pushNotificationService = require('./services/pushNotificationService');

app.post('/admin/add-course', adminProtect, async (req, res) => {
    // ... your existing course creation code ...
    
    // Send notification to all students
    await pushNotificationService.sendToRole('student', {
        title: 'নতুন কোর্স যুক্ত হয়েছে!',
        body: `${courseName} কোর্স এখন উপলব্ধ`,
        url: `/courses/${newCourse._id}`,
        type: 'course',
        priority: 'normal'
    });
    
    res.redirect('/admin/courses');
});
```

### When Exam is Scheduled:

```javascript
app.post('/admin/add-quiz', adminProtect, async (req, res) => {
    // ... create quiz ...
    
    // Notify students in that class
    await pushNotificationService.sendToClassLevel(quiz.classLevel, {
        title: 'নতুন পরীক্ষা শিডিউল',
        body: `${quiz.title} - ${quiz.subject}`,
        url: `/exams`,
        type: 'exam',
        priority: 'high'
    });
    
    res.redirect('/admin/quizzes');
});
```

### When Assignment Deadline Approaches:

```javascript
// Create a cron job or scheduled task
const sendDeadlineReminders = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const assignments = await Assignment.find({
        deadline: { $lte: tomorrow },
        notificationSent: false
    });
    
    for (const assignment of assignments) {
        await pushNotificationService.sendToClassLevel(assignment.classLevel, {
            title: 'অ্যাসাইনমেন্ট ডেডলাইন আগামীকাল!',
            body: `${assignment.title} জমা দিতে ভুলবেন না`,
            url: `/assignments/${assignment._id}`,
            type: 'reminder',
            priority: 'high'
        });
        
        assignment.notificationSent = true;
        await assignment.save();
    }
};
```

---

## 🐛 TROUBLESHOOTING

### Issue 1: "Push notifications not configured"
**Cause:** VAPID keys not in environment
**Solution:** 
1. Check `.env` file has VAPID keys
2. Restart server: `npm run dev`
3. For production: Add to Vercel/Render environment variables

### Issue 2: Notifications not appearing
**Cause:** Browser permission denied or not supported
**Solution:**
1. Check browser notification settings
2. Clear browser cache
3. Try different browser (Chrome recommended)
4. Check browser console for errors

### Issue 3: Service Worker not registering
**Cause:** HTTPS required in production
**Solution:**
1. Ensure production uses HTTPS (Vercel/Render do this automatically)
2. Clear browser cache
3. Check DevTools → Application → Service Workers

### Issue 4: "No active subscriptions"
**Cause:** No users have enabled notifications yet
**Solution:**
1. Login as student
2. Enable notifications from dashboard
3. Try sending again

---

## 📊 MONITORING & ANALYTICS

### View Statistics:
- **Admin Panel:** `/admin/notifications`
- **API:** `GET /api/push/stats`

### What's Tracked:
- Total notifications sent
- Successful deliveries
- Failed deliveries
- Click-through rate
- Active device count
- Notification type breakdown

### View Logs:
- **Admin Panel:** Scroll down on `/admin/notifications`
- **API:** `GET /api/push/logs?page=1&limit=20`

---

## 🔐 SECURITY NOTES

### ⚠️ IMPORTANT:
1. **Never commit VAPID_PRIVATE_KEY to GitHub**
   - Already in `.gitignore` via `.env`
   - Only add to production environment variables

2. **Role-Based Access:**
   - Only admins can send notifications
   - Only super admins can broadcast to all
   - Students can only manage their own subscriptions

3. **Validation:**
   - All inputs are validated
   - URLs are sanitized
   - User permissions checked

---

## 🎯 NEXT STEPS - Recommended Order

### Immediate (Do Now):
1. ✅ Add VAPID keys to production environment
2. ✅ Test locally (`npm run dev`)
3. ✅ Deploy to production
4. ✅ Test on production

### Short Term (This Week):
1. 📸 Create notification icons
2. 🎨 Add notification settings to student dashboard
3. 🧪 Test with real users
4. 📊 Monitor analytics

### Medium Term (This Month):
1. 🤖 Add automatic notifications for:
   - New course published
   - Exam scheduled
   - Assignment deadline
   - Achievement unlocked
2. 📧 Add email fallback for failed push
3. 🎨 Create notification templates
4. 📱 Test on mobile devices

### Long Term (Future):
1. 📅 Scheduled notifications
2. 🎯 A/B testing
3. 🖼️ Rich notifications with images
4. 🔘 Action buttons in notifications
5. 📊 Advanced analytics dashboard
6. 🌍 Multi-language support

---

## ✅ CHECKLIST - Before Going Live

- [ ] VAPID keys added to production environment
- [ ] Tested locally
- [ ] Deployed to production
- [ ] Tested on production
- [ ] Notification icons created (optional)
- [ ] Added to student dashboard
- [ ] Tested with real users
- [ ] Monitored analytics
- [ ] Documented for team

---

## 📞 SUPPORT

**If something doesn't work:**

1. **Check browser console** (F12 → Console)
2. **Check server logs** (terminal where server is running)
3. **Test with `/api/push/test`** endpoint
4. **Verify VAPID keys** are correct
5. **Check browser compatibility**

**Common Browser Issues:**
- Safari on iOS: Not supported (Apple limitation)
- Incognito mode: May not work
- Ad blockers: May block notifications

---

## 🎉 YOU'RE READY!

Everything is set up and ready to use. Just follow the manual steps above and you'll have a fully functional push notification system!

**Start with:** Testing locally → Deploy → Add to production environment → Test live

**Questions?** Check the documentation files:
- `PUSH_NOTIFICATIONS_BANGLA.md` - বাংলা গাইড
- `PUSH_NOTIFICATIONS.md` - Full documentation
- `PUSH_NOTIFICATIONS_QUICKSTART.md` - Quick start

---

**Created by:** Antigravity AI  
**Date:** January 31, 2026  
**Status:** ✅ Ready for Production
