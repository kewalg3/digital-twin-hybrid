# Development Database Setup Guide

Since PostgreSQL is not installed locally, here are your options:

## Option 1: Free Cloud Database (Recommended for Quick Setup)

### Supabase (Free Tier)
1. Go to https://supabase.com
2. Create a new project (free)
3. Get your database URL from Settings > Database
4. Update `backend/.env.development` with the new DATABASE_URL

### Neon (Free Tier)
1. Go to https://neon.tech
2. Create a new project (free)
3. Copy the connection string
4. Update `backend/.env.development` with the new DATABASE_URL

### Railway (Dev Database)
1. Go to https://railway.app
2. Create a new PostgreSQL service
3. Get the DATABASE_URL from the service
4. Update `backend/.env.development` with the new DATABASE_URL

## Option 2: Install PostgreSQL Locally

### Mac:
```bash
# Install Homebrew first if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL
brew install postgresql
brew services start postgresql
```

### After Installation:
```bash
# Create database
createdb digitaltwin_dev

# Update DATABASE_URL in backend/.env.development:
DATABASE_URL="postgresql://localhost:5432/digitaltwin_dev"
```

## Next Steps (After Database Setup):

1. Push schema to development database:
```bash
cd backend
NODE_ENV=development npx prisma db push
```

2. Test the connection:
```bash
NODE_ENV=development npx prisma studio
```

## Important Notes:
- Development database is separate from production
- Safe to delete/modify data without affecting live users
- Use same schema as production