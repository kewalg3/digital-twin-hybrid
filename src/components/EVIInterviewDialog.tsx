import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, Loader2, AlertTriangle, Volume2 } from "lucide-react";
import { directHumeEVI } from "@/services/directHumeEVISDK";
import type { JobContext, EVISessionData, EVIMessage } from "@/services/directHumeEVISDK";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateUserSession } from "@/utils/userSession";
import { useAuthStore } from "@/store/authStore";

interface Experience {
  id: string;
  jobTitle: string;
  company: string;
  location?: string;
  employmentType?: string;
  startDate: string;
  endDate?: string;
  isCurrentRole: boolean;
  description?: string;
  achievements?: string[];
  keySkills?: string[];
  interviewCompleted: boolean;
  enrichedData?: any;
  createdAt: string;
}

interface Job {
  title: string;
  company: string;
  duration: string;
  location: string;
  description: string;
  skills: string[];
  software: string[];
  aiSuggestedSkills: string[];
  aiSuggestedSoftware: string[];
  allExperiences?: Experience[]; // For combined interviews
}

interface EVIInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  experienceId?: string;
  onInterviewComplete?: (enrichedData: any) => void;
}

type InterviewStage = 'initial' | 'connecting' | 'interviewing' | 'completed' | 'error';

export default function EVIInterviewDialog({ isOpen, onClose, job, experienceId, onInterviewComplete }: EVIInterviewDialogProps) {
  const { user } = useAuthStore();
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<EVIMessage[]>([]);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSession, setCurrentSession] = useState<EVISessionData | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>('voice1');
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [shouldAutoComplete, setShouldAutoComplete] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<EVIMessage[] | null>(null);
  const { toast } = useToast();
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersSetup = useRef<boolean>(false);
  const currentApiInstance = useRef<any>(null);
  const timeoutWarningShown = useRef<boolean>(false);
  const autoCompletionTriggered = useRef<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Timeout constants - all interviews are now 15 minutes
  const isCombinedInterview = job?.allExperiences && job.allExperiences.length > 0;
  const MAX_INTERVIEW_DURATION = 900; // All interviews are now 15 minutes
  const WARNING_TIME = 780; // Warning at 13 minutes

  // DEBUG: Expose debugging functions to window for manual testing
  useEffect(() => {
    (window as any).debugDirectEVI = () => {
      console.log('🔍 Direct EVI Current session:', currentSession);
      console.log('🔍 Connection status:', connectionStatus);
      console.log('🔍 Is starting:', isStarting);
      console.log('🔍 Direct EVI instance:', directHumeEVI);
    };
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [isOpen]);

  const cleanup = () => {
    console.log('🧹 CLEANUP: Starting component cleanup (direct EVI)');
    directHumeEVI.cleanup();
    setCurrentSession(null);
    messageHandlersSetup.current = false;
    timeoutWarningShown.current = false;
    autoCompletionTriggered.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Timer effect for interview duration
  useEffect(() => {
    if (stage === 'interviewing') {
      timerRef.current = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [stage]);

  // Handle auto-completion when triggered
  useEffect(() => {
    if (shouldAutoComplete && stage === 'interviewing') {
      console.log('🤖 Auto-completion triggered via state change');
      handleCompleteInterview();
      setShouldAutoComplete(false);
    }
  }, [shouldAutoComplete]);

  // Fetch full transcript from database when transcript dialog opens
  const fetchFullTranscript = async () => {
    if (!completedSessionId) {
      console.warn('⚠️ No completed session ID available');
      return;
    }

    try {
      console.log('📄 Fetching full transcript from database for session:', completedSessionId);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/evi-interviews/session/${completedSessionId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const sessionData = await response.json();
      console.log('✅ Full session data retrieved:', sessionData);
      
      // Use the full transcript from the database if available
      if (sessionData.data && sessionData.data.fullTranscript) {
        setFullTranscriptFromDB(sessionData.data.fullTranscript);
      } else {
        console.warn('⚠️ No fullTranscript found in session data');
      }
      
    } catch (error) {
      console.error('❌ Error fetching full transcript:', error);
      toast({
        title: "Transcript Error",
        description: "Could not load the complete transcript from database",
        variant: "destructive"
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getRemainingTime = (currentSeconds: number) => {
    const remaining = Math.max(0, MAX_INTERVIEW_DURATION - currentSeconds);
    return formatTime(remaining);
  };
  
  const getTimeColor = (currentSeconds: number) => {
    if (currentSeconds >= MAX_INTERVIEW_DURATION) return 'text-red-600';
    if (currentSeconds >= WARNING_TIME) return 'text-orange-500';
    return 'text-muted-foreground';
  };

  const handleStartInterview = async () => {
    console.log(`🎯 Starting DIRECT EVI interview at ${new Date().toISOString()}`);
    
    // Prevent multiple simultaneous starts
    if (isStarting || connectionStatus === 'connecting' || currentSession) {
      console.log('⚠️ Interview already starting or active');
      return;
    }

    setIsStarting(true);
    
    try {
      setSelectedVoice('voice3'); // DACHER
      setStage('connecting');
      setErrorMessage('');
      setConnectionStatus('connecting');
      
      const jobContext = {
        ...job, // Spread all properties including allExperiences
        experienceId: experienceId,
        candidateName: user?.name || user?.email?.split('@')[0] || 'Candidate',
        userId: user?.id
      };

      console.log('🚀 Starting DIRECT connection to Hume EVI...');
      console.log('📋 Job context:', jobContext);
      console.log('✅ Has allExperiences:', !!jobContext.allExperiences);
      console.log('📊 Experience count:', jobContext.allExperiences?.length || 0);
      console.log('👤 User:', { id: user?.id, name: user?.name });
      
      // Connect directly to Hume (no backend proxy!)
      const session = await directHumeEVI.startInterview(
        user?.id || '', 
        'job_experience', 
        jobContext
      );
      
      setCurrentSession(session);
      setConnectionStatus('connected');
      setStage('interviewing');
      
      // Set up message handlers for real-time updates
      setupDirectEVIMessageHandlers();
      
      toast({
        title: "Direct Interview Started",
        description: "Connected directly to Hume! Audio bypasses our backend entirely."
      });
      
    } catch (error) {
      console.error('❌ Direct EVI interview start error:', error);
      setConnectionStatus('error');
      setStage('error');
      setErrorMessage(error.message || 'Failed to start direct interview');
      
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to start the interview. Please try again.",
        variant: "destructive"
      });
    } finally {
      setTimeout(() => {
        setIsStarting(false);
      }, 2000);
    }
  };


  const setupDirectEVIMessageHandlers = () => {
    // Prevent multiple handler setups
    if (messageHandlersSetup.current) {
      console.log('⚠️ Message handlers already set up');
      return;
    }
    
    console.log('🔧 Setting up DIRECT EVI message handlers...');
    messageHandlersSetup.current = true;
    
    // Handle user messages
    directHumeEVI.onMessage('user_message', (message: any) => {
      console.log('👤 User (direct):', message.message?.content);
      const transcriptEntry = {
        type: 'user_message' as const,
        content: message.message?.content || '',
        timestamp: new Date().toISOString(),
        emotions: message.models?.prosody?.scores
      };
      setTranscript(prev => [...prev, transcriptEntry]);
    });

    // Handle assistant messages  
    directHumeEVI.onMessage('assistant_message', (message: any) => {
      console.log('🤖 AI (direct):', message.message?.content);
      const transcriptEntry = {
        type: 'assistant_message' as const,
        content: message.message?.content || '',
        timestamp: new Date().toISOString(),
        emotions: message.models?.prosody?.scores
      };
      setTranscript(prev => [...prev, transcriptEntry]);
    });

    // Handle audio output (Hume's audio player handles this automatically)
    directHumeEVI.onMessage('audio_output', (message: any) => {
      console.log('🔊 AI audio (direct) - handled by Hume player');
      // Audio playback state is now managed by audio_start/audio_end events
    });

    // Handle audio playback start
    directHumeEVI.onMessage('audio_start', () => {
      console.log('🎵 AI audio playback started');
      setIsAIPlaying(true);
    });

    // Handle audio playback end
    directHumeEVI.onMessage('audio_end', () => {
      console.log('🎵 AI audio playback ended');
      setIsAIPlaying(false);
    });

    // Handle user interruption
    directHumeEVI.onMessage('user_interruption', () => {
      console.log('✋ User interruption (direct)');
      setIsAIPlaying(false);
    });
    
    // Handle timeout warning from Hume
    directHumeEVI.onMessage('timeout_warning', (message: any) => {
      console.log('⏰ Timeout warning received from Hume:', message);
      toast({
        title: "Interview Timeout Warning",
        description: "The interview will end soon. Please wrap up your current response.",
        variant: "default"
      });
    });
    
    // Handle session ended by timeout
    directHumeEVI.onMessage('session_ended', async (message: any) => {
      console.log('⏰ Session ended by Hume timeout:', message);
      
      // Prevent multiple auto-completion attempts
      if (autoCompletionTriggered.current) {
        console.log('🚫 Auto-completion already triggered, skipping');
        return;
      }
      autoCompletionTriggered.current = true;
      
      toast({
        title: "Interview Completed",
        description: "The interview has been automatically completed due to timeout.",
        variant: "default"
      });
      
      // Add a delay to ensure the final timeout message audio plays completely
      console.log('⏰ Waiting 3 seconds for timeout message to play...');
      setTimeout(() => {
        console.log('🤖 Setting auto-complete flag after timeout message...');
        setShouldAutoComplete(true);
      }, 3000); // 3 second delay to let the audio play
    });
    
    // Handle chat metadata for additional timeout info
    directHumeEVI.onMessage('chat_metadata', (message: any) => {
      console.log('📊 Chat metadata received:', message);
      // Log any timeout-related metadata
      if (message.type === 'chat_metadata') {
        console.log('📊 Chat metadata details:', JSON.stringify(message, null, 2));
      }
    });

    // Handle connection events
    directHumeEVI.onMessage('connected', async () => {
      console.log('✅ Direct EVI connected');
      setConnectionStatus('connected');
      
      // Start recording automatically when connection is ready
      try {
        await directHumeEVI.startRecording();
        setIsRecording(true);
        setIsListening(true);
        console.log('✅ Recording started automatically');
      } catch (error) {
        console.error('❌ Failed to start recording:', error);
        toast({
          title: "Recording Error",
          description: "Failed to start audio recording",
          variant: "destructive"
        });
      }
    });

    directHumeEVI.onMessage('disconnected', () => {
      console.log('🔌 Direct EVI disconnected');
      setConnectionStatus('disconnected');
    });

    // Handle errors
    directHumeEVI.onMessage('error', (error: any) => {
      console.error('❌ Direct EVI error:', error);
      toast({
        title: "Interview Error",
        description: error?.message || "An error occurred during the interview",
        variant: "destructive"
      });
    });
  };


  // Auto-scroll to bottom when transcript changes
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleCompleteInterview = async () => {
    if (isCompleting) return; // Prevent double submission
    
    try {
      setIsCompleting(true);
      
      console.log('🏁 Completing interview - Current state:', {
        currentSession,
        connectionStatus,
        transcriptLength: transcript.length
      });

      setIsRecording(false);
      setIsListening(false);
      
      // Check if we have a valid session - if not, create fallback data
      if (!currentSession) {
        console.warn('⚠️ No current session found, using fallback data');
        // Don't return - continue with fallback sessionId
      }
      
      // IMPORTANT: Capture session data BEFORE calling endInterview() 
      // because endInterview() cleans up the session
      const sessionDataBeforeEnd = {
        sessionId: currentSession?.sessionId || `fallback-${Date.now()}`,
        configId: currentSession?.configId || null,
        interviewId: currentSession?.interviewId || null
      };
      
      console.log('🏁 Ending interview via SDK...', sessionDataBeforeEnd);
      console.log('🔍 IMPORTANT: DB Session ID being used:', sessionDataBeforeEnd.sessionId);
      
      // Get transcript from SDK like Work Style does
      const currentTranscript = directHumeEVI.getTranscript();
      console.log('📜 Current transcript from directHumeEVI:', currentTranscript);
      console.log('📜 State transcript:', transcript);
      
      // Use SDK transcript as primary source
      const transcriptToUse = currentTranscript.length > 0 ? currentTranscript : transcript;
      
      let result;
      try {
        // End interview and get transcript
        result = await directHumeEVI.endInterview();
        console.log('📝 Interview result:', result);
      } catch (endError) {
        console.warn('⚠️ Error ending interview (may already be ended):', endError);
        // If interview is already ended, continue with current transcript
        result = {
          transcript: transcriptToUse,
          sessionId: sessionDataBeforeEnd.sessionId
        };
      }
      
      // Update transcript with final version
      if (result.transcript && result.transcript.length > 0) {
        setTranscript(result.transcript);
      }

      // Process interview with our new service
      console.log('🎯 Processing interview with OpenAI...');
      
      // Debug logging before sending
      console.log('🔍 TRANSCRIPT DEBUG:', {
        transcriptLength: transcriptToUse.length,
        firstMessage: transcriptToUse[0],
        lastMessage: transcriptToUse[transcriptToUse.length - 1],
        allMessages: transcriptToUse
      });
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/evi-interviews/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionDataBeforeEnd.sessionId, // Always use the DB session ID
            userId: user?.id || 'guest',
            experienceId: experienceId,
            jobTitle: job?.title || 'Combined Interview',
            company: job?.company || 'All Experiences',
            jobDescription: job?.description || 'Interview covering all work experiences',
            duration: job?.duration || '',
            transcript: transcriptToUse,
            emotions: transcriptToUse, // Hume emotions are in the transcript
            totalDurationSeconds: currentTime,
            humeSessionId: sessionDataBeforeEnd.sessionId,
            humeConfigId: sessionDataBeforeEnd.configId,
            selectedVoice: selectedVoice
            // Note: Audio recording will be handled separately
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const processedResult = await response.json();
        console.log('✅ Interview processed successfully:', processedResult);
        console.log('📊 Full response data structure:', JSON.stringify(processedResult, null, 2));
        console.log('🎯 Achievements data:', processedResult.data?.achievements);

        // Store the achievements for display
        setInterviewSummary(processedResult.data);
        
        // Save the completed session ID for transcript retrieval
        if (processedResult.data.sessionId) {
          console.log('📝 Setting completed session ID:', processedResult.data.sessionId);
          setCompletedSessionId(processedResult.data.sessionId);
        } else {
          console.warn('⚠️ No session ID in backend response');
        }
        
        // Create enriched data for callback
        const enrichedData = {
          transcript: result.transcript || transcript,
          sessionId: processedResult.data.sessionId || sessionDataBeforeEnd.sessionId,
          interviewDate: new Date(),
          voiceUsed: selectedVoice,
          duration: currentTime,
          directConnection: true,
          achievements: processedResult.data.achievements
        };

        toast({
          title: "Interview Complete!",
          description: `Extracted ${processedResult.data.achievements?.achievements?.length || 0} key achievements`
        });
        
        // Trigger parent callback to refresh interview statuses
        if (onInterviewComplete) {
          console.log('🔄 Triggering parent callback to refresh statuses');
          onInterviewComplete(enrichedData);
        }

      } catch (processingError) {
        console.error('❌ Error processing interview:', processingError);
        
        // Even if processing failed, we should still notify parent to refresh
        const fallbackData = {
          transcript: result.transcript || transcript,
          sessionId: sessionDataBeforeEnd.sessionId,
          interviewDate: new Date(),
          voiceUsed: selectedVoice,
          duration: currentTime,
          directConnection: true
        };
        
        if (onInterviewComplete) {
          onInterviewComplete(fallbackData);
        }
        
        toast({
          title: "Interview Saved",
          description: "Interview was saved successfully. You can view the transcript.",
          variant: "default"
        });
      }

      console.log('✅ Interview completed successfully');
      
      // Automatically transition to completed stage
      setStage('completed');
      
    } catch (error) {
      console.error('❌ Error completing interview:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        currentSession,
        transcriptLength: transcript.length
      });
      
      toast({
        title: "Completion Error",
        description: `Failed to complete interview: ${error.message}`,
        variant: "destructive"
      });
      
      // Don't change stage on error - let user try again
    } finally {
      setIsCompleting(false);
    }
  };

  const handleClose = () => {
    cleanup();
    setStage('initial');
    setIsRecording(false);
    setIsListening(false);
    setTranscript([]);
    setCurrentTime(0);
    setConnectionStatus('disconnected');
    setErrorMessage('');
    setInterviewSummary(null);
    setSelectedVoice('voice1');
    setCurrentSession(null);
    setIsAIPlaying(false);
    setShouldAutoComplete(false);
    setIsCompleting(false);
    setCompletedSessionId(null);
    setFullTranscriptFromDB(null);
    onClose();
  };

  const renderInitialStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Mic className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Real-Time AI Interview: {job?.title || 'Combined Interview'}</h3>
          <p className="text-muted-foreground">{job?.company || 'All Experiences'} {job?.duration ? `• ${job.duration}` : ''}</p>
        </div>
      </div>

      <Card className="p-4 bg-muted/50">
        <h4 className="font-medium mb-2">🎯 Enhance Your Profile with AI-Powered Interview:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Build your digital presence</strong> - Your responses create an interactive profile that recruiters can engage with</li>
          <li>• <strong>Share your achievements</strong> - Discuss specific projects, metrics, and daily responsibilities in detail</li>
          <li>• <strong>AI-guided conversation</strong> - Based on top industry interview practices to highlight what matters most</li>
          <li>• <strong>Quick & efficient</strong> - Complete in just 5 minutes with natural conversation flow</li>
          <li>• <strong>Enhance your marketability</strong> - Your detailed responses will be analyzed to showcase your expertise</li>
          <li>• <strong>How it works</strong> - The AI will greet you, then ask about your role; simply speak naturally and share your experiences</li>
        </ul>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Cancel
        </Button>
        <Button 
          onClick={handleStartInterview} 
          className="flex-1 bg-gradient-primary"
          disabled={isStarting || connectionStatus === 'connecting' || !!currentSession}
        >
          {isStarting || connectionStatus === 'connecting' ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            'Start Direct Interview'
          )}
        </Button>
      </div>
    </div>
  );


  const renderConnectingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Connecting to EVI...</h3>
          <p className="text-muted-foreground">
            Setting up real-time voice connection and initializing your interview
          </p>
        </div>
      </div>
      
      <Card className="p-4 bg-muted/50">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Please wait while we establish your real-time conversation with Hume's Empathic Voice Interface
          </p>
        </div>
      </Card>
    </div>
  );

  const renderInterviewingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors ${
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
        <div>
          <h3 className="text-xl font-semibold">Real-Time Interview in Progress</h3>
          <div className="space-y-1">
            <p className="text-lg font-mono">{formatTime(currentTime)}</p>
            <p className={`text-sm font-mono ${getTimeColor(currentTime)}`}>
              {currentTime >= MAX_INTERVIEW_DURATION ? (
                'TIME EXCEEDED'
              ) : (
                `${getRemainingTime(currentTime)} remaining`
              )}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
            {isAIPlaying && (
              <>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>AI Speaking...</span>
              </>
            )}
            {isListening && !isAIPlaying && (
              <>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>Listening for your response...</span>
              </>
            )}
          </div>
        </div>
      </div>

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
              <strong>{message.type === 'assistant_message' ? 'AI:' : 'You:'}</strong> {message.content}
            </div>
          ))}
          {transcript.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              <div className="animate-pulse">Waiting for conversation to begin...</div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-center">
        <Button 
          onClick={handleCompleteInterview}
          className="px-8 bg-gradient-primary"
          disabled={transcript.length < 2 || isCompleting}
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
    </div>
  );

  const renderErrorStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Connection Error</h3>
          <p className="text-muted-foreground">There was an issue connecting to the interview service</p>
        </div>
      </div>

      <Card className="p-4 bg-red-50 border-red-200">
        <h4 className="font-medium text-red-800 mb-2">Error Details:</h4>
        <p className="text-sm text-red-700">{errorMessage || 'An unexpected error occurred'}</p>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Close
        </Button>
        <Button onClick={handleStartInterview} className="flex-1 bg-gradient-primary">
          Try Again
        </Button>
      </div>
    </div>
  );

  const renderCompletedStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Target className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Real-Time Interview Complete!</h3>
          <p className="text-muted-foreground">Here's what we discovered about your experience</p>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h4 className="font-medium">Key Achievements Identified</h4>
          </div>
          {interviewSummary?.achievements ? (
            interviewSummary.achievements.achievements && interviewSummary.achievements.achievements.length > 0 ? (
              <div className="space-y-3">
                <ul className="text-sm space-y-2">
                  {interviewSummary.achievements.achievements.map((achievement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{achievement.text}</span>
                    </li>
                  ))}
                </ul>
                {interviewSummary.achievements.summary && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">
                      Total achievements: {interviewSummary.achievements.summary.totalAchievements} • 
                      Categories: {interviewSummary.achievements.summary.dominantCategories.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Not enough information was provided during the interview to extract specific achievements.</p>
                <p className="text-xs">Please take the interview again and share more details about your accomplishments, challenges overcome, and impact made in this role.</p>
              </div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">
              Processing achievements with AI...
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h4 className="font-medium">Interview Summary</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Duration:</span>
              <p className="font-medium">{formatTime(currentTime)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Messages:</span>
              <p className="font-medium">{transcript.length}</p>
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
          View Transcript
        </Button>
        <Button onClick={handleClose} className="flex-1 bg-gradient-primary">
          Done
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Real-Time AI Interview</DialogTitle>
            <DialogDescription className="sr-only">
              Interactive voice interview to enhance your job experience details
            </DialogDescription>
          </DialogHeader>
          {stage === 'initial' && renderInitialStage()}
          {stage === 'connecting' && renderConnectingStage()}
          {stage === 'interviewing' && renderInterviewingStage()}
          {stage === 'completed' && renderCompletedStage()}
          {stage === 'error' && renderErrorStage()}
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Real-Time Interview Transcript</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Duration: {formatTime(currentTime)}</span>
              <Separator orientation="vertical" className="h-4" />
              <span>{job?.title || 'Combined Interview'} {job?.company ? `at ${job.company}` : ''}</span>
            </div>
            <Separator />
            <div className="space-y-4">
              {(fullTranscriptFromDB || transcript).map((message, index) => (
                <div key={index} className={`p-3 rounded-lg ${
                  message.type === 'assistant_message' 
                    ? 'bg-primary/5 border-l-4 border-primary' 
                    : 'bg-muted/50 border-l-4 border-muted-foreground'
                }`}>
                  <div className="text-sm font-medium mb-1">
                    {message.type === 'assistant_message' ? 'AI Interviewer' : 'You'}
                  </div>
                  <div className="text-sm">
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}