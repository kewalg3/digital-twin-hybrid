import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, Loader2, AlertTriangle, Volume2 } from "lucide-react";
import { directHumeEVI } from "@/services/directHumeEVISDK";
import type { EVISessionData, EVIMessage } from "@/services/directHumeEVISDK";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";

interface WorkStyleInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInterviewComplete?: (data: any) => void;
}

type InterviewStage = 'initial' | 'connecting' | 'interviewing' | 'completed' | 'error';

export default function WorkStyleInterviewDialog({ isOpen, onClose, onInterviewComplete }: WorkStyleInterviewDialogProps) {
  const { user } = useAuthStore();
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<EVIMessage[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSession, setCurrentSession] = useState<EVISessionData | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [shouldAutoComplete, setShouldAutoComplete] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<EVIMessage[] | null>(null);
  const [microphoneStatus, setMicrophoneStatus] = useState<'unknown' | 'testing' | 'granted' | 'denied'>('unknown');
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const { toast } = useToast();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersSetup = useRef<boolean>(false);
  const timeoutWarningShown = useRef<boolean>(false);
  const autoCompletionTriggered = useRef<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Timeout constants
  const MAX_INTERVIEW_DURATION = 300; // 5 minutes in seconds
  const WARNING_TIME = 240; // Show warning at 4 minutes

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Only cleanup timer on unmount, not the whole directHumeEVI
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const cleanup = () => {
    console.log('🧹 Cleaning up Work Style interview component');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    messageHandlersSetup.current = false;
    timeoutWarningShown.current = false;
    autoCompletionTriggered.current = false;
    // Only cleanup directHumeEVI when dialog is actually closing
    // Not on every isOpen change which could clear active handlers
    if (!isOpen) {
      directHumeEVI.cleanup();
    }
  };

  // Auto-scroll to bottom when transcript changes
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // Timer effect - for display only, let Hume handle the actual timeout
  useEffect(() => {
    if (isRecording && stage === 'interviewing') {
      timerRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const newTime = prev + 1;
          
          // Show warning at 4 minutes (for UI only)
          if (newTime === WARNING_TIME && !timeoutWarningShown.current) {
            console.log('⏰ 4-minute warning reached');
            timeoutWarningShown.current = true;
          }
          
          // Don't trigger auto-completion - let Hume handle the timeout
          // Hume will send session_ended event when it's ready
          
          return newTime;
        });
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
  }, [isRecording, stage]);

  // Auto-complete trigger
  useEffect(() => {
    if (shouldAutoComplete && stage === 'interviewing' && !isCompleting) {
      console.log('🚨 Auto-complete triggered by timer');
      handleCompleteInterview();
      setShouldAutoComplete(false);
    }
  }, [shouldAutoComplete]);

  // Setup message handlers function
  const setupMessageHandlers = () => {
    console.log('🎯 Setting up message handlers for Work Style interview');
    
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

    directHumeEVI.onMessage('assistant_end', () => {
      console.log('🏁 Assistant finished speaking');
      setIsAIPlaying(false);
    });

    directHumeEVI.onMessage('timeout_warning', (message: any) => {
      console.log('⏰ Timeout warning received from Hume:', message);
      toast({
        title: "Interview Timeout Warning",
        description: "The interview will end soon. Please wrap up your current response.",
        variant: "default"
      });
    });

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
      if (message.type === 'chat_metadata') {
        console.log('📊 Chat metadata details:', JSON.stringify(message, null, 2));
      }
    });

    directHumeEVI.onMessage('connected', async () => {
      console.log('✅ Work Style EVI connected');
      
      // Start recording automatically when connection is ready
      try {
        await directHumeEVI.startRecording();
        setIsRecording(true);
        setIsListening(true);
        console.log('✅ Recording started automatically for Work Style interview');
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
      console.log('🔌 Work Style EVI disconnected');
    });

    directHumeEVI.onMessage('error', (error: any) => {
      console.error('❌ Interview error:', error);
      
      // Don't treat timeout as an error - just like Experience Enhancement
      if (error.message?.includes('exceeded the max duration')) {
        console.log('⏰ Timeout notification (not an error)');
        return;
      }
      
      // For real errors, show toast but don't change stage immediately
      toast({
        title: "Interview Error",
        description: error.message || "An error occurred during the interview",
        variant: "destructive"
      });
      
      // Only set error stage for connection/critical errors
      if (error.code === 'CONNECTION_ERROR' || !error.message) {
        setErrorMessage(error.message || 'An error occurred');
        setStage('error');
      }
    });

    // Removed duplicate evi_error handler - the 'error' handler above handles all errors

    messageHandlersSetup.current = true;
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

  const testMicrophone = async () => {
    setMicrophoneStatus('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('🎤 Microphone test successful');
      setMicrophoneStatus('granted');
      
      // Clean up the test stream
      stream.getTracks().forEach(track => track.stop());
      
      toast({
        title: "Microphone Working",
        description: "Your microphone is ready for the interview.",
      });
    } catch (error) {
      console.error('🎤 Microphone test failed:', error);
      setMicrophoneStatus('denied');
      
      toast({
        title: "Microphone Issue",
        description: error.name === 'NotAllowedError' 
          ? "Please allow microphone access in your browser."
          : "Please connect a microphone and try again.",
        variant: "destructive",
      });
    }
  };

  const handleStartInterview = async () => {
    if (isStarting) return;
    
    try {
      setIsStarting(true);
      setStage('connecting');
      setErrorMessage('');
      
      if (!user?.id) {
        throw new Error('Please log in to start the interview');
      }

      console.log('🚀 Starting Work Style interview for user:', user.id);
      
      const session = await directHumeEVI.startInterview(
        user.id,
        'work_style',
        {
          title: 'Work Style Assessment',
          company: 'Work Style Discussion',
          duration: '',
          description: 'Understanding work preferences and collaboration style',
          skills: [],
          software: [],
          experienceId: 'work-style-interview' // Special ID for work style interviews
        }
      );
      
      setCurrentSession(session);
      setStage('interviewing');
      setIsRecording(true);
      setTranscript([]);
      setCurrentTime(0);
      
      // Set up message handlers AFTER successful connection
      setupMessageHandlers();
      
      toast({
        title: "Interview Started",
        description: "Your work style interview has begun. Feel free to share your thoughts naturally.",
      });
      
    } catch (error) {
      console.error('❌ Failed to start interview:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start interview');
      setStage('error');
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to start interview',
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleCompleteInterview = async () => {
    if (isCompleting || stage !== 'interviewing') {
      console.log('⚠️ Interview completion already in progress or not in interviewing stage');
      return;
    }

    try {
      setIsCompleting(true);
      // Don't stop recording immediately - let it continue until after endInterview
      // This allows Hume's timeout audio message to play
      
      console.log('🏁 Completing Work Style interview...');
      
      // Get current transcript before ending
      const currentTranscript = directHumeEVI.getTranscript();
      console.log('📜 Current transcript from directHumeEVI:', currentTranscript);
      console.log('📜 State transcript:', transcript);
      
      // Use state transcript if directHumeEVI transcript is empty
      const transcriptToUse = currentTranscript.length > 0 ? currentTranscript : transcript;
      
      // If AI is currently playing audio, wait for it to finish
      if (isAIPlaying) {
        console.log('🎵 AI is speaking, waiting 3 seconds for audio to complete...');
        toast({
          title: "Please wait",
          description: "Allowing AI to finish speaking...",
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // End the Hume interview
      console.log('🏁 Ending interview...');
      let finalTranscript = transcriptToUse;
      let finalSessionId = currentSession?.sessionId;
      
      try {
        const result = await directHumeEVI.endInterview(finalSessionId, transcriptToUse);
        finalTranscript = result.transcript.length > 0 ? result.transcript : transcriptToUse;
        finalSessionId = result.sessionId || finalSessionId;
      } catch (endError) {
        console.warn('⚠️ Error ending Hume session, but continuing:', endError);
      }
      
      // Now stop recording after the interview has ended
      setIsRecording(false);
      setIsListening(false);
      
      // Process interview with backend service
      console.log('🎯 Processing work style interview with OpenAI...');
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/evi-interviews/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: finalSessionId || `workstyle-${Date.now()}`,
            userId: user?.id || 'guest',
            experienceId: 'work-style-interview', // Special ID for work style interviews
            jobTitle: 'Work Style Assessment',
            company: 'Work Style Discussion',
            jobDescription: 'Understanding work preferences and collaboration style',
            duration: 'N/A',
            transcript: finalTranscript,
            emotions: finalTranscript,
            totalDurationSeconds: currentTime,
            humeSessionId: finalSessionId,
            humeConfigId: currentSession?.configId,
            selectedVoice: 'default',
            interviewType: 'work_style'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const processedResult = await response.json();
        console.log('✅ Work style interview processed successfully:', processedResult);
        
        // Store the insights for display
        setInterviewSummary(processedResult.data);
        
        // Set the completed session ID from backend response
        if (processedResult.data.sessionId) {
          console.log('📝 Setting completed session ID:', processedResult.data.sessionId);
          setCompletedSessionId(processedResult.data.sessionId);
        }
        
        // Set transcript from the result
        if (processedResult.data.transcript) {
          setTranscript(processedResult.data.transcript);
        }
        
        toast({
          title: "Interview Complete!",
          description: "Your work style preferences have been analyzed."
        });
        
        // Notify parent component if callback provided
        if (onInterviewComplete) {
          onInterviewComplete({
            sessionId: finalSessionId,
            workStyle: processedResult.data.achievements,
            transcript: finalTranscript,
            completedAt: new Date()
          });
        }

      } catch (processingError) {
        console.error('❌ Error processing work style interview:', processingError);
        toast({
          title: "Processing Warning",
          description: "Interview saved but insights extraction failed",
          variant: "destructive"
        });
      }
      
      // Transition to completed stage
      setStage('completed');
      
    } catch (error) {
      console.error('❌ Error completing interview:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete interview');
      
      toast({
        title: "Error",
        description: "Failed to save interview. Please try again.",
        variant: "destructive",
      });
      
      // Still transition to completed stage even if there's an error
      setTranscript(directHumeEVI.getTranscript());
      setStage('completed');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleClose = () => {
    // Clean up directHumeEVI completely when closing
    directHumeEVI.cleanup();
    cleanup();
    setStage('initial');
    setIsRecording(false);
    setIsListening(false);
    setTranscript([]);
    setCurrentTime(0);
    setCurrentSession(null);
    setIsCompleting(false);
    setErrorMessage('');
    setCompletedSessionId(null);
    setFullTranscriptFromDB(null);
    setInterviewSummary(null);
    setShowTranscriptDialog(false);
    onClose();
  };

  const renderInitialStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-primary/10 rounded-full">
          <Target className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Work Style Interview</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Let's have a conversation about your work preferences and collaboration style. This helps us understand what environment you thrive in.
        </p>
      </div>

      <Card className="p-6 bg-muted/50">
        <h4 className="font-semibold mb-3">What we'll discuss:</h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Your preferred work style and environment</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>How you collaborate with teams and handle leadership</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Your approach to challenges and pressure</span>
          </li>
        </ul>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>Duration: ~5 minutes</span>
        </div>
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4" />
          <span>Voice interview</span>
        </div>
      </div>


      {microphoneStatus === 'testing' && (
        <Button disabled className="w-full mb-3">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Testing Microphone...
        </Button>
      )}

      {microphoneStatus === 'granted' && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-700">Microphone ready</span>
          </div>
        </div>
      )}

      {microphoneStatus === 'denied' && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">Microphone access required</span>
          </div>
          <p className="text-xs text-red-600 mt-1">
            Click the microphone icon in your browser's address bar and select "Allow"
          </p>
        </div>
      )}

      <Button 
        onClick={handleStartInterview} 
        disabled={isStarting || !user?.id || microphoneStatus === 'denied'} 
        className="w-full" 
        size="lg"
      >
        {isStarting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Starting...
          </>
        ) : (
          'Start Work Style Interview'
        )}
      </Button>
      
      {!user?.id && (
        <p className="text-sm text-destructive text-center">
          Please log in to start the interview
        </p>
      )}
    </div>
  );

  const renderConnectingStage = () => (
    <div className="flex flex-col items-center justify-center space-y-4 py-12">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-lg">Setting up your interview...</p>
      <p className="text-sm text-muted-foreground">This will take just a moment</p>
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
          <h3 className="text-xl font-semibold">Work Style Interview in Progress</h3>
          <p className={`text-lg font-mono ${getTimeColor(currentTime)}`}>
            {currentTime >= MAX_INTERVIEW_DURATION ? (
              'TIME EXCEEDED'
            ) : (
              `${getRemainingTime(currentTime)} remaining`
            )}
          </p>
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
    }
  };

  const renderCompletedStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Target className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Work Style Interview Complete!</h3>
          <p className="text-muted-foreground">Here's what we learned about your work preferences</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Work Style Insights */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h4 className="font-medium">Work Style Insights</h4>
          </div>
          {interviewSummary?.achievements ? (
            <div className="space-y-3">
              {interviewSummary.achievements.workStyle ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Preferred Environment:</span>
                    <p className="text-muted-foreground">{interviewSummary.achievements.workStyle.preferredEnvironment}</p>
                  </div>
                  <div>
                    <span className="font-medium">Collaboration Style:</span>
                    <p className="text-muted-foreground">{interviewSummary.achievements.workStyle.collaborationStyle}</p>
                  </div>
                  <div>
                    <span className="font-medium">Work Pace:</span>
                    <p className="text-muted-foreground">{interviewSummary.achievements.workStyle.workPace}</p>
                  </div>
                </div>
              ) : (
                <ul className="text-sm space-y-2">
                  {interviewSummary.achievements.achievements?.map((achievement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{achievement.text}</span>
                    </li>
                  )) || [
                    <li key="default" className="text-muted-foreground">
                      Processing work style insights...
                    </li>
                  ]}
                </ul>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Processing insights with AI...
            </div>
          )}
        </Card>


        {/* Interview Summary */}
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
          <FileText className="w-4 h-4 mr-2" />
          View Full Transcript
        </Button>
        <Button onClick={handleClose} className="flex-1 bg-gradient-primary">
          Done
        </Button>
      </div>
    </div>
  );

  const renderErrorStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-destructive/10 rounded-full">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold">Interview Error</h3>
        <p className="text-sm text-destructive max-w-md mx-auto">
          {errorMessage || 'An unexpected error occurred during the interview.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleStartInterview} variant="outline" className="flex-1">
          Try Again
        </Button>
        <Button onClick={handleClose} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );

  const renderStage = () => {
    switch (stage) {
      case 'initial':
        return renderInitialStage();
      case 'connecting':
        return renderConnectingStage();
      case 'interviewing':
        return renderInterviewingStage();
      case 'completed':
        return renderCompletedStage();
      case 'error':
        return renderErrorStage();
      default:
        return null;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Work Style</DialogTitle>
            <DialogDescription>
              Let's understand your work preferences and collaboration style
            </DialogDescription>
          </DialogHeader>
          
          {renderStage()}
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Work Style Interview Transcript</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[65vh]">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Duration: {formatTime(currentTime)}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <span>Work Style Assessment</span>
            </div>
            <Separator />
            <div className="space-y-4">
              {(fullTranscriptFromDB || transcript).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transcript available</p>
              ) : (
                (fullTranscriptFromDB || transcript).map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg ${
                    message.type === 'assistant_message' 
                      ? 'bg-primary/5 border-l-4 border-primary' 
                      : 'bg-muted/50 border-l-4 border-muted-foreground'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {message.type === 'assistant_message' ? 'AI Interviewer' : 'You'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div className="text-sm">
                      {message.content}
                    </div>
                  </div>
                ))
              )}
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