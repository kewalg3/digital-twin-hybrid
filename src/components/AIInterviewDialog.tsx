import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mic, MicOff, Play, Pause, FileText, Clock, Target, TrendingUp, Loader2, AlertTriangle } from "lucide-react";
import { humeVoiceInterviewApi, JobContext, InterviewSummary, VoiceOption, InterviewSession, InterviewResponse } from "@/services/humeVoiceInterviewApi";
import VoiceSelection from "@/components/VoiceSelection";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";

interface Job {
  title: string;
  company: string;
  duration: string;
  location: string;
  description: string;
  skills: string[];
  software: string[];
}

interface AIInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
}

type InterviewStage = 'initial' | 'voice_selection' | 'connecting' | 'recording' | 'brief' | 'error';

export default function AIInterviewDialog({ isOpen, onClose, job }: AIInterviewDialogProps) {
  const { user } = useAuthStore();
  const [stage, setStage] = useState<InterviewStage>('initial');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [showTranscriptDialog, setShowTranscriptDialog] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [interviewSummary, setInterviewSummary] = useState<InterviewSummary | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('luna');
  const [currentSession, setCurrentSession] = useState<InterviewSession | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [isOpen]);

  const cleanup = () => {
    cleanupSpeechRecognition();
    humeVoiceInterviewApi.cleanup();
    setCurrentSession(null);
  };

  // Timer effect for recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Initialize speech recognition
  const initializeSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: "Speech Recognition Not Available",
        description: "Your browser doesn't support speech recognition. Please use a supported browser.",
        variant: "destructive"
      });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        // Add user response to transcript
        const userResponse = `You: ${finalTranscript}`;
        setTranscript(prev => [...prev, userResponse]);
        
        // Process transcript with new API
        handleTranscriptSubmission(finalTranscript);
        
        // Stop listening temporarily while AI responds
        setIsListening(false);
        recognition.stop();
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      toast({
        title: "Speech Recognition Error",
        description: "There was an issue with speech recognition. Please try again.",
        variant: "destructive"
      });
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Don't automatically restart - wait for next question
    };

    recognitionRef.current = recognition;
  };

  const cleanupSpeechRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartInterview = () => {
    setStage('voice_selection');
  };

  const handleVoiceSelection = async () => {
    try {
      setStage('connecting');
      setErrorMessage('');
      setConnectionStatus('connecting');
      
      // Start the job experience interview with selected voice
      const userId = user?.id || 'guest';
      const jobExperience = {
        jobTitle: job.title,
        company: job.company,
        description: job.description,
        duration: job.duration,
        location: job.location,
        skills: job.skills,
        software: job.software
      };
      
      const session = await humeVoiceInterviewApi.startJobExperienceInterview(userId, jobExperience, selectedVoice);
      setCurrentSession(session);
      setSessionId(session.sessionId);
      setInterviewId(session.interviewId);
      setCurrentQuestion(session.openingQuestion.text);
      setTranscript([`AI: ${session.openingQuestion.text}`]);
      
      setConnectionStatus('connected');
      setStage('recording');
      setIsRecording(true);
      
      // Play opening question audio
      if (session.openingQuestion.audioBuffer) {
        try {
          await humeVoiceInterviewApi.playAudio(session.openingQuestion.audioBuffer);
        } catch (audioError) {
          console.error('Opening question audio failed, using fallback TTS:', audioError);
          // Fallback to browser speech synthesis
          if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(session.openingQuestion.text);
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
          }
        }
      }
      
      // Initialize audio recording
      await humeVoiceInterviewApi.initializeAudioRecording();
      
      // Initialize speech recognition
      initializeSpeechRecognition();
      
      // Start listening after the audio finishes (longer delay)
      setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.start();
        }
      }, 3000); // Increased delay to let audio finish
      
      toast({
        title: "Interview Started",
        description: "You can now speak your response"
      });
      
    } catch (error) {
      console.error('Error starting interview:', error);
      setErrorMessage(error.message || 'Failed to start interview');
      setStage('error');
      setConnectionStatus('error');
    }
  };

  const handleTranscriptSubmission = async (transcript: string) => {
    try {
      const response = await humeVoiceInterviewApi.processTranscript(transcript);
      
      if (response.isWarning) {
        toast({
          title: "Please keep our conversation professional",
          description: response.warningMessage,
          variant: "destructive"
        });
        return;
      }
      
      if (response.isTerminated) {
        setStage('error');
        setErrorMessage('Interview was terminated due to inappropriate content');
        cleanupSpeechRecognition();
        return;
      }
      
      if (response.isCompleted) {
        setInterviewSummary(response.summary || null);
        setStage('brief');
        cleanupSpeechRecognition();
        toast({
          title: "Interview Complete",
          description: response.closingMessage?.text || "Interview completed successfully"
        });
        return;
      }
      
      if (response.nextQuestion && response.shouldContinue) {
        setCurrentQuestion(response.nextQuestion.text);
        setTranscript(prev => [...prev, `AI: ${response.nextQuestion.text}`]);
        
        // Play audio response if available
        if (response.nextQuestion.audioBuffer) {
          try {
            await humeVoiceInterviewApi.playAudio(response.nextQuestion.audioBuffer);
          } catch (audioError) {
            console.error('Audio playback failed, using fallback TTS:', audioError);
            // Fallback to browser speech synthesis
            if ('speechSynthesis' in window) {
              const utterance = new SpeechSynthesisUtterance(response.nextQuestion.text);
              utterance.rate = 0.9;
              utterance.pitch = 1.0;
              window.speechSynthesis.speak(utterance);
            }
          }
        }
        
        // Restart speech recognition for next question
        setTimeout(() => {
          if (recognitionRef.current && stage === 'recording') {
            recognitionRef.current.start();
          }
        }, 1500);
      }
      
    } catch (error) {
      console.error('Error processing transcript:', error);
      toast({
        title: "Processing Error",
        description: "There was an issue processing your response",
        variant: "destructive"
      });
    }
  };

  const handleCompleteInterview = async () => {
    try {
      if (currentSession) {
        const response = await humeVoiceInterviewApi.endInterview();
        
        if (response.summary) {
          setInterviewSummary(response.summary);
        }
        
        setStage('brief');
        
        toast({
          title: "Interview Complete",
          description: response.closingMessage?.text || "Interview completed successfully"
        });
      }
      
      cleanupSpeechRecognition();
      setIsRecording(false);
    } catch (error) {
      console.error('Error completing interview:', error);
      toast({
        title: "Error",
        description: "There was an issue completing the interview",
        variant: "destructive"
      });
    }
  };

  const handleClose = () => {
    cleanup();
    setStage('initial');
    setIsRecording(false);
    setIsListening(false);
    setTranscript([]);
    setCurrentTime(0);
    setSessionId(null);
    setInterviewId(null);
    setCurrentQuestion('');
    setConnectionStatus('disconnected');
    setErrorMessage('');
    setInterviewSummary(null);
    setIsPaused(false);
    setSelectedVoice('luna');
    setCurrentSession(null);
    onClose();
  };

  const renderInitialStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Mic className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">AI Interview: {job.title}</h3>
          <p className="text-muted-foreground">{job.company} • {job.duration}</p>
        </div>
      </div>

      <Card className="p-4 bg-muted/50">
        <h4 className="font-medium mb-2">Job Experience Expansion:</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Detailed discussion about your day-to-day responsibilities</li>
          <li>• Questions about tools, software, and methodologies you used</li>
          <li>• Focus on measurable achievements and impact you created</li>
          <li>• Share specific examples beyond what's on your resume</li>
          <li>• 3-5 warm, conversational questions</li>
        </ul>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleStartInterview} className="flex-1 bg-gradient-primary">
          Start Interview
        </Button>
      </div>
    </div>
  );

  const renderVoiceSelectionStage = () => (
    <VoiceSelection
      selectedVoice={selectedVoice}
      onVoiceChange={setSelectedVoice}
      onConfirm={handleVoiceSelection}
      onCancel={() => setStage('initial')}
      isLoading={connectionStatus === 'connecting'}
    />
  );

  const renderRecordingStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-colors ${
          isRecording ? 'bg-red-100 animate-pulse' : 'bg-muted'
        }`}>
          {isRecording ? (
            <Mic className="w-8 h-8 text-red-600" />
          ) : (
            <MicOff className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div>
          <h3 className="text-xl font-semibold">AI Interview in Progress</h3>
          <p className="text-lg font-mono">{formatTime(currentTime)}</p>
        </div>
      </div>

      <Card className="p-4 max-h-80 overflow-y-auto">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Live Transcript
        </h4>
        <div className="space-y-3">
          {transcript.map((message, index) => (
            <div key={index} className={`text-sm ${
              message.startsWith('AI:') ? 'text-primary' : 'text-foreground'
            }`}>
              {message}
            </div>
          ))}
          {isRecording && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
              <span className="text-sm">Listening...</span>
            </div>
          )}
        </div>
      </Card>

      <div className="flex gap-3">
        <Button 
          variant="outline" 
          onClick={() => {
            try {
              if (isRecording) {
                setIsPaused(true);
                cleanupSpeechRecognition();
              } else {
                setIsPaused(false);
                initializeSpeechRecognition();
                // Resume listening
                setTimeout(() => {
                  if (recognitionRef.current) {
                    recognitionRef.current.start();
                  }
                }, 500);
              }
              setIsRecording(!isRecording);
            } catch (error) {
              console.error('Error toggling pause/resume:', error);
            }
          }}
          className="flex-1"
        >
          {isRecording ? (
            <>
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Resume
            </>
          )}
        </Button>
        <Button 
          onClick={handleCompleteInterview}
          className="flex-1 bg-gradient-primary"
          disabled={transcript.length < 3}
        >
          Complete Interview
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
          <h3 className="text-xl font-semibold mb-2">Connecting...</h3>
          <p className="text-muted-foreground">
            {connectionStatus === 'connecting' ? 'Establishing connection to interview service' : 'Preparing your interview session'}
          </p>
        </div>
      </div>
      
      <Card className="p-4 bg-muted/50">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Please wait while we set up your interview environment</p>
        </div>
      </Card>
    </div>
  );

  const renderErrorStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold mb-2">Interview Error</h3>
          <p className="text-muted-foreground">There was an issue with your interview</p>
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

  const renderBriefStage = () => (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Target className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">Interview Complete!</h3>
          <p className="text-muted-foreground">Here's what we discovered about your experience</p>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h4 className="font-medium">Key Insights</h4>
          </div>
          {interviewSummary ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Strengths:</p>
                <ul className="text-sm space-y-1">
                  {interviewSummary.insights.strengths.map((strength, index) => (
                    <li key={index}>• {strength}</li>
                  ))}
                </ul>
              </div>
              {interviewSummary.insights.achievements.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Achievements:</p>
                  <ul className="text-sm space-y-1">
                    {interviewSummary.insights.achievements.map((achievement, index) => (
                      <li key={index}>• {achievement}</li>
                    ))}
                  </ul>
                </div>
              )}
              {interviewSummary.newSkills.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Additional Skills Mentioned:</p>
                  <div className="flex flex-wrap gap-1">
                    {interviewSummary.newSkills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Interview summary is being processed...
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
              <span className="text-muted-foreground">Questions Asked:</span>
              <p className="font-medium">{transcript.filter(t => t.startsWith('AI:')).length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button 
          variant="outline" 
          onClick={() => setShowTranscriptDialog(true)}
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
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">AI Interview</DialogTitle>
          </DialogHeader>
          {stage === 'initial' && renderInitialStage()}
          {stage === 'voice_selection' && renderVoiceSelectionStage()}
          {stage === 'connecting' && renderConnectingStage()}
          {stage === 'recording' && renderRecordingStage()}
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
          <div className="space-y-4 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Duration: {formatTime(currentTime)}</span>
              <Separator orientation="vertical" className="h-4" />
              <span>{job.title} at {job.company}</span>
            </div>
            <Separator />
            <div className="space-y-4">
              {transcript.map((message, index) => (
                <div key={index} className={`p-3 rounded-lg ${
                  message.startsWith('AI:') 
                    ? 'bg-primary/5 border-l-4 border-primary' 
                    : 'bg-muted/50 border-l-4 border-muted-foreground'
                }`}>
                  <div className="text-sm font-medium mb-1">
                    {message.startsWith('AI:') ? 'AI Interviewer' : 'You'}
                  </div>
                  <div className="text-sm">
                    {message.replace(/^(AI:|You:)\s*/, '')}
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