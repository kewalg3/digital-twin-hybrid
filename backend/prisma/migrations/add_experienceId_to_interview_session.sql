-- Add experienceId column to evi_interview_sessions table
ALTER TABLE "evi_interview_sessions" 
ADD COLUMN "experienceId" TEXT;

-- Add foreign key constraint
ALTER TABLE "evi_interview_sessions" 
ADD CONSTRAINT "evi_interview_sessions_experienceId_fkey" 
FOREIGN KEY ("experienceId") 
REFERENCES "experiences"("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- Create index for better query performance
CREATE INDEX "evi_interview_sessions_experienceId_idx" ON "evi_interview_sessions"("experienceId");