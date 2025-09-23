-- Add interviewType to EVIInterviewSession
ALTER TABLE "evi_interview_sessions" 
ADD COLUMN IF NOT EXISTS "interviewType" TEXT DEFAULT 'job_experience';

-- Create Recruiter table
CREATE TABLE IF NOT EXISTS "recruiters" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT,
    "title" TEXT,
    "company" TEXT,
    "linkedinUrl" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS "recruiters_email_key" ON "recruiters"("email");

-- Create RecruiterInterview join table
CREATE TABLE IF NOT EXISTS "recruiter_interviews" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "recruiterId" TEXT NOT NULL,
    "eviInterviewSessionId" TEXT NOT NULL,
    "position" TEXT,
    "jobDescription" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "recruiter_interviews_recruiterId_fkey" 
        FOREIGN KEY ("recruiterId") 
        REFERENCES "recruiters"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    
    CONSTRAINT "recruiter_interviews_eviInterviewSessionId_fkey" 
        FOREIGN KEY ("eviInterviewSessionId") 
        REFERENCES "evi_interview_sessions"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Create unique constraint on recruiterId and eviInterviewSessionId
CREATE UNIQUE INDEX IF NOT EXISTS "recruiter_interviews_recruiterId_eviInterviewSessionId_key" 
ON "recruiter_interviews"("recruiterId", "eviInterviewSessionId");