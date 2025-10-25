const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Only initialize LiveKit if environment variables are present
let agentDispatchClient;
let AccessToken;

if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    const livekitSdk = require('livekit-server-sdk');
    AccessToken = livekitSdk.AccessToken;
    const AgentDispatchClient = livekitSdk.AgentDispatchClient;

    agentDispatchClient = new AgentDispatchClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
    console.log('✅ LiveKit initialized for interviews');
} else {
    console.log('⚠️ LiveKit not configured - interview routes disabled');
}

/**
 * Start Interview - Creates room and dispatches agent
 * POST /api/interview/start
 */
router.post('/start', async (req, res) => {
    // Check if LiveKit is configured
    if (!agentDispatchClient || !AccessToken) {
        console.log('❌ LiveKit not ready:', {
            agentDispatchClient: agentDispatchClient ? 'Present' : 'Missing',
            AccessToken: AccessToken ? 'Present' : 'Missing'
        });
        return res.status(503).json({
            success: false,
            error: 'LiveKit service not configured'
        });
    }

    console.log('✅ LiveKit components ready:', {
        AccessTokenType: typeof AccessToken,
        isConstructor: AccessToken && typeof AccessToken === 'function'
    });

    try {
        const {
            candidateId,
            recruiterName,
            recruiterEmail,
            recruiterTitle,
            recruiterLinkedin,
            recruiterPhone,
            company,
            jobTitle,
            jobDescription
        } = req.body;

        // Debug log to see what backend received
        console.log('🔍 Backend received:', req.body);

        // Handle recruiter creation/update if recruiter info is provided
        let recruiterId = null;
        if (recruiterEmail) {
            try {
                // Create or update recruiter record
                const recruiter = await prisma.recruiter.upsert({
                    where: { email: recruiterEmail },
                    update: {
                        name: recruiterName || undefined,
                        title: recruiterTitle || undefined,
                        company: company || undefined,
                        linkedinUrl: recruiterLinkedin || undefined,
                        phone: recruiterPhone || undefined,
                        jobTitle: jobTitle || undefined,
                        jobDescription: jobDescription || undefined,
                        updatedAt: new Date()
                    },
                    create: {
                        email: recruiterEmail,
                        name: recruiterName || 'Unknown Recruiter',
                        title: recruiterTitle,
                        company: company,
                        linkedinUrl: recruiterLinkedin,
                        phone: recruiterPhone,
                        jobTitle: jobTitle,
                        jobDescription: jobDescription
                    }
                });
                recruiterId = recruiter.id;
                console.log('✅ Recruiter record created/updated:', recruiterId);
            } catch (error) {
                console.error('⚠️ Error handling recruiter record:', error);
                // Continue without recruiterId if there's an error
            }
        }

        // 1. Create unique room name
        const roomName = `interview-${candidateId}-${Date.now()}`;

        // Debug log to see metadata being sent
        console.log('📦 Metadata being sent:', {
            candidate_id: candidateId,
            recruiter_id: recruiterId,
            recruiter_name: recruiterName,
            recruiter_title: recruiterTitle,
            company: company,
            job_title: jobTitle,
            job_description: jobDescription
        });

        // 2. Dispatch agent with metadata (from docs: https://docs.livekit.io/agents/worker/agent-dispatch/#dispatch-via-api)
        // The metadata should be passed as a JSON string directly
        const dispatchMetadata = JSON.stringify({
            candidate_id: candidateId,
            recruiter_id: recruiterId,
            recruiter_name: recruiterName,
            recruiter_title: recruiterTitle,
            company: company,
            job_title: jobTitle,
            job_description: jobDescription
        });

        console.log('🚀 Dispatching agent with metadata:', dispatchMetadata);

        const dispatch = await agentDispatchClient.createDispatch(
            roomName,
            'my-agent', // Your agent name
            {
                metadata: dispatchMetadata  // Wrap in object as per LiveKit docs
            }
        );

        // 3. Create access token for recruiter (from docs: https://docs.livekit.io/home/server/access-tokens/)
        // Use recruiterId if available, otherwise use a unique identifier
        const identity = recruiterId
            ? `recruiter-${recruiterId}`
            : `recruiter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        console.log('🔑 Creating AccessToken with:', {
            apiKey: process.env.LIVEKIT_API_KEY ? 'Present' : 'Missing',
            apiSecret: process.env.LIVEKIT_API_SECRET ? 'Present' : 'Missing',
            identity: identity,
            recruiterName
        });

        const at = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: identity,
                name: recruiterName || 'Recruiter'
            }
        );

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true
        });

            const token = await at.toJwt();
        console.log('🎫 Generated token:', {
            tokenValue: typeof token === 'string' && token ? `${token.substring(0, 50)}...` : String(token),
            tokenType: typeof token,
            tokenLength: token ? token.length : 0
        });

        // 4. Return connection info
        const response = {
            success: true,
            roomName,
            token,
            dispatchId: dispatch.id,
            serverUrl: process.env.LIVEKIT_URL,
            recruiterId: recruiterId  // Include recruiterId for linking to completed interview
        };
        console.log('📤 Sending response:', {
            ...response,
            token: typeof response.token === 'string' && response.token ? `${response.token.substring(0, 50)}...` : String(response.token)
        });

        res.json(response);

    } catch (error) {
        console.error('Error starting interview:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;