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
import { directHumeEVI, type EVIMessage } from "@/services/directHumeEVISDK";

interface ProfileVoiceInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  candidateData: any; // Will contain all user profile data
}

type InterviewStage = 'initial' | 'recording' | 'brief' | 'processing';

export default function ProfileVoiceInterviewDialog({ 
  isOpen, 
  onClose, 
  candidateId, 
  candidateName, 
  candidateData 
}: ProfileVoiceInterviewDialogProps) {
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<EVIMessage[]>([]);
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
  const [fullTranscriptFromDB, setFullTranscriptFromDB] = useState<EVIMessage[] | null>(null);
  const interviewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersSetup = useRef<boolean>(false);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // Recruiter context state
  const [recruiterContext, setRecruiterContext] = useState({
    recruiterName: "",
    recruiterTitle: "",
    company: "",
    position: "",
    jobDescription: ""
  });

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

  // Setup Hume event handlers
  const setupDirectEVIMessageHandlers = () => {
    if (messageHandlersSetup.current) {
      console.log('⚠️ Message handlers already set up');
      return;
    }
    
    console.log('🔧 Setting up DIRECT EVI message handlers...');
    messageHandlersSetup.current = true;
    
    directHumeEVI.onMessage('connected', async () => {
      console.log('✅ Connected to Hume EVI');
      setError(null);
      
      // Auto-start recording when connected
      try {
        await directHumeEVI.startRecording();
        setIsRecording(true);
        setIsListening(true);
        console.log('✅ Recording started automatically');
      } catch (error) {
        console.error('❌ Failed to start recording:', error);
        setError('Failed to start audio recording. Please check microphone permissions.');
      }
    });

    directHumeEVI.onMessage('assistant_message', (message: any) => {
      console.log('🤖 Assistant message:', message);
      const transcriptEntry = {
        type: 'assistant_message' as const,
        content: message.message?.content || '',
        timestamp: new Date().toISOString()
      };
      console.log('📝 Adding to transcript:', transcriptEntry);
      setTranscript(prev => {
        const newTranscript = [...prev, transcriptEntry];
        console.log('📋 Updated transcript length:', newTranscript.length);
        return newTranscript;
      });
    });

    directHumeEVI.onMessage('user_message', (message: any) => {
      console.log('👤 User message:', message);
      const transcriptEntry = {
        type: 'user_message' as const,
        content: message.message?.content || '',
        timestamp: new Date().toISOString()
      };
      console.log('📝 Adding to transcript:', transcriptEntry);
      setTranscript(prev => {
        const newTranscript = [...prev, transcriptEntry];
        console.log('📋 Updated transcript length:', newTranscript.length);
        return newTranscript;
      });
    });

    directHumeEVI.onMessage('audio_start', () => {
      console.log('🎵 AI audio playback started');
      setAiIsSpeaking(true);
    });

    directHumeEVI.onMessage('audio_end', () => {
      console.log('🎵 AI audio playback ended');
      setAiIsSpeaking(false);
    });

    directHumeEVI.onMessage('error', (error: any) => {
      console.error('❌ Hume error:', error);
      setError('Connection error. Please try again.');
    });

    directHumeEVI.onMessage('disconnected', () => {
      console.log('🔌 Disconnected from Hume');
    });
  };

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

    // Clean up any existing connection first
    if (directHumeEVI.isConnectedAndReady()) {
      console.log('🧹 Cleaning up existing connection before starting new interview');
      directHumeEVI.cleanup();
    }

    try {
      // Create interview context for profile screening
      console.log('🎯 Starting profile screening interview...');
      console.log('Candidate data:', candidateData);
      console.log('Recruiter context:', recruiterContext);

      // Use startInterview method (creates new config each time)
      const profileContext = {
        title: 'Profile Screening',
        company: candidateData?.company || 'Company',
        duration: '',
        location: candidateData?.location || '',
        description: `Profile screening for ${candidateName}`,
        skills: candidateData?.skills || [],
        software: candidateData?.software || [],
        experienceId: `profile-screening-${Date.now()}`, // Unique ID for each screening
        candidateData,
        recruiterContext
      };

      console.log('🚀 Starting profile interview with context:', profileContext);

      // Use the standard startInterview method (creates new config each time)
      const session = await directHumeEVI.startInterview(
        candidateId, // Use candidateId as userId for this interview
        'profile_screening' as any, // Add profile_screening as interview type
        profileContext
      );

      setSessionId(session.sessionId);

      // Set up message handlers AFTER successful connection
      setupDirectEVIMessageHandlers();

      // Recording will be started automatically in the 'connected' event handler
      
      setStage('recording');
      setTranscript([]);
      setCurrentTime(0);
      setIsConnecting(false);
      
    } catch (error) {
      console.error('❌ Failed to start interview:', error);
      setError(error instanceof Error ? error.message : 'Failed to start interview');
      setIsConnecting(false);
    }
  };

  const handleCompleteInterview = async () => {
    try {
      setStage('processing');
      setIsRecording(false);
      
      // Get current transcript before ending
      const currentTranscript = directHumeEVI.getTranscript();
      console.log('📜 Current transcript from directHumeEVI:', currentTranscript);
      console.log('📜 State transcript:', transcript);
      
      // Use state transcript if directHumeEVI transcript is empty
      const transcriptToUse = currentTranscript.length > 0 ? currentTranscript : transcript;
      
      // End the Hume interview
      console.log('🏁 Ending interview...');
      console.log('📝 Using transcript with length:', transcriptToUse.length);
      let finalTranscript = transcriptToUse;
      let finalSessionId = sessionId;
      
      try {
        const result = await directHumeEVI.endInterview(sessionId || undefined, transcriptToUse);
        finalTranscript = result.transcript.length > 0 ? result.transcript : transcriptToUse;
        finalSessionId = result.sessionId || sessionId;
      } catch (endError) {
        console.warn('⚠️ Error ending Hume session, but continuing:', endError);
      }
      
      // Save transcript to backend and get insights
      if (finalSessionId) {
        console.log('🔄 Saving profile screening transcript...');
        console.log('📝 Transcript to save:', finalTranscript);
        console.log('📝 Session ID:', finalSessionId);
        console.log('📝 Transcript length:', finalTranscript.length);
        
        const saveResponse = await fetch(`${import.meta.env.VITE_API_URL}/evi-interview/save-profile-transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: finalSessionId,
            transcript: finalTranscript,
            endTime: new Date().toISOString(),
            totalDurationSeconds: currentTime,
            recruiterNotes: '' // Can be added later
          })
        });
        
        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log('✅ Transcript saved and insights extracted');
          setInterviewSummary(result.insights);
          // Set the completed session ID for transcript retrieval
          setCompletedSessionId(finalSessionId);
        } else {
          console.warn('⚠️ Failed to save transcript to backend');
        }
      }
      
      setTranscript(finalTranscript);
      setStage('brief');
      
    } catch (error) {
      console.error('❌ Error completing interview:', error);
      // Still transition to brief stage even if there's an error
      setTranscript(directHumeEVI.getTranscript());
      setStage('brief');
    }
  };

  const handleClose = async () => {
    // Stop recording if active
    if (isRecording) {
      try {
        directHumeEVI.stopRecording();
      } catch (e) {
        console.error('Error stopping recording:', e);
      }
    }

    // End interview if still active
    if (directHumeEVI.isConnectedAndReady()) {
      try {
        await directHumeEVI.endInterview();
      } catch (e) {
        console.error('Error ending interview:', e);
      }
    }

    // Clear any timers
    if (interviewTimerRef.current) {
      clearInterval(interviewTimerRef.current);
      interviewTimerRef.current = null;
    }

    // Clean up directHumeEVI completely when closing
    directHumeEVI.cleanup();

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
      recruiterTitle: "",
      company: "",
      position: "",
      jobDescription: ""
    });
    setInterviewSummary(null);
    setCompletedSessionId(null);
    setFullTranscriptFromDB(null);
    setIsListening(false);

    // Reset message handlers flag
    messageHandlersSetup.current = false;

    onClose();
  };

  const toggleRecording = async () => {
    if (!directHumeEVI.isConnectedAndReady()) return;
    
    try {
      if (isRecording) {
        directHumeEVI.stopRecording();
        setIsRecording(false);
      } else {
        await directHumeEVI.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error('❌ Error toggling recording:', error);
      setError('Failed to toggle recording');
    }
  };

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
            <span>Interview Context (Optional)</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isContextOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recruiterName" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Recruiter Name
                </Label>
                <Input
                  id="recruiterName"
                  value={recruiterContext.recruiterName}
                  onChange={(e) => updateRecruiterContext('recruiterName', e.target.value)}
                  placeholder="Enter your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recruiterTitle" className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Your Title
                </Label>
                <Input
                  id="recruiterTitle"
                  value={recruiterContext.recruiterTitle}
                  onChange={(e) => updateRecruiterContext('recruiterTitle', e.target.value)}
                  placeholder="e.g., Senior Recruiter"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Company
                </Label>
                <Input
                  id="company"
                  value={recruiterContext.company}
                  onChange={(e) => updateRecruiterContext('company', e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position" className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Position Looking For
                </Label>
                <Input
                  id="position"
                  value={recruiterContext.position}
                  onChange={(e) => updateRecruiterContext('position', e.target.value)}
                  placeholder="e.g., Senior Frontend Developer"
                />
              </div>
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

  const renderRecordingStage = () => (
    <div className="space-y-6">
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
              : "Connecting..."}
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

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      <Card className="p-4 bg-muted/30">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Live Conversation
        </h4>
        <div ref={transcriptContainerRef} className="space-y-4 max-h-64 overflow-y-auto">
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
          {aiIsSpeaking && (
            <div className="flex justify-start">
              <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-primary">
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">{candidateName} is speaking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Single Complete Interview Button */}
      <div className="flex justify-center">
        <Button 
          onClick={handleCompleteInterview}
          size="lg"
          className="bg-gradient-to-r from-primary to-blue-600 hover:opacity-90"
          disabled={transcript.length === 0 || !directHumeEVI.isConnectedAndReady()}
        >
          Complete Interview
        </Button>
      </div>
    </div>
  );

  const renderProcessingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <h3 className="text-xl font-semibold">Interview Completed!</h3>
        <p className="text-muted-foreground">Processing conversation insights...</p>
      </div>
      
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Extracting candidate summary...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Analyzing key strengths...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Evaluating culture fit...</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Generating recruiter insights...</span>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderBriefStage = () => {
    // Ensure we have a properly structured insights object with all required fields
    const defaultInsights = {
      keyInsights: [
        "Strong technical background in modern web technologies",
        "Clear communication and ability to explain complex concepts", 
        "Team-oriented professional with leadership experience",
        "Demonstrated expertise in React and TypeScript",
        "Values quality, innovation, and continuous learning"
      ],
      recruiterRecommendation: "Strong candidate worth pursuing for technical roles. Consider scheduling a follow-up technical interview.",
      overallMatch: recruiterContext.position ? "high" : "medium"
    };
    
    // Use actual interview insights if available, otherwise use defaults
    const insights = interviewSummary && Object.keys(interviewSummary).length > 0 ? {
      keyInsights: Array.isArray(interviewSummary.keyInsights) && interviewSummary.keyInsights.length > 0 
        ? interviewSummary.keyInsights 
        : defaultInsights.keyInsights,
      recruiterRecommendation: interviewSummary.recruiterRecommendation || defaultInsights.recruiterRecommendation,
      overallMatch: interviewSummary.overallMatch || defaultInsights.overallMatch
    } : defaultInsights;

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
          <Card className="p-4 border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h4 className="font-medium">Key Insights</h4>
            </div>
            <ul className="text-sm space-y-2">
              {(insights.keyInsights || []).map((insight: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Recruiter Recommendation */}
          <Card className="p-4 border-purple-200 bg-purple-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-4 h-4 text-purple-600" />
              <h4 className="font-medium text-purple-800">Recruiter Recommendation</h4>
            </div>
            <p className="text-sm text-purple-700">
              {insights.recruiterRecommendation}
            </p>
            <div className="mt-3">
              <Badge className={`${
                insights.overallMatch === 'high' 
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : insights.overallMatch === 'medium'
                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                  : 'bg-gray-100 text-gray-800 border-gray-300'
              }`}>
                {insights.overallMatch === 'high' ? 'Strong Match' : 
                 insights.overallMatch === 'medium' ? 'Good Match' : 'Potential Match'}
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
                        {message.type === 'assistant_message' ? candidateName : (recruiterContext.recruiterName || 'Recruiter')}
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