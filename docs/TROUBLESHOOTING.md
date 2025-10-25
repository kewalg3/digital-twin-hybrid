# LiveKit Integration Troubleshooting Guide

This guide covers common issues encountered during LiveKit integration setup and their solutions.

## Database Issues

### Issue: `Unknown argument userId. Did you mean user?`

**Error Message**:
```
PrismaClientValidationError: Unknown argument `userId`. Did you mean `user`?
```

**Cause**: Prisma schema mismatch when creating EVIInterviewSession records.

**Solution**:
Remove the redundant `userId` field from the `create()` operation in `/backend/src/routes/livekitRoutes.js`:

```javascript
// ❌ WRONG - Don't include both userId and user relationship
const interviewSession = await prisma.eVIInterviewSession.create({
  data: {
    id: sessionId,
    userId: userId,  // ← Remove this line
    user: {
      connect: { id: userId }  // ← Keep only this
    }
  }
});

// ✅ CORRECT - Use only the relationship
const interviewSession = await prisma.eVIInterviewSession.create({
  data: {
    id: sessionId,
    jobTitle: 'Profile Interview',
    company: 'Digital Twin Platform',
    fullTranscript: {},
    interviewType: 'profile',
    humeConfigId: roomName,
    user: {
      connect: { id: userId }
    }
  }
});
```

**File**: `/backend/src/routes/livekitRoutes.js:46-58`

## Python Agent Issues

### Issue: `spawn python ENOENT`

**Error Message**:
```
Error: spawn python ENOENT
```

**Cause**: System doesn't have `python` command, only `python3`.

**Solution**:
Update the agent dispatch service in `/backend/src/services/agentDispatchService.js`:

```javascript
// ❌ WRONG
const agentProcess = spawn('python', [agentFile], {

// ✅ CORRECT
const agentProcess = spawn('python3', [agentFile], {
```

**File**: `/backend/src/services/agentDispatchService.js:53`

### Issue: Python Dependencies Not Installed

**Error Message**:
```
ModuleNotFoundError: No module named 'livekit'
ImportError: cannot import name 'defineAgent'
```

**Cause**: Required Python packages not installed.

**Solution**:
```bash
cd backend/agents
pip3 install -r requirements.txt
```

**Verify Installation**:
```bash
python3 -c "
import livekit.agents
import requests
import dotenv
import aiohttp
print('All dependencies installed successfully')
"
```

### Issue: `cannot import name 'defineAgent' from 'livekit.agents'`

**Error Message**:
```
ImportError: cannot import name 'defineAgent' from 'livekit.agents'
```

**Cause**: Outdated LiveKit Agents API usage.

**Solution**:
The `defineAgent` function doesn't exist in the current LiveKit Agents API. Update the Python agent code to use the correct imports:

```python
# ❌ WRONG - Old API
from livekit.agents import defineAgent

# ✅ CORRECT - Current API
from livekit.agents import Worker, Agent, JobContext, RunContext
```

**Note**: The Python agent code needs to be updated to use the current LiveKit Agents framework API.

## Authentication Issues

### Issue: `Invalid token` or `Token expired`

**Error Message**:
```
{"error": "Invalid token"}
{"error": "Token expired"}
```

**Cause**: JWT token issues.

**Solutions**:

1. **Check JWT Secret**: Ensure `JWT_SECRET` environment variable matches between token generation and verification.

2. **Token Expiration**: Tokens expire after a set time. Generate a new token:
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com", "password": "password"}'
   ```

3. **Authorization Header**: Ensure correct format:
   ```javascript
   headers: {
     'Authorization': `Bearer ${token}`
   }
   ```

### Issue: `jwt malformed`

**Error Message**:
```
JsonWebTokenError: jwt malformed
```

**Cause**: Invalid JWT format or missing Bearer prefix.

**Solution**:
Check the authorization header format in frontend code:

```javascript
// ❌ WRONG
headers: {
  'Authorization': token
}

// ✅ CORRECT
headers: {
  'Authorization': `Bearer ${token}`
}
```

## LiveKit Connection Issues

### Issue: Rooms Not Appearing in LiveKit Dashboard

**Symptoms**:
- Backend logs show successful room creation
- No rooms visible in LiveKit Cloud Dashboard
- Agent dispatch succeeds but no activity

**Debugging Steps**:

1. **Check Environment Variables**:
   ```bash
   echo $LIVEKIT_URL
   echo $LIVEKIT_API_KEY
   echo $LIVEKIT_API_SECRET
   ```

2. **Verify LiveKit Cloud Connection**:
   - Login to https://cloud.livekit.io/
   - Check project settings match your environment variables
   - Verify API key permissions

3. **Test Room Creation**:
   ```bash
   curl -X POST http://localhost:3001/api/livekit/create-interview-room \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"userId": "test-user", "interviewType": "profile"}'
   ```

4. **Check Response**:
   - Look for `room.sid` in response (e.g., `"sid": "RM_abc123"`)
   - This confirms room was created in LiveKit Cloud

### Issue: WebRTC Connection Failures

**Symptoms**:
- Room exists but audio/video doesn't work
- Connection timeouts
- Media stream errors

**Solutions**:

1. **Check HTTPS**: LiveKit requires HTTPS in production
2. **Firewall/Network**: Ensure WebRTC ports are open
3. **Browser Permissions**: Allow microphone/camera access
4. **TURN Server**: May be needed for restrictive networks

## Package Dependency Issues

### Issue: `Failed to resolve import 'livekit-client'`

**Error Message**:
```
Failed to resolve import 'livekit-client' from src/components/LiveKitProfileInterviewDialog.tsx
```

**Cause**: LiveKit client package not installed in frontend.

**Solution**:
```bash
# Install in frontend (root directory)
npm install livekit-client

# NOT in backend
cd backend && npm install livekit-client  # ❌ Wrong location
```

## API Response Issues

### Issue: 500 Internal Server Error

**Debugging Steps**:

1. **Check Backend Logs**: Look for error details in console
2. **Database Connection**: Verify PostgreSQL is running
3. **Environment Variables**: Ensure all required vars are set
4. **Prisma Client**: Try regenerating: `npx prisma generate`

### Issue: Agent Process Exits Immediately

**Error**: Agent starts but exits with code 1

**Debugging**:

1. **Check Python Dependencies**: Run manual import test
2. **Environment Variables**: Verify agent has access to required vars
3. **File Permissions**: Ensure `agent.py` is executable
4. **Python Path**: Verify Python can find installed packages

**Manual Agent Test**:
```bash
cd backend/agents
python3 agent.py
```

## Performance Issues

### Issue: Slow Room Creation

**Causes**:
- Database connection latency
- LiveKit API response times
- Python agent startup time

**Solutions**:
- Use connection pooling for database
- Implement agent pre-warming
- Add timeout handling

### Issue: Audio Quality Problems

**Causes**:
- Network bandwidth limitations
- Audio codec configuration
- Sample rate mismatches

**Solutions**:
- Configure appropriate audio quality settings
- Use adaptive bitrate
- Test on different network conditions

## Monitoring and Debugging

### Enable Debug Logging

Add to your environment:
```bash
DEBUG=livekit*
LOG_LEVEL=debug
```

### Check Agent Status

```bash
curl http://localhost:3001/api/livekit/agents/status
```

### Monitor Backend Logs

Look for these success indicators:
- `🚀 Creating LiveKit interview room`
- `✅ LiveKit room created`
- `🤖 Dispatching agent to room`
- `✅ Agent dispatched successfully`

### Common Log Patterns

**Successful Flow**:
```
🚀 Creating LiveKit interview room: { userId: 'xxx', interviewType: 'profile' }
✅ LiveKit room created: interview-profile-xxx-timestamp
🤖 Dispatching agent to room: interview-profile-xxx-timestamp
🐍 Starting Python agent process...
✅ Agent dispatched successfully: { roomName: 'xxx', userId: 'xxx', pid: 12345 }
```

**Failed Flow**:
```
🚀 Creating LiveKit interview room: { userId: 'xxx', interviewType: 'profile' }
✅ LiveKit room created: interview-profile-xxx-timestamp
❌ Error creating interview room: PrismaClientValidationError
```

## Quick Diagnosis Checklist

When facing issues, check these in order:

1. ✅ **Environment Variables Set**: All required vars in `.env` files
2. ✅ **Database Running**: PostgreSQL accessible
3. ✅ **Python Dependencies**: `pip3 install -r requirements.txt` completed
4. ✅ **LiveKit Credentials**: Valid API key/secret
5. ✅ **Authentication**: Valid JWT token with correct format
6. ✅ **Network Access**: Can reach LiveKit Cloud APIs
7. ✅ **File Permissions**: Python agent files are accessible

## Getting Help

If issues persist:

1. Check LiveKit documentation: https://docs.livekit.io/
2. Review Hume AI documentation: https://docs.hume.ai/
3. Check backend logs for specific error messages
4. Test components individually to isolate the issue
5. Verify all environment variables match expected format

## Recent Fixes Applied

These issues were resolved in the current implementation:

1. ✅ **Database Schema**: Fixed Prisma relationship usage
2. ✅ **Python Command**: Changed `python` to `python3`
3. ✅ **Dependencies**: Installed all required Python packages
4. ✅ **Authentication**: Fixed JWT token handling
5. ✅ **Room Creation**: Successfully creating LiveKit rooms
6. ✅ **Agent Dispatch**: Python processes start correctly

The core LiveKit integration is working. Only the Python agent code needs API updates.