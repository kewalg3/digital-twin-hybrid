#!/bin/bash

echo "=== Setting up Development Database ==="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "PostgreSQL is not installed. Please install it first:"
    echo "Mac: brew install postgresql"
    echo "Ubuntu: sudo apt-get install postgresql"
    echo "Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

echo "✅ PostgreSQL is installed"
echo ""

# Create development database
echo "Creating development database..."
createdb digitaltwin_dev 2>/dev/null || echo "Database might already exist"

# Test connection
echo "Testing database connection..."
psql -U postgres -d digitaltwin_dev -c "SELECT 1;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful!"
else
    echo "❌ Database connection failed. Trying with default user..."
    psql -d digitaltwin_dev -c "SELECT 1;" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Database connection successful with default user!"
        echo ""
        echo "Update your .env.development file:"
        echo "DATABASE_URL=\"postgresql://$USER@localhost:5432/digitaltwin_dev\""
    else
        echo "❌ Could not connect to database. Please check your PostgreSQL setup."
        exit 1
    fi
fi

echo ""
echo "=== Next Steps ==="
echo "1. Update backend/.env.development with your DATABASE_URL"
echo "2. Run: cd backend && npx prisma db push"
echo "3. Your development database will be ready!"