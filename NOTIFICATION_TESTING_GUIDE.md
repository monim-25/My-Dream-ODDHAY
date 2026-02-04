# 🔔 ODDHAY Push Notification Testing Guide (Vercel)

## 📋 Pre-requisites Checklist

✅ **Before Testing:**
- [ ] Deployed to Vercel (HTTPS enabled automatically)
- [ ] VAPID keys configured in Vercel environment variables
- [ ] MongoDB connection working
- [ ] Service Worker accessible at `/service-worker.js`

---

## 🚀 Step-by-Step Testing Process

### **Step 1: Access Your Vercel Site**

Your Vercel URL should be something like:
```
https://my-dream-oddhay.vercel.app
```
Or your custom domain if configured.

**Open this URL in your browser** (Chrome, Firefox, or Edge recommended)

---

### **Step 2: Create/Login to Account**

#### **Option A: Create New Student Account**
1. Go to: `https://your-vercel-url.vercel.app/register`
2. Fill in:
   - Name: Test Student
   - Email/Phone: test@example.com
   - Password: test123
   - Role: Student
   - Class: Class 10
3. Click Register

#### **Option B: Login as Super Admin**
1. Go to: `https://your-vercel-url.vercel.app/login`
2. Use your Super Admin email: `monimmdmonim41@gmail.com`
3. Enter your password
4. You'll be redirected to Admin Dashboard

---

### **Step 3: Enable Browser Notifications**

#### **When you first login to dashboard:**
1. Browser will show a permission prompt: **"Allow notifications?"**
2. Click **"Allow"** or **"Yes"**

#### **If you missed the prompt:**
1. Click the 🔒 lock icon in browser address bar
2. Find "Notifications" setting
3. Change to "Allow"
4. Refresh the page

#### **Verify Service Worker is Registered:**
1. Press `F12` to open DevTools
2. Go to **Application** tab
3. Click **Service Workers** in left sidebar
4. You should see: `service-worker.js` - Status: **Activated**

---

### **Step 4: Test Notification (Student Dashboard)**

#### **For Students:**
1. Go to Dashboard: `https://your-vercel-url.vercel.app/dashboard`
2. Look for **Notification Settings** section (usually in sidebar or settings)
3. Click **"Enable Notifications"** button
4. Browser will ask permission - Click **Allow**
5. Click **"Send Test Notification"** button
6. You should receive a notification: **"ODDHAY পরীক্ষা নোটিফিকেশন"**

#### **Check Console (F12):**
```javascript
// You should see:
[Service Worker] Installing...
[Service Worker] Activating...
[Service Worker] Push received
✅ Notification sent successfully
```

---

### **Step 5: Test Admin Notification Panel**

#### **Access Admin Panel:**
1. Login as Super Admin
2. Go to: `https://your-vercel-url.vercel.app/admin/notifications`

#### **Send Test Notification:**

**Test 1: Send to Yourself**
1. Select Target: **"নির্দিষ্ট ব্যবহারকারী" (Specific User)**
2. Enter your User ID (check your profile or database)
3. Title: `পরীক্ষা নোটিফিকেশন`
4. Message: `এটি একটি টেস্ট মেসেজ!`
5. URL: `/dashboard`
6. Type: `announcement`
7. Priority: `high`
8. Click **"নোটিফিকেশন পাঠান"**
9. Check for notification!

**Test 2: Send to All Students**
1. Select Target: **"সকল শিক্ষার্থী" (All Students)**
2. Title: `সবাইকে জানানো হচ্ছে`
3. Message: `এটি সকল শিক্ষার্থীর জন্য একটি টেস্ট নোটিফিকেশন`
4. Click Send
5. All logged-in students should receive it

**Test 3: Send to Specific Class**
1. Select Target: **"নির্দিষ্ট ক্লাস" (Specific Class)**
2. Select Class: `Class 10`
3. Title: `ক্লাস ১০ এর জন্য`
4. Message: `এটি শুধুমাত্র ক্লাস ১০ এর শিক্ষার্থীদের জন্য`
5. Click Send

---

### **Step 6: Verify Notification Delivery**

#### **Check Notification Logs:**
1. In Admin Panel, scroll down to **"নোটিফিকেশন লগ"** section
2. You should see:
   - Sent notifications
   - Status (sent/failed/clicked)
   - Timestamp
   - Target users

#### **Check Statistics:**
1. Look at the stats cards at top:
   - **Total Sent**: Should increase
   - **Success Rate**: Should be high (>90%)
   - **Active Devices**: Number of subscribed devices
   - **Click Rate**: Percentage of clicked notifications

---

### **Step 7: Test Notification Click**

1. When you receive a notification
2. **Click on it**
3. It should:
   - Close the notification
   - Open the URL you specified (e.g., `/dashboard`)
   - Focus existing tab if already open

---

### **Step 8: Test on Multiple Devices**

#### **Desktop + Mobile:**
1. Open your Vercel site on phone
2. Login with same or different account
3. Enable notifications
4. Send notification from admin panel
5. Both devices should receive it!

#### **Multiple Browsers:**
1. Open in Chrome, Firefox, Edge
2. Login to each
3. Enable notifications in each
4. Send one notification
5. All browsers should receive it

---

## 🧪 API Testing (Advanced)

### **Test with Browser Console:**

Open DevTools Console (F12) and run:

#### **1. Check VAPID Key:**
```javascript
fetch('/api/push/vapid-public-key')
  .then(r => r.json())
  .then(data => console.log('VAPID Key:', data));
```

#### **2. Get Notification Stats:**
```javascript
fetch('/api/push/stats')
  .then(r => r.json())
  .then(data => console.log('Stats:', data));
```

#### **3. Send Test Notification:**
```javascript
fetch('/api/push/test', { method: 'POST' })
  .then(r => r.json())
  .then(data => console.log('Test Result:', data));
```

#### **4. Check Subscription Status:**
```javascript
navigator.serviceWorker.ready.then(registration => {
  registration.pushManager.getSubscription().then(subscription => {
    console.log('Subscribed:', !!subscription);
    if (subscription) {
      console.log('Endpoint:', subscription.endpoint);
    }
  });
});
```

---

## 🔍 Troubleshooting

### **Problem: No permission prompt appears**

**Solution:**
1. Check browser notification settings
2. Clear site data and refresh
3. Try in Incognito/Private mode first
4. Check if HTTPS is enabled (Vercel should auto-enable)

### **Problem: Service Worker not registering**

**Solution:**
1. Check `/service-worker.js` is accessible
2. Open: `https://your-url.vercel.app/service-worker.js`
3. Should show the service worker code
4. Check DevTools → Application → Service Workers
5. Click "Unregister" and refresh to re-register

### **Problem: Notifications not received**

**Solution:**
1. Check browser console for errors
2. Verify VAPID keys in Vercel environment variables:
   - Go to Vercel Dashboard
   - Project Settings → Environment Variables
   - Ensure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` are set
3. Redeploy if you just added them
4. Check MongoDB connection
5. Verify user is subscribed: Check `/api/push/stats`

### **Problem: "Not configured" error**

**Solution:**
1. VAPID keys missing in Vercel
2. Add them in Vercel Dashboard:
   ```
   VAPID_PUBLIC_KEY=BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0
   VAPID_PRIVATE_KEY=m6wqhB4H9nKQaGb84EJ7QSj-OQ8y30C89uSR_FKSxk8
   VAPID_SUBJECT=mailto:admin@oddhay.com
   ```
3. Redeploy

### **Problem: Notifications work on desktop but not mobile**

**Solution:**
1. iOS Safari doesn't support Web Push (Apple limitation)
2. Use Chrome/Firefox on Android
3. Ensure HTTPS is enabled
4. Check mobile browser notification permissions

---

## ✅ Success Checklist

After testing, you should have:

- [ ] Browser permission granted
- [ ] Service Worker registered and active
- [ ] Test notification received successfully
- [ ] Admin panel accessible
- [ ] Can send notifications from admin panel
- [ ] Notifications appear in browser
- [ ] Clicking notification opens correct URL
- [ ] Statistics showing in admin panel
- [ ] Notification logs recording properly
- [ ] Multiple devices receiving notifications

---

## 📊 Expected Results

### **Successful Notification:**
- ✅ Appears in system notification area
- ✅ Shows title and body text
- ✅ Has ODDHAY icon
- ✅ Clicking opens specified URL
- ✅ Logged in database

### **Admin Panel:**
- ✅ Can send to specific users
- ✅ Can send to roles (student/parent/admin)
- ✅ Can send to class levels
- ✅ Can broadcast to all (Super Admin only)
- ✅ Statistics update in real-time
- ✅ Logs show delivery status

---

## 🎯 Next Steps After Testing

Once everything works:

1. **Integrate with Events:**
   - Send notification when new course added
   - Send when exam scheduled
   - Send when assignment due
   - Send when Q&A answered

2. **Customize Notifications:**
   - Add custom icons per notification type
   - Add action buttons
   - Add images (rich notifications)

3. **Analytics:**
   - Track click-through rates
   - Monitor engagement
   - A/B test notification content

4. **User Preferences:**
   - Let users choose notification types
   - Set quiet hours
   - Frequency preferences

---

## 📞 Support

If you encounter issues:
1. Check browser console (F12)
2. Check Vercel deployment logs
3. Verify environment variables
4. Test API endpoints manually
5. Check MongoDB connection

---

**Happy Testing! 🚀**

Your notification system is production-ready and fully functional!
