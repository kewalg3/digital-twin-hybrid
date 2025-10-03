-- Migration: Add promptText field to experiences table
-- Date: 2025-09-29
-- Purpose: Add pre-formatted prompt text field for AI interviews

-- Add the promptText column to experiences table
ALTER TABLE experiences
ADD COLUMN IF NOT EXISTS "promptText" TEXT;

-- Optional: Add comment to document the field's purpose
COMMENT ON COLUMN experiences."promptText" IS 'Pre-formatted text for AI prompts - contains sanitized and structured experience data for direct use in Hume EVI interviews';

-- Optional: Update existing records with generated promptText
-- This will be handled by a separate script after migration