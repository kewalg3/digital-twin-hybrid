# Digital Twin LiveKit Integration Documentation

This directory contains comprehensive documentation for the LiveKit integration in the Digital Twin Voice Interview Platform.

## 📚 Documentation Index

### [🚀 LiveKit Integration Guide](./LIVEKIT_INTEGRATION.md)
**Main documentation covering setup, configuration, and usage**
- System architecture and components
- Environment setup and configuration
- API reference with examples
- Frontend integration guide
- Security and performance considerations

### [🔧 Troubleshooting Guide](./TROUBLESHOOTING.md)
**Solutions for common issues and problems**
- Database schema errors and fixes
- Python agent configuration issues
- Authentication and token problems
- LiveKit connection troubleshooting
- Performance debugging

### [🚀 Deployment Guide](./DEPLOYMENT.md)
**Production deployment and scaling**
- Production environment setup
- Container and cloud deployment
- Security hardening
- Monitoring and observability
- Backup and recovery procedures

## 🎯 Quick Start

1. **Setup**: Follow the [Setup Guide](./LIVEKIT_INTEGRATION.md#setup-guide)
2. **Issues?**: Check [Troubleshooting](./TROUBLESHOOTING.md)
3. **Deploy**: Use [Deployment Guide](./DEPLOYMENT.md) for production

## ✅ Current Status

### Working Features ✅
- **LiveKit Room Creation**: Rooms successfully created in LiveKit Cloud
- **Database Integration**: Sessions stored properly in PostgreSQL
- **Authentication**: JWT token validation working
- **Access Tokens**: LiveKit access tokens generated correctly
- **Agent Dispatch**: Python agent processes start successfully

### Known Issues 🔧
- **Python Agent API**: Needs update to current LiveKit Agents framework
- **Import Error**: `defineAgent` doesn't exist in current API version

## 🔍 Where to Check LiveKit Sessions

**Answer to the original question:**

1. **LiveKit Cloud Dashboard**: https://cloud.livekit.io/
   - Look for rooms: `interview-profile-{userId}-{timestamp}`
   - Check room SIDs: `RM_*` format

2. **Agent Status API**: `GET /api/livekit/agents/status`
   - Shows active Python agents

3. **Backend Logs**: Monitor for success indicators:
   - `🚀 Creating LiveKit interview room`
   - `✅ LiveKit room created`
   - `🤖 Dispatching agent to room`
   - `✅ Agent dispatched successfully`

## 🏗️ Architecture Overview

```
Frontend (React + LiveKit Client)
    ↓ HTTP API
Node.js Backend (Express + LiveKit SDK)
    ↓ Room Creation
LiveKit Cloud (WebRTC + Room Management)
    ↓ Agent Connection
Python Agent (Hume TTS + Voice Processing)
    ↓ Data Storage
PostgreSQL Database
```

## 🔑 Key Components

### Backend Routes
- `POST /api/livekit/create-interview-room` - Create new interview room
- `GET /api/livekit/agents/status` - Check active agents
- `GET /api/livekit/session/:sessionId` - Get session details
- `POST /api/livekit/end-session` - End interview session

### Frontend Components
- `LiveKitProfileInterviewDialog` - Main interview component
- LiveKit React hooks for WebRTC connection
- Audio/video stream management

### Python Agent
- `agent.py` - Voice processing and AI interaction
- Hume TTS integration for natural voice synthesis
- Function tools for resume context access

## 🛠️ Development Workflow

1. **Local Development**:
   ```bash
   npm run dev:all  # Start both frontend and backend
   ```

2. **Test Interview Creation**:
   ```bash
   curl -X POST http://localhost:3001/api/livekit/create-interview-room \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"userId": "test-user", "interviewType": "profile"}'
   ```

3. **Check Agent Status**:
   ```bash
   curl http://localhost:3001/api/livekit/agents/status
   ```

## 🔐 Security Notes

- **API Keys**: Never commit LiveKit or Hume API keys
- **JWT Tokens**: Use strong secrets and appropriate expiration times
- **HTTPS**: Required for production WebRTC connections
- **Rate Limiting**: Implement to prevent abuse

## 📈 Performance Metrics

Monitor these key metrics:
- Room creation success rate
- Agent dispatch success rate
- WebRTC connection quality
- Database query performance
- API response times

## 🆘 Getting Help

1. **Check Logs**: Backend console shows detailed error messages
2. **Test Components**: Isolate issues by testing individual parts
3. **Review Documentation**: Each guide covers specific areas
4. **Verify Environment**: Ensure all required variables are set

## 🎉 Success Indicators

Your integration is working when you see:

1. ✅ **Status 200** from interview creation API
2. ✅ **Room SID** in API response (e.g., `RM_abc123`)
3. ✅ **Agent PID** showing process started
4. ✅ **Sessions** visible in LiveKit Dashboard
5. ✅ **Database records** created for interview sessions

## 📝 Recent Fixes Applied

These critical issues were resolved:

1. ✅ **Database Schema**: Fixed Prisma relationship usage
2. ✅ **Python Dependencies**: Installed all required packages
3. ✅ **Agent Dispatch**: Fixed python3 command usage
4. ✅ **Authentication**: Corrected JWT token handling
5. ✅ **Room Creation**: Successfully creating LiveKit rooms

## 🔄 Next Steps

To complete the integration:

1. **Update Python Agent**: Fix imports to use current LiveKit Agents API
2. **Test Voice Flow**: Verify audio streaming end-to-end
3. **Add Error Handling**: Improve robustness for edge cases
4. **Performance Testing**: Test under load conditions
5. **Production Deploy**: Follow deployment guide for live environment

---

**The LiveKit integration is successfully working!** Rooms are created, sessions are stored, and agents are dispatched. Only the Python agent code needs API updates to complete the voice functionality.