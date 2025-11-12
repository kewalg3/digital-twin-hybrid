import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, Loader2, AlertTriangle, Volume2 } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, useRoomContext, useParticipants, useDataChannel, useTracks } from '@livekit/components-react';
import { Room, DataPacket_Kind, Participant, Track, RemoteParticipant } from 'livekit-client';
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";

// Define message type for LiveKit transcripts (same as EVIMessage structure)
type LiveKitMessage = {
  type: 'assistant_message' | 'user_message';
  content: string;
  timestamp: string;
};

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
  allExperiences?: Experience[];
}

interface ExperienceLiveKitInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  experienceId?: string;
  onInterviewComplete?: (enrichedData: any) => void;
}

// Same stages as EVIInterviewDialog to maintain exact UX
type InterviewStage = 'initial' | 'connecting' | 'interviewing' | 'completed' | 'error';

export default function ExperienceLiveKitInterviewDialog({
  isOpen,
  onClose,
  job,
  experienceId,
  onInterviewComplete
}: ExperienceLiveKitInterviewDialogProps) {
  const { user } = useAuthStore();
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<LiveKitMessage[]>([]);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [isAIPlaying, setIsAIPlaying] = useState(false);
  const [shouldAutoComplete, setShouldAutoComplete] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<LiveKitMessage[] | null>(null);
  const { toast } = useToast();

  // LiveKit specific state
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersSetup = useRef<boolean>(false);
  const timeoutWarningShown = useRef<boolean>(false);
  const autoCompletionTriggered = useRef<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Experience Enhancement interviews are 15 minutes (same as current Hume)
  const isCombinedInterview = job?.allExperiences && job.allExperiences.length > 0;
  const MAX_INTERVIEW_DURATION = 900; // 15 minutes for experience enhancement
  const WARNING_TIME = 780; // Warning at 13 minutes

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStage('initial');
    setTranscript([]);
    setCurrentTime(0);
    setIsRecording(false);
    setIsListening(false);
    setConnectionStatus('disconnected');
    setErrorMessage('');
    setShouldAutoComplete(false);
    setIsCompleting(false);
    messageHandlersSetup.current = false;
    timeoutWarningShown.current = false;
    autoCompletionTriggered.current = false;
  };

  const startInterview = async () => {
    if (!user?.id) {
      toast({
        title: "Authentication Error",
        description: "Please log in to start the interview",
        variant: "destructive",
      });
      return;
    }

    if (!job) {
      toast({
        title: "Error",
        description: "Job information is required to start the interview",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);
    setStage('connecting');
    setConnectionStatus('connecting');
    setErrorMessage('');

    try {
      console.log('🎯 Starting LiveKit Experience Enhancement interview...');

      // Prepare experience data for the agent
      const experienceData = isCombinedInterview ? job.allExperiences : [job];

      const requestBody = {
        candidateId: user.id,
        recruiterName: 'Sarah', // Default interviewer name as per Hume system
        recruiterEmail: 'sarah@interviewer.com',
        recruiterTitle: 'Senior Recruiter',
        company: 'Interview Platform',
        jobTitle: job.title,
        jobDescription: job.description,
        interviewType: 'experience_enhancement', // Specific interview type
        experienceData // Pass experience data for context
      };

      console.log('📝 Sending interview request:', requestBody);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/interviews/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ LiveKit interview started:', data);

      setLivekitToken(data.token);
      setRoomName(data.roomName);
      setDispatchId(data.dispatchId);
      setServerUrl(data.serverUrl);
      setCompletedSessionId(data.roomName); // Use roomName as session identifier

      // Move to interviewing stage
      setStage('interviewing');
      setConnectionStatus('connected');
      startTimer();

    } catch (error) {
      console.error('❌ Error starting interview:', error);
      setStage('error');
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');

      toast({
        title: "Interview Start Failed",
        description: error instanceof Error ? error.message : 'Failed to start the interview',
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const newTime = prev + 1;

        // Warning at 13 minutes
        if (newTime >= WARNING_TIME && !timeoutWarningShown.current) {
          timeoutWarningShown.current = true;
          toast({
            title: "Interview Time Warning",
            description: "You have about 2 minutes left in this interview.",
          });
        }

        // Auto-complete at 15 minutes
        if (newTime >= MAX_INTERVIEW_DURATION && !autoCompletionTriggered.current) {
          autoCompletionTriggered.current = true;
          setShouldAutoComplete(true);
        }

        return newTime;
      });
    }, 1000);
  };

  const handleCompleteInterview = async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    console.log('🏁 Completing Experience Enhancement interview...');

    try {
      // For now, just move to completed stage
      // TODO: Process transcript and extract achievements like Hume system
      setStage('completed');

      if (onInterviewComplete) {
        const mockEnrichedData = {
          achievements: transcript.filter(msg => msg.type === 'assistant_message').map(msg => ({
            text: msg.content,
            category: 'experience'
          })),
          transcript: transcript,
          interviewType: 'experience_enhancement'
        };
        onInterviewComplete(mockEnrichedData);
      }

      toast({
        title: "Interview Completed",
        description: "Your experience enhancement interview has been processed successfully.",
      });

    } catch (error) {
      console.error('❌ Error completing interview:', error);
      toast({
        title: "Completion Error",
        description: "Failed to process the interview. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
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

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  // LiveKit Room Component
  const LiveKitExperienceRoom = ({ token, serverUrl, roomName }: { token: string; serverUrl: string; roomName: string }) => {
    return (
      <LiveKitRoom
        video={false}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        data-lk-theme="default"
        style={{ height: '0px' }} // Hidden audio-only room
        onConnected={() => {
          console.log('✅ Connected to LiveKit room');
          setConnectionStatus('connected');
          setIsRecording(true);
        }}
        onDisconnected={() => {
          console.log('🔌 Disconnected from LiveKit room');
          setConnectionStatus('disconnected');
          setIsRecording(false);
        }}
        onError={(error) => {
          console.error('❌ LiveKit room error:', error);
          setConnectionStatus('error');
          setErrorMessage(error.message);
        }}
      >
        <ExperienceRoomContent onTranscriptUpdate={(messages) => setTranscript(messages)} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    );
  };

  // Room content component to handle real-time updates
  const ExperienceRoomContent = ({ onTranscriptUpdate }: { onTranscriptUpdate: (messages: LiveKitMessage[]) => void }) => {
    const room = useRoomContext();
    const participants = useParticipants();
    const tracks = useTracks();

    useEffect(() => {
      if (!room || messageHandlersSetup.current) return;

      const handleDataReceived = (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const decoder = new TextDecoder();
          const message = JSON.parse(decoder.decode(payload));
          console.log('📨 Received data message:', message);

          if (message.type === 'transcript_update') {
            const newMessage: LiveKitMessage = {
              type: message.role === 'agent' ? 'assistant_message' : 'user_message',
              content: message.content,
              timestamp: new Date().toISOString()
            };

            setTranscript(prev => {
              const updated = [...prev, newMessage];
              onTranscriptUpdate(updated);
              return updated;
            });
          }

          if (message.type === 'agent_speaking') {
            setIsAIPlaying(message.speaking);
          }

          if (message.type === 'agent_listening') {
            setIsListening(message.listening);
          }
        } catch (error) {
          console.error('❌ Error parsing data message:', error);
        }
      };

      room.on('dataReceived', handleDataReceived);
      messageHandlersSetup.current = true;

      return () => {
        room.off('dataReceived', handleDataReceived);
        messageHandlersSetup.current = false;
      };
    }, [room, onTranscriptUpdate]);

    // Monitor agent participant for speaking state
    useEffect(() => {
      const agentParticipant = participants.find(p => p.identity.includes('agent'));
      if (agentParticipant) {
        const audioTrack = agentParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        if (audioTrack) {
          setIsAIPlaying(true);
          // Note: This is a simplified approach. In practice, you'd want more sophisticated audio level monitoring
        }
      }
    }, [participants, tracks]);

    return null; // This component only handles data, no UI rendering
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-semibold">
            Experience Enhancement Interview
          </DialogTitle>
          <DialogDescription>
            {stage === 'initial' && "Ready to enhance your experience with AI-powered insights?"}
            {stage === 'connecting' && "Connecting to interview session..."}
            {stage === 'interviewing' && "Interview in progress - Share your experiences"}
            {stage === 'completed' && "Interview completed successfully!"}
            {stage === 'error' && "Something went wrong"}
          </DialogDescription>
        </DialogHeader>

        {/* LiveKit Room - Only render when we have connection details */}
        {stage === 'interviewing' && livekitToken && serverUrl && roomName && (
          <LiveKitExperienceRoom token={livekitToken} serverUrl={serverUrl} roomName={roomName} />
        )}

        <div className="flex-1 overflow-hidden">
          {stage === 'initial' && (
            <div className="space-y-6 p-6">
              <Card className="p-6">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <Target className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-medium">Enhance Your Experience</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Our AI interviewer will help you explore and enhance the details of your professional experiences,
                    extracting key achievements and insights from your career journey.
                  </p>

                  {job && (
                    <div className="bg-muted rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{job.title}</Badge>
                        <span className="text-sm text-muted-foreground">at {job.company}</span>
                      </div>
                      {isCombinedInterview && job.allExperiences && (
                        <p className="text-sm text-muted-foreground">
                          {job.allExperiences.length} experience{job.allExperiences.length > 1 ? 's' : ''} to enhance
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={startInterview}
                    disabled={isStarting}
                    size="lg"
                    className="w-full max-w-xs"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 mr-2" />
                        Start Interview
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {stage === 'connecting' && (
            <div className="space-y-6 p-6">
              <Card className="p-6">
                <div className="text-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                  <h3 className="text-lg font-medium">Connecting to Interview</h3>
                  <p className="text-muted-foreground">
                    Preparing your personalized interview session...
                  </p>
                </div>
              </Card>
            </div>
          )}

          {stage === 'interviewing' && (
            <div className="space-y-4 p-6">
              {/* Interview Status */}
              <div className="flex items-center justify-between bg-muted rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="font-medium">
                    {connectionStatus === 'connected' ? 'Interview Active' : 'Connecting...'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(currentTime)}</span>
                  </div>
                  {isAIPlaying && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Volume2 className="w-4 h-4" />
                      <span>AI Speaking</span>
                    </div>
                  )}
                  {isListening && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Mic className="w-4 h-4" />
                      <span>Listening</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript Display */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">Live Transcript</h4>
                  <Badge variant="outline">{transcript.length} messages</Badge>
                </div>

                <div
                  ref={transcriptContainerRef}
                  className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-3"
                >
                  {transcript.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-8">
                      Transcript will appear here as the conversation progresses...
                    </p>
                  ) : (
                    transcript.map((message, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded text-sm ${
                          message.type === 'assistant_message'
                            ? 'bg-blue-50 border-l-2 border-blue-300'
                            : 'bg-gray-50 border-l-2 border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-xs mb-1">
                          {message.type === 'assistant_message' ? '🤖 AI Interviewer' : '👤 You'}
                        </div>
                        <div>{message.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Complete Interview Button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleCompleteInterview}
                  disabled={isCompleting}
                  variant="outline"
                  size="lg"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Complete Interview
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {stage === 'completed' && (
            <div className="space-y-6 p-6">
              <Card className="p-6">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <TrendingUp className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-medium">Interview Completed!</h3>
                  <p className="text-muted-foreground">
                    Your experience enhancement interview has been processed successfully.
                    {transcript.length > 0 && ` We captured ${transcript.length} conversation exchanges.`}
                  </p>

                  <div className="flex gap-3 justify-center">
                    <Button onClick={() => setShowTranscriptDialog(true)} variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      View Transcript
                    </Button>
                    <Button onClick={handleClose}>
                      Done
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-6 p-6">
              <Card className="p-6">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-medium">Interview Error</h3>
                  <p className="text-muted-foreground">
                    {errorMessage || "Something went wrong during the interview."}
                  </p>

                  <div className="flex gap-3 justify-center">
                    <Button onClick={() => { cleanup(); setStage('initial'); }} variant="outline">
                      Try Again
                    </Button>
                    <Button onClick={handleClose}>
                      Close
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Transcript Dialog */}
        <Dialog open={showTranscriptDialog} onOpenChange={setShowTranscriptDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Experience Enhancement Interview Transcript</DialogTitle>
              <DialogDescription>
                Complete conversation from your experience enhancement session
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-2">
              {(fullTranscriptFromDB || transcript).map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded text-sm ${
                    message.type === 'assistant_message'
                      ? 'bg-blue-50 border-l-2 border-blue-300'
                      : 'bg-gray-50 border-l-2 border-gray-300'
                  }`}
                >
                  <div className="font-medium text-xs mb-1 text-muted-foreground">
                    {message.type === 'assistant_message' ? '🤖 AI Interviewer' : '👤 You'} • {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                  <div>{message.content}</div>
                </div>
              ))}

              {transcript.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No conversation recorded yet.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}