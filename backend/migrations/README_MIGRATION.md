# Database Migration: Add promptText Field

## Purpose
This migration adds a `promptText` field to the `experiences` table. This field stores pre-formatted text for AI prompts, optimizing performance by avoiding runtime generation during Hume EVI interviews.

## Files
- `add_prompt_text_field.sql` - SQL migration to add the column
- `populate_prompt_text.js` - Script to populate existing records with promptText

## Steps to Apply Migration

### 1. Apply SQL Migration to Supabase

#### Option A: Using Supabase Dashboard (Recommended)
1. Go to your Supabase Dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `add_prompt_text_field.sql`
4. Paste and run the SQL in the editor
5. Verify the column was added by checking the table schema

#### Option B: Using Supabase CLI
```bash
# Make sure you're connected to your Supabase project
supabase db push add_prompt_text_field.sql
```

#### Option C: Using psql
```bash
# Connect to your database
psql $DATABASE_URL < add_prompt_text_field.sql
```

### 2. Update Prisma Schema
The schema has already been updated with the promptText field:
```prisma
promptText     String?   @db.Text  // Pre-formatted text for AI prompts
```

### 3. Regenerate Prisma Client
```bash
cd backend
npx prisma generate
```

### 4. Populate Existing Records
After the migration is applied, run the population script:
```bash
cd backend
node migrations/populate_prompt_text.js
```

This will:
- Find all experiences without promptText
- Generate promptText for each experience
- Update the database records

## Verification

### Check in Supabase Dashboard:
1. Go to Table Editor
2. Open the `experiences` table
3. Verify the `promptText` column exists
4. Check that existing records have populated promptText values

### Check via SQL:
```sql
-- Check if column exists
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'experiences'
AND column_name = 'promptText';

-- Check populated values
SELECT id, "jobTitle", company,
       CASE
         WHEN "promptText" IS NOT NULL THEN 'Populated'
         ELSE 'Empty'
       END as prompt_status
FROM experiences
LIMIT 10;
```

## Rollback (if needed)
To remove the promptText field:
```sql
ALTER TABLE experiences DROP COLUMN IF EXISTS "promptText";
```

## Notes
- The promptText field is nullable, so existing records won't break
- The field uses TEXT type for unlimited length
- Generation includes: job title, company, dates, location, responsibilities, achievements, and skills
- Text is sanitized for AI consumption (escaped quotes, no HTML, etc.)