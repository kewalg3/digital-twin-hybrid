# Development Workflow Guide

## Quick Start for Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Development Database
Follow instructions in `DEVELOPMENT_DATABASE_SETUP.md` to create your dev database, then:
```bash
npm run setup:dev-db
```

### 3. Start Development Servers
```bash
npm run dev:all
```
This starts both:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Available Commands

### Development
- `npm run dev` - Start frontend only
- `npm run dev:backend` - Start backend only
- `npm run dev:all` - Start both frontend and backend

### Database
- `npm run setup:dev-db` - Push schema to development database
- `cd backend && npm run db:studio` - Open Prisma Studio

### Deployment
- `npm run deploy:dev` - Push to develop branch
- `npm run deploy:prod` - Merge develop to main and push

## Environment Files

### Frontend
- `.env.local` - Local development (uses localhost:3001)
- `.env.production` - Production (uses Railway backend)

### Backend
- `backend/.env.development` - Local development database
- `backend/.env.production` - Production database

## Git Workflow

1. **Always work on `develop` branch**
```bash
git checkout develop
```

2. **Make your changes and test locally**
```bash
npm run dev:all
# Test your changes
```

3. **Commit and push to develop**
```bash
git add .
git commit -m "Your change description"
npm run deploy:dev
```

4. **Deploy to production (after thorough testing)**
```bash
npm run deploy:prod
```

## Troubleshooting

### Frontend can't connect to backend
- Check `.env.local` exists and has `VITE_API_URL=http://localhost:3001/api`
- Ensure backend is running on port 3001

### Database connection issues
- Check `backend/.env.development` has correct DATABASE_URL
- Ensure PostgreSQL is running (local) or cloud DB is accessible

### Changes not showing in development
- Restart servers (Ctrl+C and run `npm run dev:all` again)
- Clear browser cache
- Check you're on develop branch

## Next Steps After Git Push

1. **Connect GitHub to Vercel** (see Phase 5 instructions)
2. **Connect GitHub to Railway** (see Phase 5 instructions)
3. **Set environment variables** in both platforms