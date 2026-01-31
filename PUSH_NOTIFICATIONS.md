# 🔔 ODDHAY Push Notification System

## Overview
A comprehensive browser-based push notification system for ODDHAY educational platform using Web Push API.

## Features Implemented

### ✅ Core Functionality
- **Service Worker** for background notifications
- **Web Push API** integration with VAPID authentication
- **Subscription Management** (subscribe/unsubscribe)
- **Notification Logging** with analytics
- **Multi-target Sending**:
  - Send to specific user
  - Send to role (student/parent/admin)
  - Send to class level
  - Broadcast to all users (Super Admin only)

### ✅ Admin Features
- **Admin Dashboard** (`/admin/notifications`)
  - Send notifications with custom title, body, URL
  - Choose notification type (announcement, course, exam, etc.)
  - Set priority levels
  - Real-time statistics
  - Notification logs with pagination
- **Test Notification** functionality
- **Analytics Dashboard**:
  - Total notifications sent
  - Success rate
  - Click-through rate
  - Active device count

### ✅ Student Features
- **Notification Settings** component
- Enable/Disable notifications toggle
- Test notification button
- Automatic subscription management

## File Structure

```
oddhay/
├── client/
│   ├── public/
│   │   ├── service-worker.js              # Service worker for push notifications
│   │   └── js/
│   │       └── push-notifications.js      # Client-side notification manager
│   └── views/
│       ├── admin/
│       │   └── notifications.ejs          # Admin notification management page
│       └── partials/
│           └── notification-settings.ejs  # Student notification settings component
├── server/
│   ├── models/
│   │   ├── PushSubscription.js            # Subscription storage model
│   │   └── NotificationLog.js             # Notification history model
│   └── services/
│       └── pushNotificationService.js     # Core notification service
└── generate-vapid-keys.js                 # VAPID key generator script
```

## Setup Instructions

### 1. Install Dependencies
Already installed: `web-push`

### 2. Generate VAPID Keys (Already Done)
```bash
node generate-vapid-keys.js
```

Keys are already added to `.env`:
```
VAPID_PUBLIC_KEY=BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0
VAPID_PRIVATE_KEY=m6wqhB4H9nKQaGb84EJ7QSj-OQ8y30C89uSR_FKSxk8
VAPID_SUBJECT=mailto:admin@oddhay.com
```

### 3. Add Push Notification Script to Pages

Add to any page where you want notification functionality:

```html
<!-- In the <head> or before </body> -->
<script src="/js/push-notifications.js"></script>
```

The script auto-initializes and registers the service worker.

### 4. Include Notification Settings (For Student Dashboard)

```html
<%- include('partials/notification-settings') %>
```

## API Endpoints

### Public Endpoints
- `GET /api/push/vapid-public-key` - Get VAPID public key

### Protected Endpoints (Requires Login)
- `POST /api/push/subscribe` - Subscribe to notifications
- `POST /api/push/unsubscribe` - Unsubscribe from notifications
- `POST /api/push/test` - Send test notification to current user
- `GET /api/push/stats` - Get notification statistics

### Admin Endpoints
- `POST /api/push/send-to-user` - Send to specific user
- `POST /api/push/send-to-role` - Send to all users with a role
- `POST /api/push/send-to-class` - Send to all students in a class
- `GET /api/push/logs` - Get notification logs (paginated)

### Super Admin Endpoints
- `POST /api/push/send-to-all` - Broadcast to all users

## Usage Examples

### From Admin Panel
1. Navigate to `/admin/notifications`
2. Select target audience
3. Fill in notification details
4. Click "নোটিফিকেশন পাঠান"

### Programmatically (Server-side)

```javascript
const pushNotificationService = require('./services/pushNotificationService');

// Send to specific user
await pushNotificationService.sendToUser(userId, {
    title: 'নতুন কোর্স যুক্ত হয়েছে',
    body: 'আপনার জন্য নতুন কোর্স আপলোড করা হয়েছে!',
    url: '/courses/new-course-id',
    type: 'course',
    priority: 'high'
});

// Send to all students
await pushNotificationService.sendToRole('student', {
    title: 'পরীক্ষার সময়সূচী',
    body: 'আগামীকাল পরীক্ষা অনুষ্ঠিত হবে',
    url: '/exams',
    type: 'exam'
});

// Send to specific class
await pushNotificationService.sendToClassLevel('Class 10', {
    title: 'নতুন নোট আপলোড',
    body: 'গণিত বিষয়ের নতুন নোট পাওয়া যাচ্ছে',
    url: '/notes',
    type: 'course'
});
```

### From Client-side

```javascript
// Check if subscribed
const isSubscribed = await window.pushManager.isSubscribed();

// Subscribe
await window.pushManager.requestPermission();

// Unsubscribe
await window.pushManager.unsubscribe();

// Test notification
await fetch('/api/push/test', { method: 'POST' });
```

## Notification Types

- `announcement` - 📢 General announcements
- `course` - 📚 Course-related updates
- `exam` - 📝 Exam notifications
- `reminder` - ⏰ Reminders
- `achievement` - 🏆 Student achievements
- `system` - ⚙️ System messages
- `custom` - ✨ Custom notifications

## Priority Levels

- `low` - 🔵 Low priority
- `normal` - 🟢 Normal priority (default)
- `high` - 🟡 High priority
- `urgent` - 🔴 Urgent notifications

## Browser Compatibility

✅ Supported Browsers:
- Chrome 50+
- Firefox 44+
- Edge 17+
- Safari 16+ (macOS 13+)
- Opera 37+

❌ Not Supported:
- Internet Explorer
- Safari on iOS (Apple restrictions)

## Testing

### Test on Localhost
1. Start the server: `npm run dev`
2. Open browser and navigate to dashboard
3. Enable notifications when prompted
4. Go to `/admin/notifications`
5. Click "টেস্ট" button
6. Check for notification

### Test on Production
- Notifications require HTTPS (except localhost)
- Ensure VAPID keys are set in production environment variables
- Service worker must be served from root domain

## Automatic Notifications (Future Enhancement)

You can trigger notifications automatically on certain events:

```javascript
// Example: When new course is added
app.post('/admin/add-course', adminProtect, async (req, res) => {
    // ... create course ...
    
    // Send notification to all students
    await pushNotificationService.sendToRole('student', {
        title: 'নতুন কোর্স যুক্ত হয়েছে!',
        body: `${courseName} কোর্স এখন উপলব্ধ`,
        url: `/courses/${courseId}`,
        type: 'course',
        priority: 'normal'
    });
    
    res.redirect('/admin/courses');
});
```

## Analytics & Monitoring

The system tracks:
- Total notifications sent
- Successful deliveries
- Failed deliveries
- Click-through rate
- Active subscriptions per user
- Device types (mobile/desktop/tablet)

Access analytics:
- Admin: `/admin/notifications` (statistics cards)
- API: `GET /api/push/stats`

## Security Considerations

✅ Implemented:
- VAPID authentication
- User-specific subscriptions
- Role-based access control
- Secure endpoint validation

⚠️ Important:
- Keep `VAPID_PRIVATE_KEY` secret
- Never expose private key in client-side code
- Always validate user permissions before sending

## Troubleshooting

### Notifications not working?

1. **Check browser support**
   ```javascript
   if ('serviceWorker' in navigator && 'PushManager' in window) {
       console.log('Push notifications supported');
   }
   ```

2. **Check VAPID keys**
   - Ensure keys are in `.env`
   - Restart server after adding keys

3. **Check HTTPS**
   - Production requires HTTPS
   - Localhost works without HTTPS

4. **Check permissions**
   - Browser notification permission granted?
   - Check browser settings

5. **Check service worker**
   - Open DevTools → Application → Service Workers
   - Ensure service worker is registered

### Common Issues

**Issue**: "Push notifications not configured"
**Solution**: Add VAPID keys to `.env` and restart server

**Issue**: Subscription fails
**Solution**: Check browser console for errors, ensure HTTPS in production

**Issue**: Notifications not appearing
**Solution**: Check browser notification settings, ensure not in Do Not Disturb mode

## Next Steps & Enhancements

### Planned Features
- [ ] Scheduled notifications
- [ ] Rich notifications with images
- [ ] Action buttons in notifications
- [ ] Notification templates
- [ ] A/B testing for notifications
- [ ] Notification preferences per user
- [ ] Email fallback for failed push
- [ ] SMS integration
- [ ] Notification campaigns
- [ ] Advanced analytics dashboard

### Integration Ideas
- Send notification when:
  - New course is published
  - Exam is scheduled
  - Assignment deadline approaching
  - New message in Q&A
  - Achievement unlocked
  - Parent request received
  - Payment successful

## Support

For issues or questions:
- Check browser console for errors
- Review server logs
- Test with `/api/push/test` endpoint
- Verify VAPID keys are correct

---

**Status**: ✅ Fully Implemented & Ready to Use

**Last Updated**: 2026-01-31
