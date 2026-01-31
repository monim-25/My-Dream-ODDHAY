# 🚀 Quick Start Guide - Push Notifications

## ✅ What's Been Implemented

Your ODDHAY platform now has a **complete push notification system**!

### Features:
1. ✅ Browser push notifications (Web Push API)
2. ✅ Admin panel to send notifications
3. ✅ Student notification settings
4. ✅ Automatic subscription management
5. ✅ Analytics and logging
6. ✅ Multi-target sending (user, role, class, all)

---

## 🎯 How to Use

### For Admins:

1. **Access Admin Panel**
   - Login as admin/superadmin
   - Navigate to: `/admin/notifications`

2. **Send Notification**
   - Select target (specific user, role, class, or all)
   - Enter title and message
   - Choose notification type
   - Click "নোটিফিকেশন পাঠান"

3. **Test Notification**
   - Click "টেস্ট" button to send yourself a test notification

### For Students:

1. **Enable Notifications**
   - Go to your dashboard
   - Find the notification settings card
   - Toggle the switch to enable
   - Allow browser permission when prompted

2. **Receive Notifications**
   - You'll get notifications even when not on the site
   - Click notification to open the link

---

## 🔧 Testing Locally

### Step 1: Start the Server
```bash
npm run dev
```

### Step 2: Open Browser
Navigate to: `http://localhost:3005`

### Step 3: Login
- Login as a student or admin

### Step 4: Enable Notifications (as Student)
- Go to dashboard
- Enable notifications when prompted
- Allow browser permission

### Step 5: Send Test Notification (as Admin)
- Login as admin
- Go to `/admin/notifications`
- Click "টেস্ট" button
- Check your browser for notification

---

## 📱 Browser Requirements

**Supported:**
- ✅ Chrome/Edge (Desktop & Android)
- ✅ Firefox (Desktop & Android)
- ✅ Safari 16+ (macOS only)
- ✅ Opera

**Not Supported:**
- ❌ Safari on iOS (Apple limitation)
- ❌ Internet Explorer

---

## 🔐 Security

All VAPID keys are already configured in `.env`:
```
VAPID_PUBLIC_KEY=BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0
VAPID_PRIVATE_KEY=m6wqhB4H9nKQaGb84EJ7QSj-OQ8y30C89uSR_FKSxk8
VAPID_SUBJECT=mailto:admin@oddhay.com
```

⚠️ **Never share the private key publicly!**

---

## 🎨 Customization

### Change Notification Icon
Edit: `client/public/service-worker.js`
```javascript
icon: '/images/icon-192.png',  // Change this path
badge: '/images/badge-72.png'  // Change this path
```

### Add Automatic Notifications
Example: Send notification when new course is added

```javascript
// In your course creation route
await pushNotificationService.sendToRole('student', {
    title: 'নতুন কোর্স!',
    body: 'আপনার জন্য নতুন কোর্স যুক্ত হয়েছে',
    url: '/courses',
    type: 'course'
});
```

---

## 📊 Analytics

View notification statistics at:
- `/admin/notifications` (Admin panel)
- API: `GET /api/push/stats`

Tracks:
- Total sent
- Success rate
- Click-through rate
- Active devices

---

## 🐛 Troubleshooting

### "Push notifications not configured"
**Solution:** Restart the server after adding VAPID keys to `.env`

### Notifications not appearing
**Solutions:**
1. Check browser notification permissions
2. Ensure browser supports push notifications
3. Check browser's Do Not Disturb mode
4. Open DevTools → Console for errors

### Service Worker not registering
**Solutions:**
1. Clear browser cache
2. Check DevTools → Application → Service Workers
3. Ensure `/service-worker.js` is accessible

---

## 🎯 Next Steps

1. **Test the system**
   - Send test notifications
   - Check analytics
   - Test on different browsers

2. **Add automatic triggers**
   - New course published
   - Exam scheduled
   - Assignment due
   - Achievement unlocked

3. **Customize notifications**
   - Add images
   - Add action buttons
   - Create templates

---

## 📚 Full Documentation

See `PUSH_NOTIFICATIONS.md` for complete documentation.

---

**Status**: ✅ Ready to Use!

**Need Help?** Check the browser console and server logs for debugging.
