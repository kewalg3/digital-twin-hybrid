import { useState, useEffect, useRef } from "react";
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
import { LiveKitRoom, RoomAudioRenderer, useRoomContext, useParticipants, useDataChannel, useTracks } from '@livekit/components-react';
import { Room, DataPacket_Kind, Participant, Track, RemoteParticipant } from 'livekit-client';

// Define message type for LiveKit transcripts (similar to EVIMessage)
type LiveKitMessage = {
  type: 'assistant_message' | 'user_message';
  content: string;
  timestamp: string;
};

interface ProfileVoiceInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  candidateData: any; // Will contain all user profile data
}

type InterviewStage = 'initial' | 'recording' | 'saving' | 'processing' | 'brief';

export default function ProfileLiveKitInterviewDialog({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  candidateData
}: ProfileVoiceInterviewDialogProps) {
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<LiveKitMessage[]>([]);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [aiIsSpeaking, setAiIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interviewSummary, setInterviewSummary] = useState<any | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<LiveKitMessage[] | null>(null);
  const interviewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const messageHandlersSetup = useRef(false);

  // LiveKit specific state
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  
  // Recruiter context state - with email for creating recruiter record
  const [recruiterContext, setRecruiterContext] = useState({
    recruiterName: "",
    recruiterEmail: "", // Added for recruiter record creation
    recruiterTitle: "",
    recruiterLinkedin: "",
    recruiterPhone: "",
    company: "",
    position: "",
    jobDescription: ""
  });

  // Store recruiterId from backend
  const [recruiterId, setRecruiterId] = useState<string | null>(null);

  // Helper function to get initials from full name
  const getInitials = (fullName: string): string => {
    if (!fullName) return '';
    
    const parts = fullName.trim().split(' ').filter(part => part.length > 0);
    if (parts.length === 0) return '';
    
    const firstInitial = parts[0].charAt(0).toUpperCase();
    const lastInitial = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
    
    return firstInitial + lastInitial;
  };

  // Cleanup on component unmount only
  useEffect(() => {
    return () => {
      // Final cleanup on unmount
      if (interviewTimerRef.current) {
        clearInterval(interviewTimerRef.current);
        interviewTimerRef.current = null;
      }
      messageHandlersSetup.current = false;
    };
  }, []);

  // LiveKit room event handlers will be set up within the LiveKitRoom component
  // We'll handle transcript updates and AI speaking states through LiveKit's useVoiceAssistant hook

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

  // Auto-scroll to bottom when transcript changes
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // Timer effect for recording
  useEffect(() => {
    if (isRecording && stage === 'recording') {
      interviewTimerRef.current = setInterval(() => {
        setCurrentTime(prev => prev + 1);
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
  }, [isRecording, stage]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartInterview = async () => {
    // Prevent multiple simultaneous starts
    if (isConnecting) {
      console.log('⚠️ Interview already starting');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Create interview context for LiveKit agent
      console.log('🎯 Starting LiveKit interview...');
      console.log('Candidate data:', candidateData);
      console.log('Recruiter context:', recruiterContext);

      // Debug log before API call
      console.log('🔍 Sending to backend:', {
        candidateId: candidateId,
        recruiterName: recruiterContext.recruiterName || 'Recruiter',
        recruiterTitle: recruiterContext.recruiterTitle || 'Hiring Manager',
        company: recruiterContext.company || candidateData?.currentCompany || 'Company',
        jobTitle: recruiterContext.position || 'Position',
        jobDescription: recruiterContext.jobDescription || 'Screening interview for ' + candidateName
      });

      // Call the LiveKit backend endpoint to start the interview (public endpoint - no auth required)
      const response = await fetch(`${import.meta.env.VITE_API_URL}/interviews/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header - public endpoint
        },
        body: JSON.stringify({
          candidateId: candidateId,
          recruiterName: recruiterContext.recruiterName,
          recruiterEmail: recruiterContext.recruiterEmail, // Include email for recruiter record
          recruiterTitle: recruiterContext.recruiterTitle,
          recruiterLinkedin: recruiterContext.recruiterLinkedin,
          recruiterPhone: recruiterContext.recruiterPhone,
          company: recruiterContext.company,
          jobTitle: recruiterContext.position,
          jobDescription: recruiterContext.jobDescription || 'Screening interview for ' + candidateName
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start LiveKit interview');
      }

      const data = await response.json();
      console.log('✅ LiveKit interview started:', data);

      // Store the connection details
      setLivekitToken(data.token);
      setRoomName(data.roomName);
      setDispatchId(data.dispatchId);
      setServerUrl(data.serverUrl || 'wss://digital-twin-rl2-6xocd5y9.livekit.cloud'); // Use server URL from backend or fallback
      setSessionId(data.roomName); // Use room name as session ID for tracking
      setRecruiterId(data.recruiterId); // Store recruiterId for linking completed interview

      // Move to recording stage - actual connection will happen via LiveKitRoom component
      setStage('recording');
      setTranscript([]);
      setCurrentTime(0);
      // Keep isConnecting true until agent is ready
      // setIsConnecting(false); // Will be set to false when agent connects
      setIsRecording(false); // Don't start recording until agent is ready
      setIsListening(false); // Don't show listening state yet

    } catch (error) {
      console.error('❌ Failed to start LiveKit interview:', error);
      setError(error instanceof Error ? error.message : 'Failed to start interview');
      setIsConnecting(false);
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

      // Room disconnection will be handled by LiveKitRoom component when stage changes

      console.log('🏁 Ending LiveKit interview...');
      console.log('📝 Final transcript length:', transcript.length);

      let finalTranscript = transcript;
      let finalSessionId = sessionId;
      
      // Save transcript to backend using LiveKit interview endpoint
      if (finalSessionId) {
        console.log('🔄 Saving LiveKit interview transcript...');
        console.log('📝 Transcript to save:', finalTranscript);
        console.log('📝 Session ID (room name):', finalSessionId);
        console.log('📝 Recruiter ID:', recruiterId);
        console.log('📝 Transcript length:', finalTranscript.length);

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
            candidateId: candidateId,
            recruiterId: recruiterId, // Link to recruiter if available
            transcript: transcriptForBackend,
            duration: currentTime
          })
        });
        
        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log('✅ Transcript saved and insights extracted:', result);
          // The response structure is { success: true, data: { highlights: {...} } }
          setInterviewSummary(result);
          // Set the completed session ID for transcript retrieval
          setCompletedSessionId(finalSessionId);
        } else {
          console.warn('⚠️ Failed to save transcript to backend');
          const errorText = await saveResponse.text();
          console.error('Error response:', errorText);
        }
      }
      
      setTranscript(finalTranscript);
      setStage('brief');
      
    } catch (error) {
      console.error('❌ Error completing interview:', error);
      // Still transition to brief stage even if there's an error
      setTranscript(transcript);
      setStage('brief');
    }
  };

  const handleClose = async () => {
    // Room disconnection will be handled by LiveKitRoom component unmounting

    // Clear any timers
    if (interviewTimerRef.current) {
      clearInterval(interviewTimerRef.current);
      interviewTimerRef.current = null;
    }

    // Reset all state
    setStage('initial');
    setIsRecording(false);
    setTranscript([]);
    setCurrentTime(0);
    setIsContextOpen(false);
    setError(null);
    setSessionId(null);
    setAiIsSpeaking(false);
    setIsConnecting(false);
    setRecruiterContext({
      recruiterName: "",
      recruiterEmail: "",
      recruiterTitle: "",
      recruiterLinkedin: "",
      recruiterPhone: "",
      company: "",
      position: "",
      jobDescription: ""
    });
    setRecruiterId(null);
    setInterviewSummary(null);
    setCompletedSessionId(null);
    setFullTranscriptFromDB(null);
    setIsListening(false);

    // Reset LiveKit specific state
    setLivekitToken(null);
    setRoomName(null);
    setDispatchId(null);
    setServerUrl(null);

    onClose();
  };

  // Recording is managed by LiveKit Room connection
  // No manual toggle needed as audio is automatically streamed

  const updateRecruiterContext = (field: keyof typeof recruiterContext, value: string) => {
    setRecruiterContext(prev => ({ ...prev, [field]: value }));
  };

  const renderInitialStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-6">
        {/* Profile Avatar */}
        <div className="flex justify-center">
          <Avatar className="w-20 h-20 border-4 border-primary/20">
            <AvatarImage src="" alt={candidateName} />
            <AvatarFallback className="text-2xl font-semibold bg-gradient-primary text-white">
              {getInitials(candidateName)}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <div>
          <h3 className="text-2xl font-bold mb-2">Talk to {candidateName}'s Digital Twin</h3>
          <p className="text-lg text-muted-foreground">{candidateData.jobTitle || 'Professional'} • {candidateData.location || 'Remote'}</p>
          <p className="text-sm text-muted-foreground mt-2">AI-powered professional avatar</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-primary/5 to-blue-500/5 border-primary/20">
        <div className="space-y-4">
          <div className="flex items-center gap-2 justify-center">
            <Volume2 className="w-5 h-5 text-primary" />
            <h4 className="font-semibold text-primary">Digital Twin Technology</h4>
          </div>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Speaks as {candidateName.split(' ')[0]} with their actual experience</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Answers based on real resume and interview data</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Natural conversation with no time limits</span>
            </li>
            <li className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <span>Perfect for initial screening and assessment</span>
            </li>
          </ul>
        </div>
      </Card>

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

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Cancel
        </Button>
        <Button 
          onClick={handleStartInterview} 
          className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90"
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" />
              Start Voice Screening
            </>
          )}
        </Button>
      </div>
    </div>
  );

  // Component to handle LiveKit room events and transcripts
  const LiveKitRoomContent = () => {
    const room = useRoomContext();
    const participants = useParticipants();
    const tracks = useTracks();

    // Handle transcription events
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

    // Also handle data messages as fallback
    useDataChannel((data, participant) => {
      try {
        const decoder = new TextDecoder();
        const text = decoder.decode(data.payload);
        console.log('📦 Data channel message:', text, 'from:', participant?.identity);

        // Try to parse as JSON first
        try {
          const message = JSON.parse(text);
          if (message.transcript || message.text) {
            const transcriptMessage: LiveKitMessage = {
              type: participant?.identity.includes('agent') ? 'assistant_message' : 'user_message',
              content: message.transcript || message.text,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
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
          }
        }
      } catch (e) {
        console.error('Error handling data message:', e);
      }
    });

    // Monitor participants and speaking state
    useEffect(() => {
      // Check for agent participant
      const agentParticipant = participants.find(p => p.identity.includes('agent'));
      if (agentParticipant) {
        console.log('🤖 Agent in room:', agentParticipant.identity);
        setAiIsSpeaking(agentParticipant.isSpeaking);

        // Check for transcription tracks
        const remotePart = agentParticipant as RemoteParticipant;
        if (remotePart.audioTracks) {
          remotePart.audioTracks.forEach((publication) => {
            console.log('🎙️ Audio track:', publication.trackSid, 'subscribed:', publication.isSubscribed);
          });
        }
      }

      // Log participant changes
      participants.forEach(participant => {
        console.log('👤 Participant:', participant.identity, 'Speaking:', participant.isSpeaking);
      });
    }, [participants]);

    // Monitor tracks for debugging
    useEffect(() => {
      console.log('🎵 All tracks:', tracks.map(t => ({
        source: t.source,
        participant: t.participant?.identity,
        isSubscribed: t.publication?.isSubscribed
      })));
    }, [tracks]);

    // Monitor room connection state and track events
    useEffect(() => {
      if (!room) return;

      console.log('✅ Connected to LiveKit room');

      // Listen for speaking changes
      const handleSpeakingChanged = (speaking: boolean, participant: Participant) => {
        console.log('🗣️ Speaking changed:', participant.identity, 'is speaking:', speaking);
        if (participant.identity.includes('agent')) {
          setAiIsSpeaking(speaking);
        }
      };

      // Listen for track events (audio/data)
      const handleTrackSubscribed = (track: any, publication: any, participant: any) => {
        console.log('🎤 Track subscribed:', track.kind, 'from:', participant.identity);
      };

      // Listen for active speaker changes
      const handleActiveSpeakerChanged = (speakers: any[]) => {
        console.log('🔊 Active speakers:', speakers.map(s => s.identity));
      };

      // Listen for data messages (another way to receive transcripts)
      const handleDataReceived = (payload: Uint8Array, participant?: any) => {
        try {
          const text = new TextDecoder().decode(payload);
          console.log('📨 Data received:', text, 'from:', participant?.identity);

          // Add as transcript
          if (text && text.trim()) {
            const transcriptMessage: LiveKitMessage = {
              type: participant?.identity?.includes('agent') ? 'assistant_message' : 'user_message',
              content: text,
              timestamp: new Date().toISOString()
            };
            setTranscript(prev => [...prev, transcriptMessage]);
          }
        } catch (e) {
          console.error('Error processing data:', e);
        }
      };

      room.on('participantConnected', (participant) => {
        console.log('👤 Participant connected:', participant.identity);

        // Subscribe to participant's data
        if (participant.identity.includes('agent')) {
          console.log('🤖 Agent connected, subscribing to data...');
          // Agent is now connected, start the interview
          setIsConnecting(false);
          setIsRecording(true);
          setIsListening(true);
          setCurrentTime(0); // Reset timer to start from 0
        }
      });

      room.on('isSpeakingChanged', handleSpeakingChanged);
      room.on('trackSubscribed', handleTrackSubscribed);
      room.on('activeSpeakersChanged', handleActiveSpeakerChanged);
      room.on('dataReceived', handleDataReceived);

      // Log room state - with null checks
      if (room.state) {
        console.log('🏠 Room state:', room.state);
      }
      if (room.participants) {
        console.log('👥 Participants:', Array.from(room.participants.values()).map(p => p.identity));
      }

      return () => {
        if (room) {
          room.off('isSpeakingChanged', handleSpeakingChanged);
          room.off('trackSubscribed', handleTrackSubscribed);
          room.off('activeSpeakersChanged', handleActiveSpeakerChanged);
          room.off('dataReceived', handleDataReceived);
        }
      };
    }, [room]);

    return (
      <>
        <RoomAudioRenderer />
        <div className="space-y-6">
          {isConnecting ? (
            // Show loading state while agent is connecting
            <div className="text-center space-y-4">
              <div className="relative inline-flex">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Connecting to AI Agent...</h3>
                <p className="text-muted-foreground">Please wait while we set up your interview</p>
              </div>
            </div>
          ) : (
            // Show normal interview UI after agent is connected
            <div className="text-center space-y-4">
              {/* Voice Recording Indicator */}
              <div className="relative inline-flex">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isRecording && !aiIsSpeaking
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30'
                    : aiIsSpeaking
                    ? 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30'
                    : 'bg-muted'
                }`}>
                  {aiIsSpeaking ? (
                    <Volume2 className="w-10 h-10 text-white animate-pulse" />
                  ) : isRecording ? (
                    <Mic className="w-10 h-10 text-white" />
                  ) : (
                    <MicOff className="w-10 h-10 text-muted-foreground" />
                  )}
                </div>
                {(isRecording || aiIsSpeaking) && (
                  <span className="absolute flex h-full w-full">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      aiIsSpeaking ? 'bg-purple-400' : 'bg-blue-400'
                    }`}></span>
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-semibold">
                  {aiIsSpeaking
                    ? "AI is Speaking"
                    : isListening
                    ? "Listening..."
                    : "Ready"}
                </h3>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-lg font-mono">{formatTime(currentTime)}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    No Time Limit
                  </Badge>
                </div>
              </div>
            </div>
          )}

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      {!isConnecting && (
        <>
          <Card className="p-4 bg-muted/30">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Live Conversation
            </h4>
            <div ref={transcriptContainerRef} className="space-y-4 h-64 overflow-y-auto">
              {transcript.map((message, index) => (
                <div key={index} className={`flex gap-3 ${
                  message.type === 'assistant_message' ? 'justify-start' : 'justify-end'
                }`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${
                    message.type === 'assistant_message'
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-blue-500 text-white'
                  }`}>
                    <div className="text-xs font-medium mb-1 opacity-80">
                      {message.type === 'assistant_message' ? candidateName : 'Recruiter'}
                    </div>
                    <div className="text-sm">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {aiIsSpeaking && (
              <div className="mt-2 flex justify-start">
                <div className="bg-primary/5 border border-primary/20 p-2 rounded-lg">
                  <div className="flex items-center gap-2 text-primary">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    <span className="text-sm">{candidateName} is speaking...</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Single Complete Interview Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleCompleteInterview}
              size="lg"
              className="bg-gradient-to-r from-primary to-blue-600 hover:opacity-90"
              disabled={transcript.length === 0 || stage === 'saving'}
            >
              {stage === 'saving' ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving Interview...
                </>
              ) : (
                'Complete Interview'
              )}
            </Button>
          </div>
        </>
      )}
        </div>
      </>
    );
  };

  const renderRecordingStage = () => {
    // Wrap the content with LiveKit room if we have a token
    if (livekitToken && roomName && serverUrl) {
      return (
        <LiveKitRoom
          token={livekitToken}
          serverUrl={serverUrl}
          connect={true}
          audio={true}  // Enable microphone
          video={false} // Disable video
        >
          <LiveKitRoomContent />
        </LiveKitRoom>
      );
    }

    // Fallback UI if no token (shouldn't happen in normal flow)
    return (
      <div className="text-center p-4">
        <p className="text-muted-foreground">Connecting to interview room...</p>
      </div>
    );
  };

  const renderSavingStage = () => (
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
  );

  const renderBriefStage = () => {
    // Parse the insights from backend - they now come in the new format
    const insights = interviewSummary?.data?.highlights || interviewSummary || {
      keyInsights: [],
      recruiterRecommendation: "Interview analysis in progress. Please view transcript for full details.",
      matchQuality: "Needs More Assessment"
    };

    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Target className="w-10 h-10 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-green-600">Screening Interview Completed!</h3>
            <p className="text-muted-foreground">Here are the key insights from your conversation</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Key Insights */}
          {insights.keyInsights && insights.keyInsights.length > 0 && (
            <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <h4 className="font-semibold text-lg">📊 Key Insights</h4>
              </div>
              <ul className="text-sm space-y-3">
                {insights.keyInsights.map((insight: string, index: number) => (
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
              <h4 className="font-semibold text-lg text-blue-900">💼 Recruiter Recommendation</h4>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              {insights.recruiterRecommendation}
            </p>
            <div className="flex items-center gap-2">
              <Badge className={`px-3 py-1 font-semibold ${
                insights.matchQuality === 'Strong Match'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : insights.matchQuality === 'Good Match'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                {insights.matchQuality === 'Strong Match' ? '⭐ Strong Match' :
                 insights.matchQuality === 'Good Match' ? '⭐ Good Match' : '⚡ Needs More Assessment'}
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
            View Full Transcript
          </Button>
          <Button onClick={handleClose} className="flex-1 bg-gradient-primary">
            Done
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">Voice Screening Interview</DialogTitle>
          </DialogHeader>
          {stage === 'initial' && renderInitialStage()}
          {stage === 'recording' && renderRecordingStage()}
          {stage === 'saving' && renderSavingStage()}
          {stage === 'processing' && renderProcessingStage()}
          {stage === 'brief' && renderBriefStage()}
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
              <span>{candidateName} • Screening Interview</span>
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
                          {message.type === 'assistant_message' ? candidateName : (recruiterContext.recruiterName || 'Recruiter')}
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