# GitHub Setup Instructions

## Step 1: Create GitHub Repository
1. Go to https://github.com
2. Click "+" → "New repository"
3. Repository name: `digital-twin-hybrid`
4. Make it **Private**
5. **DO NOT** check any initialization options
6. Click "Create repository"

## Step 2: Connect Your Local Repository
After creating the repository, run these commands:

```bash
# Add GitHub as remote origin (replace with YOUR repository URL)
git remote add origin https://github.com/YOUR_USERNAME/digital-twin-hybrid.git

# Push main branch
git push -u origin main

# Push develop branch
git push -u origin develop
```

## Step 3: Set Default Branch
1. Go to your repository on GitHub
2. Settings → Branches
3. Change default branch to `main`

## Step 4: Protect Main Branch (Optional but Recommended)
1. Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - Require pull request before merging
   - Require branches to be up to date

## Your Repository Structure:
- `main` branch: Production-ready code
- `develop` branch: Development work

## Workflow After Setup:
1. Work on `develop` branch
2. Test thoroughly
3. Merge to `main` when ready for production
4. Vercel and Railway will auto-deploy from `main`

## Next Steps:
After GitHub setup is complete, we'll connect:
- Vercel to deploy frontend automatically
- Railway to deploy backend automatically