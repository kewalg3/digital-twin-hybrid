# Deployment Platform Setup (Phase 5)

## Prerequisites
- GitHub repository created and code pushed
- Vercel account (https://vercel.com)
- Railway account (https://railway.app)

## Part 1: Vercel Setup (Frontend)

### 1. Import Project from GitHub
1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Import Git Repository
4. Select your `digital-twin-hybrid` repository

### 2. Configure Build Settings
- **Framework Preset**: Vite
- **Root Directory**: `.` (leave as is)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 3. Environment Variables
Add these in Vercel dashboard:
```
VITE_API_URL=https://digital-twin-backend-production.up.railway.app/api
```

### 4. Deployment Settings
- **Production Branch**: `main`
- **Preview Branches**: `develop`
- Enable "Automatically deploy on push"

### 5. Deploy
Click "Deploy" - Your frontend will be live!

## Part 2: Railway Setup (Backend)

### 1. Create New Project
1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `digital-twin-hybrid` repository

### 2. Configure Service
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run db:generate`
- **Start Command**: `npm start`

### 3. Environment Variables
Add ALL variables from `backend/.env.production`:
```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=...
OPENAI_API_KEY=...
HUME_API_KEY=...
HUME_SECRET_KEY=...
# ... add all other API keys and settings
```

### 4. Configure Domain
1. Go to Settings → Domains
2. Either use Railway's domain or add custom domain
3. Copy the domain URL

### 5. Update Frontend
After Railway provides your backend URL:
1. Update Vercel environment variable:
   ```
   VITE_API_URL=https://your-backend.railway.app/api
   ```
2. Redeploy frontend on Vercel

## Part 3: Post-Setup Tasks

### 1. Update CORS in Backend
Ensure your backend allows requests from Vercel domain:
```javascript
// In backend/src/app.js
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://your-app.vercel.app', // Add your Vercel domain
  ]
};
```

### 2. Test Everything
1. Visit your Vercel frontend URL
2. Test login/signup
3. Test API connections
4. Check browser console for errors

### 3. Set Up Webhooks (Optional)
Both platforms support deployment webhooks for Discord/Slack notifications

## Deployment Workflow After Setup

### Development Changes:
1. Push to `develop` branch
2. Preview deployments created automatically
3. Test on preview URLs

### Production Release:
1. Merge `develop` to `main`
2. Both platforms auto-deploy
3. Production sites update in ~2-3 minutes

## Troubleshooting

### Frontend shows API errors
- Check VITE_API_URL in Vercel settings
- Ensure it ends with `/api`
- Redeploy after changing env vars

### Backend not starting on Railway
- Check logs in Railway dashboard
- Verify all env variables are set
- Ensure DATABASE_URL is correct

### CORS errors
- Update backend CORS settings
- Include Vercel domain in allowed origins
- Redeploy backend