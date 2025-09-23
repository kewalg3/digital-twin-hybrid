# Digital Twin Platform - CLI Deployment Guide

## 🚀 Overview
This guide walks you through deploying the Digital Twin platform using CLI tools (no GitHub required). Total deployment time: **30-45 minutes**.

- **Frontend**: Vercel (React/Vite app)
- **Backend**: Railway (Node.js/Express API)
- **Database**: Supabase (PostgreSQL)

## 📋 Pre-Deployment Checklist

### 1. Required Accounts
- [ ] [Supabase](https://supabase.com) account (existing database)
- [ ] [Vercel](https://vercel.com) account (free tier is fine)
- [ ] [Railway](https://railway.app) account (free trial available)
- [ ] [OpenAI](https://platform.openai.com) API key
- [ ] [Hume AI](https://dev.hume.ai) API credentials
- [ ] AWS S3 credentials (for file uploads)

### 2. Local Prerequisites
- [ ] Node.js 16+ installed
- [ ] npm installed
- [ ] Git installed (for CLI tools only)

### 3. Build Verification
Run these commands to verify everything builds correctly:

```bash
# Test frontend build
npm install
npm run build

# Test backend build
cd backend
npm install
npx prisma generate
cd ..
```

If these commands succeed, you're ready to deploy! ✅

## 🛠️ Backend Deployment (Railway)

### Step 1: Install Railway CLI
```bash
# macOS/Linux
brew install railway

# Windows (via npm)
npm install -g @railway/cli

# Verify installation
railway --version
```

### Step 2: Login to Railway
```bash
railway login
# This opens your browser for authentication
```

### Step 3: Create and Deploy Backend
```bash
# Navigate to backend directory
cd backend

# Create new Railway project
railway init

# When prompted:
# - Choose "Empty Project"
# - Give it a name like "digital-twin-backend"

# Deploy the backend
railway up

# This will:
# - Upload your code
# - Install dependencies
# - Run prisma generate
# - Start your server
```

### Step 4: Add PostgreSQL Database
```bash
# Add Supabase DATABASE_URL
railway variables set DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT].supabase.co:5432/postgres"
```

**To get your Supabase DATABASE_URL:**
1. Go to Supabase Dashboard
2. Settings → Database
3. Connection string → URI
4. Copy the entire connection string

### Step 5: Add All Environment Variables
```bash
# Add each variable one by one
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set JWT_SECRET="your-super-secret-jwt-key-minimum-32-chars"
railway variables set FRONTEND_URL="https://your-app.vercel.app"

# AWS S3 (for file uploads)
railway variables set AWS_ACCESS_KEY_ID="your-key"
railway variables set AWS_SECRET_ACCESS_KEY="your-secret"
railway variables set AWS_REGION="us-east-1"
railway variables set AWS_S3_BUCKET="your-bucket"

# AI Services
railway variables set OPENAI_API_KEY="sk-your-key"
railway variables set HUME_API_KEY="your-hume-key"
railway variables set HUME_SECRET_KEY="your-hume-secret"
railway variables set HUME_CONFIG_ID="your-config-id"
railway variables set TEXTKERNEL_API_KEY="your-textkernel-key"
```

### Step 6: Redeploy with Variables
```bash
# Redeploy to apply environment variables
railway up

# Get your backend URL
railway domain
# You'll get something like: digital-twin-backend.up.railway.app
```

### Step 7: Run Database Migrations
```bash
# If you need to run Prisma migrations
railway run npx prisma db push
```

## 🎨 Frontend Deployment (Vercel)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel

# Verify installation
vercel --version
```

### Step 2: Deploy Frontend
```bash
# Go back to root directory
cd ..

# Deploy to Vercel
vercel

# When prompted, answer:
# ? Set up and deploy "~/digital-twin-hybrid"? [Y/n] Y
# ? Which scope do you want to deploy to? (your username)
# ? Link to existing project? [y/N] N
# ? What's your project's name? digital-twin-frontend
# ? In which directory is your code located? ./ (current directory)
# ? Want to modify these settings? [y/N] N
```

### Step 3: Add Environment Variables
```bash
# Add your backend URL (from Railway)
vercel env add VITE_API_URL

# When prompted:
# ? What's the value of VITE_API_URL? https://digital-twin-backend.up.railway.app/api
# ? Add VITE_API_URL to which Environments? Production, Preview, Development
```

### Step 4: Deploy to Production
```bash
# Deploy to production
vercel --prod

# Your frontend will be available at:
# https://digital-twin-frontend.vercel.app
```

## ✅ Post-Deployment Verification

### 1. Check Backend Health
```bash
curl https://your-backend.up.railway.app/health
# Should return: {"status":"OK",...}
```

### 2. Update CORS Settings
Go back to Railway and update FRONTEND_URL:
```bash
cd backend
railway variables set FRONTEND_URL="https://your-app.vercel.app"
railway up
```

### 3. Test the Application
1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Try registering a new user
3. Upload a test resume
4. Test voice interview features

## 🔧 Troubleshooting

### Backend Issues

**Problem: Database connection failed**
```bash
# Check your DATABASE_URL
railway variables

# Test connection
railway run npx prisma db push
```

**Problem: Build fails with Prisma error**
```bash
# Regenerate Prisma client
railway run npx prisma generate
railway up
```

**Problem: FFmpeg not found**
```bash
# Railway should auto-detect FFmpeg needs
# If not, add buildpack:
railway variables set NIXPACKS_PKGS="ffmpeg"
railway up
```

### Frontend Issues

**Problem: API calls failing (CORS)**
```bash
# Ensure backend FRONTEND_URL matches exactly
cd backend
railway variables set FRONTEND_URL="https://your-exact-vercel-url.vercel.app"
railway up
```

**Problem: Environment variables not working**
```bash
# Redeploy after adding variables
vercel env pull
vercel --prod
```

## 📱 Updating Your Deployment

See [UPDATE-WORKFLOW.md](./UPDATE-WORKFLOW.md) for detailed instructions on updating your deployment.

### Quick Update Commands:

**Backend Update:**
```bash
cd backend
railway up
```

**Frontend Update:**
```bash
vercel --prod
```

## 🆘 Getting Help

- **Railway Issues**: [Railway Docs](https://docs.railway.app)
- **Vercel Issues**: [Vercel Docs](https://vercel.com/docs)
- **Prisma Issues**: [Prisma Docs](https://www.prisma.io/docs)

## 🎉 Congratulations!

Your Digital Twin platform is now live! 

**Next Steps:**
1. Set up a custom domain (optional)
2. Configure monitoring/analytics
3. Set up error tracking (Sentry)
4. Review security settings

Remember to keep your environment variables secure and never commit them to version control!