# LiveKit Agent Deployment Guide

## Environment Variables

The following environment variables are required for the agent to function properly:

### Required Variables

#### LiveKit Configuration
```bash
LIVEKIT_URL=your-livekit-server-url
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

#### Backend API Configuration
```bash
# CRITICAL for production deployment!
# Must point to your backend service URL (not localhost)
# Example: https://your-backend-app.railway.app
BACKEND_URL=https://your-backend-service.railway.app
```

### Why BACKEND_URL is Critical

The agent fetches candidate profile data from the backend API to provide context-aware responses. Without this:
- The agent cannot access candidate information
- Tools like `getCandidateFacts` will fail
- The agent will respond with "I don't have that information"

## Railway Deployment

### Setting Environment Variables in Railway

1. Go to your Railway project dashboard
2. Select your agent service
3. Navigate to the "Variables" tab
4. Add all required environment variables:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `BACKEND_URL` (must be your backend service URL, e.g., `https://digital-twin-backend.railway.app`)

### Common Issues

#### Agent Not Using Context
**Symptom:** Agent says "I don't have that information" when asked about candidate details.

**Cause:** `BACKEND_URL` is not set or pointing to localhost.

**Solution:** Set `BACKEND_URL` to your production backend URL in Railway environment variables.

#### Connection Errors in Logs
Look for these error messages in logs:
```
❌ Backend connection failed - Check BACKEND_URL environment variable!
   BACKEND_URL: http://localhost:3001
```

This indicates the `BACKEND_URL` is not configured for production.

## Local Development

For local development, the agent defaults to `http://localhost:3001` if `BACKEND_URL` is not set. This works when both the agent and backend are running locally.

### Running Locally

#### Development Mode (with auto-reload)
```bash
# Backend (in backend directory)
npm run dev

# Agent (in livekit-agent directory) - auto-reloads on file changes
uv run python src/agent.py dev
```

**⚠️ Warning:** In `dev` mode, the agent auto-reloads when files change, causing it to restart and repeat its greeting. This disrupts active interviews.

#### Production Mode (no auto-reload)
For stable interviews during development, use `start` instead:
```bash
# Agent without auto-reload - stable for interviews
uv run python src/agent.py start
```

This prevents the agent from restarting mid-interview when files change.

## Dockerfile Configuration

The Dockerfile already includes proper environment variable handling. Just ensure you set them in your deployment platform.

## Verification

After deployment, verify the agent can access the backend:
1. Check agent logs for successful candidate data fetch messages
2. Test the agent by asking about candidate information
3. Confirm the agent provides context-aware responses

## Support

If issues persist after setting `BACKEND_URL`:
1. Verify the backend service is running and accessible
2. Check that the backend URL is correct (no trailing slashes)
3. Ensure the backend API endpoints match what the agent expects
4. Review agent logs for specific error messages