import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, Loader2, AlertTriangle, Volume2, Users, Briefcase } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, useRoomContext, useParticipants, useDataChannel, useTracks } from '@livekit/components-react';
import { Room, DataPacket_Kind, Participant, Track, RemoteParticipant } from 'livekit-client';
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";

// Define message type for LiveKit transcripts
type LiveKitMessage = {
  type: 'assistant_message' | 'user_message';
  content: string;
  timestamp: string;
};

interface WorkStyleLiveKitInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInterviewComplete?: (data: any) => void;
}

type InterviewStage = 'initial' | 'connecting' | 'interviewing' | 'saving' | 'processing' | 'brief' | 'error';

const INTERVIEW_DURATION = 10 * 60; // 10 minutes for work style interview

export default function WorkStyleLiveKitInterviewDialog({
  isOpen,
  onClose,
  onInterviewComplete
}: WorkStyleLiveKitInterviewDialogProps) {
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [transcript, setTranscript] = useState<LiveKitMessage[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [shouldAutoComplete, setShouldAutoComplete] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [showInitialLoading, setShowInitialLoading] = useState(false);

  const interviewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { toast } = useToast();

  // LiveKit specific state
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  // Interview completion and insights state
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<LiveKitMessage[] | null>(null);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (interviewTimerRef.current) {
      clearInterval(interviewTimerRef.current);
      interviewTimerRef.current = null;
    }
  };

  // Auto-complete when triggered
  useEffect(() => {
    if (shouldAutoComplete && !isCompleting) {
      handleCompleteInterview();
    }
  }, [shouldAutoComplete, isCompleting]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartInterview = async () => {
    try {
      setStage('connecting');
      setConnectionStatus('connecting');
      setError(null);

      console.log('🎯 Starting Work Style LiveKit interview...');

      // Get auth token from Zustand store in localStorage
      const authStorage = localStorage.getItem('auth-storage');
      const token = authStorage ? JSON.parse(authStorage).state?.token : null;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/interviews/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          candidateId: user?.id,
          recruiterName: 'Sarah',
          recruiterTitle: 'Work Style Advisor',
          company: 'Career Development',
          jobTitle: 'Work Style & Career Goals',
          jobDescription: 'Exploring work preferences and career aspirations',
          interviewType: 'work_style'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start LiveKit interview');
      }

      const data = await response.json();
      console.log('✅ LiveKit work style interview started:', data);

      // Store the connection details
      setLivekitToken(data.token);
      setRoomName(data.roomName);
      setServerUrl(data.serverUrl || 'wss://digital-twin-rl2-6xocd5y9.livekit.cloud');
      setSessionId(data.roomName);

      // Show loading state for 4 seconds before transitioning to interview
      setTranscript([]);
      setCurrentTime(0);

      setTimeout(() => {
        // Move to interviewing stage after 4 seconds
        setStage('interviewing');
      }, 4000);

    } catch (error) {
      console.error('❌ Failed to start LiveKit interview:', error);
      setError(error instanceof Error ? error.message : 'Failed to start interview');
      setStage('error');
      setConnectionStatus('error');
    }
  };

  const handleCompleteInterview = async () => {
    // Prevent double clicks and ensure we're in the right state
    if (stage !== 'interviewing' || transcript.length === 0) {
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
      setConnectionStatus('disconnected');

      console.log('🏁 Ending Work Style LiveKit interview...');
      console.log('📝 Final transcript length:', transcript.length);

      let finalTranscript = transcript;
      let finalSessionId = sessionId;

      // Save transcript to backend using LiveKit interview endpoint
      if (finalSessionId) {
        console.log('🔄 Saving Work Style interview transcript...');

        // Transform transcript to LiveKit format
        const transcriptForBackend = finalTranscript.map(msg => ({
          speaker: msg.type === 'assistant_message' ? 'agent' : 'user',
          text: msg.content,
          timestamp: new Date(msg.timestamp).getTime()
        }));

        const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/livekit-interviews/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: finalSessionId,
            candidateId: user?.id,
            transcript: transcriptForBackend,
            duration: currentTime,
            interviewType: 'work_style'
          })
        });

        console.log('📨 Response status:', saveResponse.status, saveResponse.statusText);

        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log('✅ Transcript saved and insights extracted:', result);
          setInterviewSummary(result);
          setCompletedSessionId(finalSessionId);
        } else {
          console.error('❌ Failed to save transcript to backend');
        }
      }

      setTranscript(finalTranscript);
      setStage('brief');

      // Call completion callback if provided
      if (onInterviewComplete) {
        onInterviewComplete(interviewSummary?.data || {});
      }

    } catch (error) {
      console.error('❌ Error completing interview:', error);
      // Still transition to brief stage even if there's an error
      setTranscript(transcript);
      setStage('brief');

      // Call completion callback even if there's an error
      if (onInterviewComplete) {
        onInterviewComplete({});
      }
    }
  };

  const handleClose = () => {
    cleanup();

    // Reset all state
    setStage('initial');
    setTranscript([]);
    setCurrentTime(0);
    setError(null);
    setSessionId(null);
    setIsAIPlaying(false);
    setIsListening(false);
    setShouldAutoComplete(false);
    setIsCompleting(false);
    setConnectionStatus('disconnected');
    setErrorMessage('');

    // Reset LiveKit state
    setLivekitToken(null);
    setRoomName(null);
    setServerUrl(null);
    // Reset interview completion state
    setInterviewSummary(null);
    setCompletedSessionId(null);
    setFullTranscriptFromDB(null);
    setShowTranscriptDialog(false);

    onClose();
  };

  // Component to handle LiveKit room events
  const WorkStyleRoomContent = () => {
    const room = useRoomContext();
    const participants = useParticipants();
    const tracks = useTracks();

    // Auto-scroll to bottom when transcript changes
    useEffect(() => {
      if (transcriptContainerRef.current) {
        transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
      }
    }, [transcript]);

    // Handle transcription events (PRIMARY transcript mechanism)
    useEffect(() => {
      if (!room) return;

      const handleTranscriptionReceived = (segments: any[], participant?: any) => {
        console.log('📝 Transcription received:', segments, 'from:', participant?.identity);

        // Process transcription segments
        segments.forEach(segment => {
          if (segment.final && segment.text) {
            const transcriptMessage: LiveKitMessage = {
              type: participant?.identity?.includes('agent') ? 'assistant_message' : 'user_message',
              content: segment.text,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
          }
        });
      };

      // Listen for transcription events
      room.on('transcriptionReceived', handleTranscriptionReceived);

      return () => {
        if (room) {
          room.off('transcriptionReceived', handleTranscriptionReceived);
        }
      };
    }, [room]);

    // Handle data messages using useDataChannel hook (FALLBACK transcript mechanism)
    useDataChannel((data, participant) => {
      try {
        const decoder = new TextDecoder();
        const text = decoder.decode(data.payload);
        console.log('📦 Data channel message:', text, 'from:', participant?.identity);

        // Try to parse as JSON first
        try {
          const message = JSON.parse(text);

          // Handle transcript updates
          if (message.type === 'transcript_update') {
            const transcriptMessage: LiveKitMessage = {
              type: message.role === 'agent' ? 'assistant_message' : 'user_message',
              content: message.content,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
            // Auto-scroll to bottom when new message arrives
            setTimeout(() => {
              transcriptContainerRef.current?.scrollTo({
                top: transcriptContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }, 100);
          }

          // Handle other message types
          if (message.type === 'agent_speaking') {
            setIsAIPlaying(message.speaking);
          }

          if (message.type === 'agent_listening') {
            setIsListening(message.listening);
          }

          // Also handle generic transcript/text fields
          if (message.transcript || message.text) {
            const transcriptMessage: LiveKitMessage = {
              type: participant?.identity.includes('agent') ? 'assistant_message' : 'user_message',
              content: message.transcript || message.text,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
            // Auto-scroll to bottom when new message arrives
            setTimeout(() => {
              transcriptContainerRef.current?.scrollTo({
                top: transcriptContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }, 100);
          }
        } catch {
          // If not JSON, treat as plain text transcript
          if (text && text.trim()) {
            const transcriptMessage: LiveKitMessage = {
              type: participant?.identity.includes('agent') ? 'assistant_message' : 'user_message',
              content: text,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
            // Auto-scroll to bottom when new message arrives
            setTimeout(() => {
              transcriptContainerRef.current?.scrollTo({
                top: transcriptContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }, 100);
          }
        }
      } catch (e) {
        console.error('Error handling data message:', e);
      }
    });

    // Monitor participants and connection state
    useEffect(() => {
      const agentParticipant = participants.find(p => p.identity.includes('agent'));
      if (agentParticipant && connectionStatus !== 'connected') {
        console.log('🤖 Agent in room:', agentParticipant.identity);
        setConnectionStatus('connected');
        setIsListening(true);

        // Show initial loading state for 6.5 seconds to prevent user confusion
        setShowInitialLoading(true);
        setTimeout(() => {
          setShowInitialLoading(false);
        }, 6500);
      }
    }, [participants]);

    // Timer effect for recording with auto-completion at 10 minutes
    useEffect(() => {
      if (connectionStatus === 'connected') {
        interviewTimerRef.current = setInterval(() => {
          setCurrentTime(prev => {
            const newTime = prev + 1;

            // Auto-complete at 10 minutes (600 seconds)
            if (newTime >= INTERVIEW_DURATION) {
              console.log('⏰ 10-minute limit reached, auto-completing interview');
              setShouldAutoComplete(true);
              return INTERVIEW_DURATION;
            }

            return newTime;
          });
        }, 1000);
      } else if (interviewTimerRef.current) {
        clearInterval(interviewTimerRef.current);
        interviewTimerRef.current = null;
      }

      return () => {
        if (interviewTimerRef.current) {
          clearInterval(interviewTimerRef.current);
        }
      };
    }, [connectionStatus]);

    return null; // This component only handles data, no UI rendering
  };

  const renderConnectingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="relative inline-flex">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Setting Up Your Interview</h3>
          <p className="text-muted-foreground">Preparing your work style & career goals session...</p>
        </div>
      </div>

      <Card className="p-4 bg-purple-50/50 border-purple-200">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-purple-600">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Setting up voice connection...</span>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderInterviewingStage = () => {
    if (livekitToken && roomName && serverUrl) {
      return (
        <LiveKitRoom
          token={livekitToken}
          serverUrl={serverUrl}
          connect={true}
          audio={true}
          video={false}
          onError={(error) => {
            console.error('❌ LiveKit room error:', error);
            setConnectionStatus('error');
            setErrorMessage(error.message);
          }}
          onConnected={() => {
            console.log('✅ Connected to LiveKit room');
            setConnectionStatus('connected');
          }}
          onDisconnected={() => {
            console.log('📴 Disconnected from LiveKit room');
            setConnectionStatus('disconnected');
          }}
        >
          <WorkStyleRoomContent />
          <RoomAudioRenderer />
          <div className="space-y-6">
            <div className="text-center space-y-4">
              {/* Voice Recording Indicator */}
              <div className="relative inline-flex">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                  connectionStatus === 'connected' && !isAIPlaying
                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30'
                    : isAIPlaying
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30'
                    : 'bg-muted'
                }`}>
                  {isAIPlaying ? (
                    <Volume2 className="w-10 h-10 text-white animate-pulse" />
                  ) : connectionStatus === 'connected' ? (
                    <Mic className="w-10 h-10 text-white" />
                  ) : (
                    <MicOff className="w-10 h-10 text-muted-foreground" />
                  )}
                </div>
                {(connectionStatus === 'connected' || isAIPlaying) && (
                  <span className="absolute flex h-full w-full">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isAIPlaying ? 'bg-purple-400' : 'bg-green-400'
                    }`}></span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-semibold">
                  {isAIPlaying
                    ? "AI is Speaking"
                    : connectionStatus === 'connected'
                    ? "Share Your Work Style"
                    : "Connecting..."}
                </h3>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-lg font-mono">{formatTime(currentTime)}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formatTime(INTERVIEW_DURATION - currentTime)} remaining
                  </Badge>
                </div>
              </div>
            </div>

            {errorMessage && (
              <Card className="p-4 bg-red-50 border-red-200">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  <p className="text-sm">{errorMessage}</p>
                </div>
              </Card>
            )}

            <Card className="p-4 bg-muted/30">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Live Conversation
              </h4>
              <div ref={transcriptContainerRef} className="space-y-4 h-64 overflow-y-auto">
                {showInitialLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                      <p className="text-sm text-muted-foreground">Preparing your interview...</p>
                    </div>
                  </div>
                ) : transcript.map((message, index) => (
                  <div key={index} className={`flex gap-3 ${
                    message.type === 'assistant_message' ? 'justify-start' : 'justify-end'
                  }`}>
                    <div className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'assistant_message'
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-purple-500 text-white'
                    }`}>
                      <div className="text-xs font-medium mb-1 opacity-80">
                        {message.type === 'assistant_message' ? 'Sarah' : 'You'}
                      </div>
                      <div className="text-sm">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {isAIPlaying && (
                <div className="mt-2 flex justify-start">
                  <div className="bg-primary/5 border border-primary/20 p-2 rounded-lg">
                    <div className="flex items-center gap-2 text-primary">
                      <Volume2 className="w-4 h-4 animate-pulse" />
                      <span className="text-sm">AI is speaking...</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {connectionStatus === 'connected' && (
              <div className="flex justify-center">
                <Button
                  onClick={handleCompleteInterview}
                  size="lg"
                  className="bg-gradient-to-r from-primary to-purple-600 hover:opacity-90"
                  disabled={transcript.length === 0 || isCompleting}
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Complete Interview'
                  )}
                </Button>
              </div>
            )}
          </div>
        </LiveKitRoom>
      );
    }

    return (
      <div className="text-center p-4">
        <p className="text-muted-foreground">Connecting to interview room...</p>
      </div>
    );
  };

  // Fetch full transcript from database when transcript dialog opens
  const fetchFullTranscript = async () => {
    if (!completedSessionId) {
      console.warn('⚠️ No completed session ID available');
      return;
    }

    try {
      console.log('📄 Fetching full transcript from database for session:', completedSessionId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/livekit-interviews/session/${completedSessionId}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const sessionData = await response.json();
      console.log('✅ Full session data retrieved:', sessionData);

      // LiveKit sessions store transcript as array of {speaker, text, timestamp}
      if (sessionData.data && sessionData.data.transcript) {
        // Transform backend format to frontend format
        const transformedTranscript = sessionData.data.transcript.map((entry: any) => ({
          type: entry.speaker === 'agent' ? 'assistant_message' : 'user_message',
          content: entry.text,
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

  const renderSavingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="relative inline-flex">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <h3 className="text-xl font-semibold">Saving Interview</h3>
        <p className="text-muted-foreground">Collecting final transcripts...</p>
      </div>

      <Card className="p-6 border-purple-200 bg-purple-50/20">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-purple-600">
            <Clock className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Please wait while we save your conversation</span>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            This ensures all responses are properly captured
          </div>
        </div>
      </Card>
    </div>
  );

  const renderProcessingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="relative inline-flex">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
            <TrendingUp className="w-10 h-10 text-white animate-pulse" />
          </div>
        </div>
        <h3 className="text-xl font-semibold">Processing Interview</h3>
        <p className="text-muted-foreground">Analyzing your work style preferences...</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Analyzing conversation transcript...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Identifying work style preferences...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Extracting career goals...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Generating personalized insights...</span>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderBriefStage = () => {
    // Parse the insights from backend - check multiple possible locations
    const insights = interviewSummary?.data?.highlights || interviewSummary?.highlights || interviewSummary || {
      keyInsights: [],
      workStylePreferences: "Your work style preferences have been captured.",
      careerGoals: []
    };

    // Handle both string and object formats
    let processedInsights: any = {};

    if (typeof insights === 'string') {
      // If it's a string, use it as the main content
      processedInsights = {
        mainContent: insights,
        keyInsights: [],
        workStylePreferences: insights
      };
    } else if (typeof insights === 'object') {
      // If it's an object, use its properties
      processedInsights = insights;
    } else {
      // Fallback
      processedInsights = {
        keyInsights: [],
        workStylePreferences: "Your work style preferences have been captured.",
        careerGoals: []
      };
    }

    // Also check for any AI-generated insights in the data
    const aiInsights = interviewSummary?.data?.aiInsights || interviewSummary?.aiInsights || [];

    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Target className="w-10 h-10 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-purple-600">Work Style Interview Completed!</h3>
            <p className="text-muted-foreground">Your preferences and goals have been captured</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* AI Generated Insights if available */}
          {aiInsights.length > 0 && (
            <Card className="p-5 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <h4 className="font-semibold text-lg">💡 Key Insights from Interview</h4>
              </div>
              <ul className="text-sm space-y-3">
                {aiInsights.map((insight: string, index: number) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Key Insights if available in structured format */}
          {processedInsights.keyInsights && processedInsights.keyInsights.length > 0 && (
            <Card className="p-5 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <h4 className="font-semibold text-lg">💡 Key Insights</h4>
              </div>
              <ul className="text-sm space-y-3">
                {processedInsights.keyInsights.map((insight: string, index: number) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Work Style Preferences */}
          {processedInsights.workStyle && (
            <Card className="p-5 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-indigo-100 rounded-lg">
                  <Users className="w-4 h-4 text-indigo-600" />
                </div>
                <h4 className="font-semibold text-lg text-indigo-900">🎯 Work Style & Preferences</h4>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium">Preferred Environment:</span> {processedInsights.workStyle.preferredEnvironment}
                </div>
                <div>
                  <span className="font-medium">Collaboration Style:</span> {processedInsights.workStyle.collaborationStyle}
                </div>
                <div>
                  <span className="font-medium">Communication:</span> {processedInsights.workStyle.communicationPreferences}
                </div>
                <div>
                  <span className="font-medium">Work Pace:</span> {processedInsights.workStyle.workPace}
                </div>
              </div>
            </Card>
          )}

          {/* Strengths & Motivations */}
          {(processedInsights.strengths?.length > 0 || processedInsights.motivations?.length > 0) && (
            <Card className="p-5 border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="font-semibold text-lg text-blue-900">💪 Strengths & Motivations</h4>
              </div>
              <div className="space-y-3">
                {processedInsights.strengths?.length > 0 && (
                  <div>
                    <span className="font-medium text-sm">Key Strengths:</span>
                    <ul className="mt-1 text-sm space-y-1">
                      {processedInsights.strengths.map((strength: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span>{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {processedInsights.motivations?.length > 0 && (
                  <div>
                    <span className="font-medium text-sm">Motivations:</span>
                    <ul className="mt-1 text-sm space-y-1">
                      {processedInsights.motivations.map((motivation: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span>{motivation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

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
                <p className="text-muted-foreground">Responses Shared</p>
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
            View Full Transcript
          </Button>
          <Button onClick={handleClose} className="flex-1 bg-gradient-primary">
            Done
          </Button>
        </div>
      </div>
    );
  };

  const renderErrorStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-red-600">Interview Error</h3>
          <p className="text-muted-foreground">We encountered an issue starting your interview</p>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Close
        </Button>
        <Button onClick={handleStartInterview} className="flex-1">
          Try Again
        </Button>
      </div>
    </div>
  );

  const renderInitialStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-6">
        <div>
          <h3 className="text-2xl font-bold mb-2">Work Style & Career Goals Interview</h3>
          <p className="text-lg text-muted-foreground">Explore your work preferences and future aspirations</p>
        </div>
      </div>

      <Card className="p-6 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-600" />
          What to Expect
        </h4>
        <ul className="text-sm space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-purple-600">•</span>
            Discussion about your ideal work environment
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-600">•</span>
            Exploration of your career goals and aspirations
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-600">•</span>
            Understanding your work-life balance preferences
          </li>
        </ul>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleStartInterview}
          className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90"
        >
          <Mic className="w-4 h-4 mr-2" />
          Start Interview
        </Button>
      </div>
    </div>
  );

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Work Style & Career Goals Interview</DialogTitle>
        </DialogHeader>
        {stage === 'initial' && renderInitialStage()}
        {stage === 'connecting' && renderConnectingStage()}
        {stage === 'interviewing' && renderInterviewingStage()}
        {stage === 'saving' && renderSavingStage()}
        {stage === 'processing' && renderProcessingStage()}
        {stage === 'brief' && renderBriefStage()}
        {stage === 'error' && renderErrorStage()}
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
            <span>Work Style & Career Goals Interview</span>
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
                      ? 'bg-purple-50 border-l-4 border-purple-500'
                      : 'bg-muted/50 border-l-4 border-muted-foreground'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {message.type === 'assistant_message' ? 'Sarah' : 'You'}
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