# CLAUDE.md - Project Context

## Project Overview
Digital Twin Voice Interview Platform - A full-stack application that creates AI-powered voice replicas of job candidates for recruiters to interview.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, shadcn-ui, Tailwind CSS, Zustand
- **Backend**: Node.js, Express, PostgreSQL, Prisma ORM
- **AI Services**: OpenAI GPT-4, Hume.ai (voice), Text Kernel (resume parsing), LiveKit (real-time voice)

## Current Status
- Project structure is set up with frontend and backend directories
- Using shadcn-ui component library for modern UI
- Backend has authentication, file upload, and AI integration endpoints

## Recent Work
### Audio Streaming Fix for Hume EVI SDK (September 30, 2025)
- Fixed critical audio issues where AI couldn't hear user and stopped speaking midway
- Problem: Manual MediaRecorder implementation was conflicting with Hume SDK's internal audio handling
- Root Cause:
  - Incorrectly using `voiceClient.sendAudio()` with manual MediaRecorder chunks
  - SDK expects to handle audio streaming internally when initialized properly
- Solution:
  - Removed manual MediaRecorder implementation entirely
  - Pass media stream to VoiceClient during connection: `voiceClient.connect({ microphone: mediaStream })`
  - Let SDK handle all audio recording and streaming internally
  - Audio stream is now obtained before creating VoiceClient and passed during connection
- Files modified:
  - `/src/services/directHumeEVISDK.ts` - Removed MediaRecorder, fixed audio initialization flow
- This fix applies to all interview types (Experience Enhancement, Work Style, Career Goals)

### EVI Speech-to-Speech Interview Fix (August 25, 2025)
- Fixed issue where Complete Interview button wasn't working in Experience Enhancement tab
- Problem: The timeout handler was calling `completeInterview()` which didn't exist
- Solution: 
  - Changed to use `handleCompleteInterview()` 
  - Added state-based auto-completion trigger to handle scope issues
  - Added proper error handling for cases where interview is already ended
  - Added loading indicator on Complete Interview button
  - Auto-transition to completed stage after processing
  - Fixed transcript retrieval to use database instead of local state

### EVI Transcript and UX Improvements (August 25, 2025)
- Enhanced Complete Interview button with loading indicator ("Processing...")
- Added automatic transition to Key Achievements stage after completion
- Fixed transcript display to fetch complete conversation from database
- Added endpoint integration to retrieve full interview session data
- Improved error handling and user feedback throughout completion flow

- Files modified:
  - `/src/components/EVIInterviewDialog.tsx` - Enhanced UX, loading states, and database transcript fetch
  - `/src/services/directHumeEVISDK.ts` - Added logging for timeout messages
- Integration flow: ExperienceCard → EVIInterviewDialog → directHumeEVISDK → Backend EVI routes
- Database: All messages saved to `evi_interview_sessions` and `evi_interview_messages` tables
- Timeout behavior:
  - At 4 minutes: AI speaks warning message "We have about one minute left..."
  - At 5 minutes: AI speaks completion message "We've reached the end of our interview time..."
  - Added 3-second delay before auto-completion to ensure timeout audio plays fully

## Key Files & Directories
- `/src/components/ui/` - shadcn-ui components
- `/src/pages/` - Application pages
- `/backend/src/` - Backend API code
- `/backend/prisma/` - Database schema

## Environment Variables Needed
- Database URL
- JWT secret
- AWS S3 credentials
- API keys: OpenAI, Hume.ai, Text Kernel, LiveKit

## TODO / Next Steps
[To be updated based on current tasks]

## Notes
- This file helps maintain context between Claude sessions
- Update this file when making significant changes
- Include any important decisions or architectural choices