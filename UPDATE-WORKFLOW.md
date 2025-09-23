# Update Workflow Guide - Digital Twin Platform

## 🔄 Overview
This guide covers how to update your deployed application, especially for frequent Hume prompt updates (every 1-2 days).

**Time Estimates:**
- Backend update: 2-3 minutes
- Frontend update: 3-4 minutes
- Both: 5-7 minutes total

## 🎯 Quick Update Commands

### Backend Update (Railway)
```bash
cd backend
railway up
```

### Frontend Update (Vercel)
```bash
# From root directory
vercel --prod
```

That's it! Your changes are live. ✅

## 📝 Common Update Scenarios

### 1. Updating Hume AI Prompts

**Location**: Backend files containing Hume prompts
- `/backend/src/services/eviInterviewService.js`
- `/backend/src/controllers/interviewController.js`

**Steps:**
1. Edit the prompt in your code editor
2. Save the file
3. Deploy:
```bash
cd backend
railway up
# Wait 2-3 minutes for deployment
```

### 2. Updating Frontend UI/Text
1. Make your changes
2. Test locally: `npm run dev`
3. Deploy:
```bash
vercel --prod
# Wait 3-4 minutes for deployment
```

### 3. Updating Both Frontend and Backend
```bash
# Deploy backend first
cd backend
railway up

# Then deploy frontend
cd ..
vercel --prod
```

## 🔍 Verifying Updates

### Check Backend Deployment
```bash
# View deployment logs
cd backend
railway logs

# Test health endpoint
curl https://your-backend.railway.app/health
```

### Check Frontend Deployment
```bash
# View deployment status
vercel ls

# Open in browser
vercel --prod && vercel open
```

## ⚡ Environment Variables

**Important**: Environment variables persist between deployments!

### View Current Variables
```bash
# Backend (Railway)
cd backend
railway variables

# Frontend (Vercel)
vercel env ls
```

### Update a Variable
```bash
# Backend
railway variables set VARIABLE_NAME="new-value"
railway up  # Redeploy to apply

# Frontend
vercel env rm VITE_API_URL production
vercel env add VITE_API_URL production
vercel --prod  # Redeploy to apply
```

## 🚨 Rollback Procedures

### Railway (Backend) Rollback
```bash
# View deployment history
railway deployments

# Rollback to previous deployment
# Railway automatically keeps previous deployments
# Go to Railway dashboard → Your project → Deployments → Rollback
```

### Vercel (Frontend) Rollback
```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote [deployment-url]

# Example:
vercel promote digital-twin-abc123.vercel.app
```

## 🛡️ Safe Update Practices

### 1. Test Locally First
```bash
# Frontend
npm run dev
# Visit http://localhost:8080

# Backend
cd backend
npm run dev
# Test endpoints with Postman/curl
```

### 2. Deploy to Preview First (Optional)
```bash
# Vercel preview deployment
vercel  # Without --prod flag

# Test at the preview URL before going to production
```

### 3. Monitor After Deployment
- Check error logs
- Test critical features
- Monitor user reports

## 📊 Monitoring Deployments

### Railway Logs
```bash
cd backend
railway logs --tail

# Filter logs
railway logs --filter "error"
```

### Vercel Logs
```bash
# View function logs
vercel logs

# View build logs
vercel inspect [deployment-id]
```

## 🔧 Troubleshooting Updates

### Problem: Deployment Succeeds but Changes Don't Show

**Backend:**
```bash
# Force redeploy
cd backend
railway up --force

# Clear any caches
railway run npm cache clean --force
railway up
```

**Frontend:**
```bash
# Clear Vercel cache and redeploy
vercel --prod --force

# Check browser cache
# Tell users to hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

### Problem: Deployment Fails

**Check logs immediately:**
```bash
# Backend
railway logs

# Frontend
vercel logs --error
```

**Common fixes:**
1. Missing dependency: Add to package.json
2. Build error: Fix locally first
3. Environment variable issue: Check all vars are set

## 📅 Update Schedule Best Practices

### Daily Updates (Hume Prompts)
1. **Morning Deploy** (Recommended)
   - Less traffic
   - Time to fix issues before peak hours
   - Deploy at 6-8 AM your timezone

2. **Test After Deploy**
   - Run through critical user flows
   - Check Hume interactions work correctly

### Weekly Updates (Features/Fixes)
1. **Tuesday/Wednesday Deploy**
   - Avoid Mondays (high traffic)
   - Avoid Fridays (weekend issues)

2. **Staged Rollout**
   - Deploy backend first
   - Monitor for 30 minutes
   - Deploy frontend

## 🎯 Quick Reference Card

```bash
# Update Everything
cd backend && railway up && cd .. && vercel --prod

# Just Backend
cd backend && railway up

# Just Frontend
vercel --prod

# Check Status
curl https://your-backend.railway.app/health

# View Logs
cd backend && railway logs  # Backend
vercel logs                 # Frontend

# Rollback if Needed
# Railway: Use dashboard
# Vercel: vercel promote [old-deployment]
```

## 💡 Pro Tips

1. **Set up aliases** for common commands:
```bash
# Add to ~/.bashrc or ~/.zshrc
alias deploy-backend="cd ~/digital-twin-hybrid/backend && railway up"
alias deploy-frontend="cd ~/digital-twin-hybrid && vercel --prod"
alias deploy-all="deploy-backend && deploy-frontend"
```

2. **Keep a deployment log**:
```bash
# Create a simple log
echo "$(date): Deployed Hume prompt update" >> deployments.log
```

3. **Use deployment notifications**:
- Railway and Vercel both support webhooks
- Set up Slack/Discord notifications for deployments

Remember: The beauty of CLI deployment is its simplicity. Just run the commands and your updates are live in minutes!