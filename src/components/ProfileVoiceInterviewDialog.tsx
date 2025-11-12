// ============================================================================
// FILE: ProfileVoiceInterviewDialog.tsx
// ZERO HALLUCINATION PROFILE INTERVIEW - Complete Implementation
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, User, Volume2, StopCircle, ChevronDown, Building, Briefcase, AlertCircle } from "lucide-react";
import { directHumeEVI } from "@/services/directHumeEVISDK";
import type { EVISessionData, EVIMessage } from "@/services/directHumeEVISDK";

interface ProfileVoiceInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName?: string;
  recruiterName?: string;
  company?: string;
  position?: string;
  candidateData?: any;
}

type InterviewStage = 'initial' | 'loading_config' | 'ready' | 'recording' | 'saving' | 'processing' | 'brief';

export default function ProfileVoiceInterviewDialog({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  recruiterName,
  company,
  position,
  candidateData
}: ProfileVoiceInterviewDialogProps) {
  // ============================================================================
  // HOOKS & STATE
  // ============================================================================

  // Using directHumeEVI service like WorkStyle interviews
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [configId, setConfigId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<EVIMessage[]>([]);
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [currentSession, setCurrentSession] = useState<EVISessionData | null>(null);

  // Recruiter context state - copied from LiveKit dialog
  const [recruiterContext, setRecruiterContext] = useState({
    recruiterName: "",
    recruiterEmail: "",
    recruiterTitle: "",
    recruiterLinkedin: "",
    recruiterPhone: "",
    company: "",
    position: "",
    jobDescription: ""
  });

  // UI state for collapsible recruiter form
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Refs for auto-scroll functionality
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Interview completion workflow state (copied from LiveKit dialog)
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<EVIMessage[] | null>(null);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);

  // ============================================================================
  // STEP 1: Create Zero-Hallucination Config on Component Mount
  // ============================================================================

  useEffect(() => {
    if (!isOpen || !candidateId) return;

    async function createConfig() {
      try {
        setIsLoadingConfig(true);
        setConfigError(null);
        setStage('loading_config');

        console.log('🔧 Creating zero-hallucination profile config for:', candidateId);

        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/interview/create-profile-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId,
            candidateName,
            recruiterName: recruiterContext.recruiterName || recruiterName,
            recruiterEmail: recruiterContext.recruiterEmail,
            recruiterTitle: recruiterContext.recruiterTitle,
            recruiterLinkedin: recruiterContext.recruiterLinkedin,
            recruiterPhone: recruiterContext.recruiterPhone,
            company: recruiterContext.company || company,
            position: recruiterContext.position || position,
            jobDescription: recruiterContext.jobDescription
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to create config: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Zero-hallucination config created:', data.configId);

        setConfigId(data.configId);
        setSessionId(data.sessionId);
        setStage('ready');

      } catch (error) {
        console.error('❌ Error creating config:', error);
        setConfigError(error instanceof Error ? error.message : 'Failed to create config');
        setStage('initial');
      } finally {
        setIsLoadingConfig(false);
      }
    }

    createConfig();
  }, [isOpen, candidateId, candidateName, recruiterName, company, position]);

  // ============================================================================
  // STEP 2: Setup Message Handlers (Like WorkStyle)
  // ============================================================================

  const setupMessageHandlers = () => {
    console.log('🎯 Setting up message handlers for Profile interview');

    directHumeEVI.onMessage('user_message', (message: any) => {
      console.log('👤 User message received:', message);
      setTranscript(prev => [...prev, {
        type: 'user_message',
        content: message.message?.content || '',
        timestamp: new Date().toISOString()
      }]);
    });

    directHumeEVI.onMessage('assistant_message', (message: any) => {
      console.log('🤖 Assistant message received:', message);
      setTranscript(prev => [...prev, {
        type: 'assistant_message',
        content: message.message?.content || '',
        timestamp: new Date().toISOString()
      }]);
    });

    directHumeEVI.onMessage('audio_start', () => {
      setIsAIPlaying(true);
    });

    directHumeEVI.onMessage('audio_end', () => {
      setIsAIPlaying(false);
    });

    directHumeEVI.onMessage('connected', async () => {
      console.log('✅ Profile EVI connected');
      setConnectionStatus('connected');
      setStage('recording');

      // Start recording automatically when connection is ready (like WorkStyle)
      try {
        await directHumeEVI.startRecording();
        setIsRecording(true);
        console.log('✅ Recording started automatically for Profile interview');
      } catch (error) {
        console.error('❌ Failed to start recording:', error);
      }
    });

    directHumeEVI.onMessage('disconnected', () => {
      console.log('🔌 Profile EVI disconnected');
      setConnectionStatus('disconnected');
    });

    directHumeEVI.onMessage('error', (error: any) => {
      console.error('❌ Profile interview error:', error);
      setError(error.message || 'An error occurred during the interview');
      setConnectionStatus('error');
    });
  };

  // ============================================================================
  // STEP 3: Interview Control Functions
  // ============================================================================

  const handleStartInterview = async () => {
    console.log('🚀 PROFILE INTERVIEW: handleStartInterview called!');
    console.log('🔍 Current state:', { configId, sessionId, candidateId });

    if (!configId || !sessionId) {
      console.error('❌ No config ID or session ID available');
      console.error('❌ Debug values:', { configId, sessionId });
      setError('Configuration not ready. Please wait.');
      return;
    }

    try {
      setError(null);
      setStage('connecting');
      setConnectionStatus('connecting');

      console.log('🚀 Starting Profile interview with directHumeEVI...');
      console.log('📋 Connection details:');
      console.log('  - Config ID:', configId);
      console.log('  - Session ID:', sessionId);
      console.log('  - Candidate ID:', candidateId);

      // First, get access token for this session
      console.log('🔑 Getting access token...');
      const tokenResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/interview/get-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.json().catch(() => ({ error: 'Failed to get access token' }));
        throw new Error(tokenError.error || 'Failed to get access token');
      }

      const { accessToken } = await tokenResponse.json();
      console.log('✅ Access token received');

      // Setup message handlers first
      setupMessageHandlers();

      // Connect using directHumeEVI like WorkStyle interviews
      console.log('🔌 Connecting to existing EVI config...');
      const session = await directHumeEVI.connectToExistingConfig(
        configId,
        accessToken,
        sessionId,
        candidateId // Pass candidateId for context
      );

      setCurrentSession(session);
      console.log('✅ Connected to Profile EVI successfully');

    } catch (error) {
      console.error('❌ Failed to start Profile interview:', error);
      setError(error instanceof Error ? error.message : 'Failed to start interview');
      setStage('ready');
      setConnectionStatus('error');
    }
  };

  const handleCompleteInterview = async () => {
    // Prevent double clicks and ensure we're in the right state
    if (stage !== 'recording' || transcript.length === 0) {
      console.log('⚠️ Cannot complete interview - wrong stage or no transcript');
      return;
    }

    try {
      // First show saving state while collecting final transcripts
      setStage('saving');

      console.log('⏳ Waiting for final transcripts...');

      // Wait 3-5 seconds for final transcripts to arrive
      await new Promise(resolve => setTimeout(resolve, 4000));

      // Now move to processing stage
      setStage('processing');
      setIsRecording(false);

      console.log('🏁 Ending Hume EVI interview...');
      console.log('📝 Final transcript length:', transcript.length);

      let finalTranscript = transcript;
      let finalSessionId = sessionId;

      // Save transcript and generate highlights
      if (finalSessionId) {
        console.log('🔄 Saving Hume EVI interview transcript...');

        // Transform transcript to backend format
        const transcriptForBackend = finalTranscript.map(msg => ({
          type: msg.type === 'assistant_message' ? 'assistant' : 'user',
          content: msg.content,
          timestamp: new Date(msg.timestamp).toISOString()
        }));

        // Save to EVI interview sessions table and generate highlights
        const saveResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/interview/complete-evi-interview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: finalSessionId,
            candidateId: candidateId,
            transcript: transcriptForBackend,
            duration: currentTime,
            recruiterContext: recruiterContext
          })
        });

        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log('✅ Transcript saved and highlights generated:', result);
          setInterviewSummary(result);
          setCompletedSessionId(finalSessionId);
        } else {
          console.warn('⚠️ Failed to save transcript to backend');
          const errorText = await saveResponse.text();
          console.error('Error response:', errorText);
        }
      }

      // End interview using directHumeEVI
      await directHumeEVI.endInterview(sessionId, transcript);
      console.log('📋 Profile interview ended successfully');

      setTranscript(finalTranscript);
      setStage('brief');

    } catch (error) {
      console.error('❌ Error completing interview:', error);
      // Still transition to brief stage even if there's an error
      setTranscript(transcript);
      setStage('brief');
    }
  };

  // Keep the old function for backwards compatibility
  const handleEndInterview = handleCompleteInterview;

  // ============================================================================
  // STEP 4: Timer Effect & Connection Status Monitoring
  // ============================================================================

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === 'recording') {
      interval = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [stage]);

  // Monitor connection status changes for debugging (using directHumeEVI)
  useEffect(() => {
    console.log('🔄 Connection status changed:', connectionStatus);
    if (connectionStatus === 'error') {
      console.error('🚨 Profile EVI entered error state');
      console.error('🔍 Check config ID and access token validity');
    }
    if (connectionStatus === 'connected') {
      console.log('🎉 Successfully connected to Profile EVI!');
      console.log('🎤 Audio should now be active');
    }
    if (connectionStatus === 'connecting') {
      console.log('⏳ Establishing Profile EVI connection...');
    }
    if (connectionStatus === 'disconnected') {
      console.log('📤 Disconnected from Profile EVI');
    }
  }, [connectionStatus, configId]);

  // ============================================================================
  // STEP 5: Helper Functions & Auto-scroll
  // ============================================================================

  // Auto-scroll transcript to bottom (copied from LiveKit dialog)
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to update recruiter context (copied from LiveKit dialog)
  const updateRecruiterContext = (field: keyof typeof recruiterContext, value: string) => {
    setRecruiterContext(prev => ({ ...prev, [field]: value }));
  };

  // Helper function to get initials from full name (copied from LiveKit dialog)
  const getInitials = (fullName: string): string => {
    if (!fullName) return '';

    const parts = fullName.trim().split(' ').filter(part => part.length > 0);
    if (parts.length === 0) return '';

    const firstInitial = parts[0].charAt(0).toUpperCase();
    const lastInitial = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';

    return firstInitial + lastInitial;
  };

  // Fetch full transcript from database when transcript dialog opens
  const fetchFullTranscript = async () => {
    if (!completedSessionId) {
      console.warn('⚠️ No completed session ID available');
      return;
    }

    try {
      console.log('📄 Fetching full transcript from database for session:', completedSessionId);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/interview/evi-session/${completedSessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const sessionData = await response.json();
      console.log('✅ Full session data retrieved:', sessionData);

      // EVI sessions store transcript as array of {type, content, timestamp}
      if (sessionData.data && sessionData.data.transcript) {
        // Transform backend format to frontend format
        const transformedTranscript = sessionData.data.transcript.map((entry: any) => ({
          type: entry.type === 'assistant' ? 'assistant_message' : 'user_message',
          content: entry.content,
          timestamp: new Date(entry.timestamp).toISOString()
        }));
        setFullTranscriptFromDB(transformedTranscript);
        console.log('✅ Transformed transcript:', transformedTranscript);
      } else {
        console.warn('⚠️ No transcript found in session data');
      }

    } catch (error) {
      console.error('❌ Error fetching full transcript:', error);
    }
  };

  const getStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connected': return { text: 'Connected', color: 'text-green-600' };
      case 'connecting': return { text: 'Connecting', color: 'text-yellow-600' };
      case 'disconnected': return { text: 'Disconnected', color: 'text-gray-600' };
      case 'error': return { text: 'Error', color: 'text-red-600' };
      default: return { text: 'Ready', color: 'text-blue-600' };
    }
  };

  // ============================================================================
  // STEP 6: Render UI
  // ============================================================================

  if (!isOpen) return null;

  const statusDisplay = getStatusDisplay();

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Interview - {candidateName || 'Candidate'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enhanced Profile Avatar Section */}
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <Avatar className="w-20 h-20 border-4 border-primary/20">
                <AvatarImage src="" alt={candidateName || 'Candidate'} />
                <AvatarFallback className="text-2xl font-semibold bg-gradient-primary text-white">
                  {getInitials(candidateName || 'Candidate')}
                </AvatarFallback>
              </Avatar>
            </div>

            <div>
              <h3 className="text-2xl font-bold mb-2">Talk to {candidateName || 'Candidate'}'s Digital Twin</h3>
              <p className="text-lg text-muted-foreground">{candidateData?.jobTitle || 'Professional'} • {candidateData?.location || 'Remote'}</p>
            </div>
          </div>


          {/* Recruiter Context Form */}
          <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
              >
                <span>Recruiter Information (Optional)</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isContextOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <Card className="p-4 space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Optional - helps us personalize the interview and save your information for future reference
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recruiterName" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Your Name
                    </Label>
                    <Input
                      id="recruiterName"
                      value={recruiterContext.recruiterName}
                      onChange={(e) => updateRecruiterContext('recruiterName', e.target.value)}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recruiterEmail" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Email
                    </Label>
                    <Input
                      id="recruiterEmail"
                      type="email"
                      value={recruiterContext.recruiterEmail}
                      onChange={(e) => updateRecruiterContext('recruiterEmail', e.target.value)}
                      placeholder="john@company.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recruiterTitle" className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      Your Title
                    </Label>
                    <Input
                      id="recruiterTitle"
                      value={recruiterContext.recruiterTitle}
                      onChange={(e) => updateRecruiterContext('recruiterTitle', e.target.value)}
                      placeholder="Senior Recruiter"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company" className="flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      Company
                    </Label>
                    <Input
                      id="company"
                      value={recruiterContext.company}
                      onChange={(e) => updateRecruiterContext('company', e.target.value)}
                      placeholder="TechCorp Inc."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="recruiterLinkedin" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      LinkedIn (Optional)
                    </Label>
                    <Input
                      id="recruiterLinkedin"
                      value={recruiterContext.recruiterLinkedin}
                      onChange={(e) => updateRecruiterContext('recruiterLinkedin', e.target.value)}
                      placeholder="linkedin.com/in/username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recruiterPhone" className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Phone (Optional)
                    </Label>
                    <Input
                      id="recruiterPhone"
                      value={recruiterContext.recruiterPhone}
                      onChange={(e) => updateRecruiterContext('recruiterPhone', e.target.value)}
                      placeholder="+1-555-0123"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Position You're Hiring For
                  </Label>
                  <Input
                    id="position"
                    value={recruiterContext.position}
                    onChange={(e) => updateRecruiterContext('position', e.target.value)}
                    placeholder="e.g., Senior Frontend Developer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobDescription">Job Description</Label>
                  <Textarea
                    id="jobDescription"
                    value={recruiterContext.jobDescription}
                    onChange={(e) => updateRecruiterContext('jobDescription', e.target.value)}
                    placeholder="Provide a brief description of the role, requirements, and what you're looking for in a candidate..."
                    rows={3}
                  />
                </div>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Configuration Loading */}
          {isLoadingConfig && (
            <Card className="p-6">
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <div>
                  <p className="font-medium">Creating Zero-Hallucination Interview Config</p>
                  <p className="text-sm text-gray-600">Setting up mandatory tool usage and anti-hallucination rules...</p>
                </div>
              </div>
            </Card>
          )}

          {/* Configuration Error */}
          {configError && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Configuration Error</span>
              </div>
              <p className="text-sm text-red-700 mt-2">{configError}</p>
            </Card>
          )}

          {/* Interview Controls */}
          {stage === 'ready' && configId && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleStartInterview}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90"
                disabled={!configId}
              >
                <Mic className="w-4 h-4 mr-2" />
                Start Voice Interview
              </Button>
            </div>
          )}

          {/* Recording Interface */}
          {stage === 'recording' && (
            <Card className="p-6">
              <div className="space-y-4">
                {/* Status */}
                <div className="text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors mb-4 ${
                    isAIPlaying ? 'bg-blue-100 animate-pulse' :
                    isRecording ? 'bg-red-100 animate-pulse' : 'bg-muted'
                  }`}>
                    {isAIPlaying ? (
                      <Volume2 className="w-8 h-8 text-blue-600" />
                    ) : isRecording ? (
                      <Mic className="w-8 h-8 text-red-600" />
                    ) : (
                      <MicOff className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="animate-pulse bg-red-500 rounded-full h-3 w-3"></div>
                    <span className="font-medium">Profile Interview in Progress</span>
                  </div>
                  <p className={`text-sm ${statusDisplay.color}`}>
                    Status: {statusDisplay.text}
                  </p>

                  {/* Live status indicators */}
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                    {isAIPlaying && (
                      <>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span>AI Speaking...</span>
                      </>
                    )}
                    {isRecording && !isAIPlaying && (
                      <>
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span>Listening for your response...</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Timer */}
                <div className="text-center">
                  <div className="text-2xl font-mono font-bold">
                    {formatTime(currentTime)}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex justify-center">
                  <Button
                    onClick={handleCompleteInterview}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-blue-600 hover:opacity-90"
                    disabled={transcript.length === 0}
                  >
                    Complete Interview
                  </Button>
                </div>

                {/* Live Transcript */}
                <Card className="p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Live Conversation
                  </h4>
                  <div ref={transcriptContainerRef} className="space-y-3 max-h-64 overflow-y-auto">
                    {transcript.map((message, index) => (
                      <div key={index} className={`text-sm ${
                        message.type === 'assistant_message' ? 'text-primary' : 'text-foreground'
                      }`}>
                        <strong>{message.type === 'assistant_message' ? `${candidateName || 'Candidate'} speaking:` : 'You:'}</strong> {message.content}
                      </div>
                    ))}
                    {transcript.length === 0 && (
                      <div className="text-center text-muted-foreground text-sm py-8">
                        <div className="animate-pulse">Waiting for conversation to begin...</div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Guidelines */}
                <div className="text-xs text-gray-600 space-y-1">
                  <p>• Ask questions about the candidate's background and experience</p>
                  <p>• The AI will only respond with verified profile information</p>
                  <p>• All responses are fact-checked against the database</p>
                </div>
              </div>
            </Card>
          )}

          {/* Saving Stage */}
          {stage === 'saving' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="relative inline-flex">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">Saving Interview</h3>
                <p className="text-muted-foreground">Collecting final transcripts...</p>
              </div>

              <Card className="p-6 border-blue-200 bg-blue-50/20">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Clock className="w-4 h-4 animate-pulse" />
                    <span className="text-sm">Please wait while we save your conversation</span>
                  </div>
                  <div className="text-xs text-muted-foreground text-center">
                    This ensures all responses are properly captured
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Processing Stage */}
          {stage === 'processing' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="relative inline-flex">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                    <TrendingUp className="w-10 h-10 text-white animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">Processing Interview</h3>
                <p className="text-muted-foreground">Generating insights from your conversation...</p>
              </div>

              <Card className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm">Analyzing conversation transcript...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm">Extracting key discussion points...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm">Identifying candidate strengths...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm">Generating interview summary...</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Brief Stage */}
          {stage === 'brief' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
                  <Target className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-green-600">Profile Interview Completed!</h3>
                  <p className="text-muted-foreground">Here are the key insights from your conversation</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Key Insights */}
                {interviewSummary?.keyInsights && interviewSummary.keyInsights.length > 0 && (
                  <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-primary/10 rounded-lg">
                        <TrendingUp className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-semibold text-lg">📊 Key Insights</h4>
                    </div>
                    <ul className="text-sm space-y-3">
                      {interviewSummary.keyInsights.map((insight: string, index: number) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span className="leading-relaxed">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Recruiter Recommendation */}
                <Card className="p-5 border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                      <Briefcase className="w-4 h-4 text-blue-600" />
                    </div>
                    <h4 className="font-semibold text-lg text-blue-900">💼 Interview Summary</h4>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    {interviewSummary?.recruiterRecommendation || 'Interview analysis complete. Please review the conversation highlights for key insights.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge className="px-3 py-1 font-semibold bg-green-100 text-green-800 border-green-300">
                      ⭐ Profile Interview Complete
                    </Badge>
                  </div>
                </Card>

                {/* Interview Stats */}
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <h4 className="font-medium">Interview Statistics</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{formatTime(currentTime)}</p>
                      <p className="text-muted-foreground">Duration</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{transcript.filter(m => m.type === 'user_message').length}</p>
                      <p className="text-muted-foreground">Questions Asked</p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={async () => {
                    setShowTranscriptDialog(true);
                    await fetchFullTranscript();
                  }}
                  className="flex-1"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View Transcript
                </Button>
                <Button onClick={onClose} className="flex-1 bg-gradient-primary">
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-700 mt-2">{error}</p>
            </Card>
          )}
        </div>
      </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Interview Transcript</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[65vh]">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Duration: {formatTime(currentTime)}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <span>{candidateName || 'Candidate'} • Profile Interview</span>
              {recruiterContext.recruiterName && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span>with {recruiterContext.recruiterName}</span>
                </>
              )}
            </div>
            <Separator />
            <div className="space-y-4">
              {(() => {
                const transcriptData = fullTranscriptFromDB || transcript;

                // Safety check - ensure transcriptData is an array
                if (!Array.isArray(transcriptData)) {
                  console.error('Transcript is not an array:', transcriptData);
                  return <p className="text-center text-muted-foreground py-8">Error loading transcript</p>;
                }

                if (transcriptData.length === 0) {
                  return <p className="text-center text-muted-foreground py-8">No transcript available</p>;
                }

                return transcriptData.map((message, index) => {
                  // Safety check for message structure
                  if (!message || typeof message !== 'object') {
                    console.error('Invalid message format:', message);
                    return null;
                  }

                  return (
                    <div key={index} className={`p-3 rounded-lg ${
                      message.type === 'assistant_message'
                        ? 'bg-primary/5 border-l-4 border-primary'
                        : 'bg-muted/50 border-l-4 border-muted-foreground'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {message.type === 'assistant_message' ? (candidateName || 'Candidate') : (recruiterContext.recruiterName || 'Interviewer')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
                        </span>
                      </div>
                      <div className="text-sm">
                        {message.content || message.text || ''}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setShowTranscriptDialog(false)}>
              Close
            </Button>
          </div>
      </DialogContent>
      </Dialog>
    </>
  );
}