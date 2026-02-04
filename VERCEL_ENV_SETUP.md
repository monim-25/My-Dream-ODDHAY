# 🔧 Vercel Environment Variables Setup Guide

## Step-by-Step Instructions:

### 1. Go to Vercel Dashboard
- Visit: https://vercel.com/dashboard
- Login with your account
- Select your ODDHAY project

### 2. Navigate to Settings
- Click on "Settings" tab
- Click on "Environment Variables" in left sidebar

### 3. Add/Update These Variables:

#### Database Configuration:
```
Name: MONGODB_URI
Value: mongodb+srv://monimmdmonim41_db_user:gSLd4eXrzdV8LzxO@mycluster.8b4gm2m.mongodb.net/oddhay?retryWrites=true&w=majority&appName=MyCluster
Environment: Production, Preview, Development (select all)
```

#### Server Configuration:
```
Name: PORT
Value: 3005
Environment: Production, Preview, Development
```

#### Admin Configuration:
```
Name: SUPER_ADMIN_EMAIL
Value: monimmdmonim41@gmail.com
Environment: Production, Preview, Development
```

#### Push Notification VAPID Keys:
```
Name: VAPID_PUBLIC_KEY
Value: BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0
Environment: Production, Preview, Development
```

```
Name: VAPID_PRIVATE_KEY
Value: m6wqhB4H9nKQaGb84EJ7QSj-OQ8y30C89uSR_FKSxk8
Environment: Production, Preview, Development
```

```
Name: VAPID_SUBJECT
Value: mailto:monimmdmonim41@gmail.com
Environment: Production, Preview, Development
```

### 4. Save All Variables

### 5. Redeploy Your Application
- Go to "Deployments" tab
- Click on the three dots (...) on latest deployment
- Click "Redeploy"
- Wait for deployment to complete

### 6. Verify Deployment
- Visit your Vercel URL
- Check: https://your-url.vercel.app/health
- Should show: "status": "ok", "db": "connected"

---

## ✅ Verification Checklist:

After redeployment, verify:
- [ ] Site loads without errors
- [ ] Can login/register
- [ ] Dashboard loads
- [ ] Service worker registers
- [ ] Notification permission can be requested
- [ ] Test notification works

---

## 🔍 How to Check if Variables are Set:

### Method 1: Health Check Endpoint
Visit: `https://your-url.vercel.app/health`

Should return:
```json
{
  "status": "ok",
  "env": "production",
  "db": "connected",
  "clientPath": "/var/task/client",
  "cwd": "/var/task"
}
```

### Method 2: VAPID Key Check
Visit: `https://your-url.vercel.app/api/push/vapid-public-key`

Should return:
```json
{
  "publicKey": "BB2rK9O78FpIiZ8pLfeM8ag0gIFN02ZdYcpBUNl0qk6nPOdkRxJeYr8PPTSWKWYaZY4jbxJAUtJrLdp7c6LqYh0"
}
```

If it returns empty or error, VAPID keys are not set properly.

---

## 🚨 Common Issues:

### Issue: "VAPID keys not configured"
**Solution:** Add all three VAPID variables and redeploy

### Issue: "MongoDB connection failed"
**Solution:** Check MONGODB_URI is correct and network access is allowed

### Issue: "Notifications not working"
**Solution:** 
1. Verify all VAPID variables are set
2. Ensure HTTPS is enabled (Vercel auto-enables)
3. Check browser console for errors
4. Grant notification permission

---

## 📞 Need Help?

If variables are not working:
1. Double-check spelling (case-sensitive)
2. Ensure no extra spaces in values
3. Select all environments (Production, Preview, Development)
4. Redeploy after adding variables
5. Clear browser cache and try again

---

**Last Updated:** 2026-02-04
**Your Email:** monimmdmonim41@gmail.com
**VAPID Subject:** mailto:monimmdmonim41@gmail.com ✅
