/**
 * Simple Voice Interview Dialog - Clean Architecture
 * Uses the new HumeInterviewService with one-tool approach
 */

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, StopCircle, User, Building, Briefcase, AlertCircle } from "lucide-react";
import { humeInterviewService, type EVIMessage, type EVISessionData } from "@/services/humeInterview";

interface SimpleVoiceInterviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  candidateData: any;
}

type InterviewStage = 'setup' | 'connecting' | 'interviewing' | 'completed';

export default function SimpleVoiceInterviewDialog({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  candidateData
}: SimpleVoiceInterviewDialogProps) {

  // Core state
  const [stage, setStage] = useState<InterviewStage>('setup');
  const [transcript, setTranscript] = useState<EVIMessage[]>([]);
  const [currentSession, setCurrentSession] = useState<EVISessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiIsSpeaking, setAiIsSpeaking] = useState(false);

  // Recruiter context
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterTitle, setRecruiterTitle] = useState('');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [jobDescription, setJobDescription] = useState('');

  // Timer
  const [interviewTime, setInterviewTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  /**
   * Setup event handlers when dialog opens
   */
  useEffect(() => {
    if (!isOpen) return;

    // Setup message handlers
    humeInterviewService.onMessage('user_message', (data: { content: string }) => {
      setTranscript(prev => [...prev, {
        type: 'user_message',
        content: data.content,
        timestamp: new Date().toISOString()
      }]);
    });

    humeInterviewService.onMessage('assistant_message', (data: { content: string }) => {
      setTranscript(prev => [...prev, {
        type: 'assistant_message',
        content: data.content,
        timestamp: new Date().toISOString()
      }]);
    });

    humeInterviewService.onMessage('audio_output', () => {
      setAiIsSpeaking(true);
    });

    humeInterviewService.onMessage('disconnected', () => {
      console.log('Interview disconnected');
      setStage('completed');
      stopTimer();
    });

    return () => {
      // Cleanup on unmount
      stopTimer();
    };
  }, [isOpen]);

  /**
   * Auto-scroll transcript
   */
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  /**
   * Start interview
   */
  const startInterview = async () => {
    try {
      setError(null);
      setStage('connecting');

      console.log('🎯 Starting interview with clean architecture');

      // Build recruiter context
      const recruiterContext = {
        recruiterName: recruiterName || 'the recruiter',
        recruiterTitle,
        company,
        position,
        jobDescription
      };

      console.log('📋 Recruiter context:', recruiterContext);

      // Start interview with simple service
      const session = await humeInterviewService.startInterview(
        candidateId,
        candidateData,
        recruiterContext
      );

      console.log('✅ Interview started:', session);

      setCurrentSession(session);
      setStage('interviewing');
      startTimer();

    } catch (err) {
      console.error('❌ Error starting interview:', err);
      setError(err instanceof Error ? err.message : 'Failed to start interview');
      setStage('setup');
    }
  };

  /**
   * End interview
   */
  const endInterview = async () => {
    try {
      console.log('🛑 Ending interview');

      const result = await humeInterviewService.endInterview();
      console.log('📋 Final transcript:', result.transcript);

      setTranscript(result.transcript);
      setStage('completed');
      stopTimer();

    } catch (err) {
      console.error('❌ Error ending interview:', err);
      setError(err instanceof Error ? err.message : 'Failed to end interview properly');
    }
  };

  /**
   * Timer functions
   */
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setInterviewTime(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * Format time for display
   */
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Handle dialog close
   */
  const handleClose = () => {
    if (stage === 'interviewing') {
      endInterview();
    }
    stopTimer();
    onClose();

    // Reset state
    setStage('setup');
    setTranscript([]);
    setCurrentSession(null);
    setError(null);
    setInterviewTime(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Voice Interview with {candidateName}
            {stage === 'interviewing' && (
              <Badge variant="default" className="ml-2">
                <Volume2 className="w-3 h-3 mr-1" />
                {formatTime(interviewTime)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 h-[600px]">
          {/* Left Panel - Setup/Controls */}
          <div className="w-1/3 flex flex-col gap-4">

            {/* Interview Setup */}
            {stage === 'setup' && (
              <Card className="p-4 flex-1">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Interview Context (Optional)
                </h3>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="recruiterName" className="text-sm">Your Name</Label>
                    <Input
                      id="recruiterName"
                      placeholder="John Smith"
                      value={recruiterName}
                      onChange={(e) => setRecruiterName(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="company" className="text-sm">Company</Label>
                    <Input
                      id="company"
                      placeholder="Acme Corp"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="position" className="text-sm">Position</Label>
                    <Input
                      id="position"
                      placeholder="Senior Software Engineer"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="jobDescription" className="text-sm">Job Requirements</Label>
                    <Textarea
                      id="jobDescription"
                      placeholder="Looking for someone with..."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="text-sm"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <Button
                    onClick={startInterview}
                    className="w-full"
                    size="lg"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Start Voice Interview
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    The AI will embody {candidateName} and answer your questions using their real background data.
                  </p>
                </div>
              </Card>
            )}

            {/* Interview Status */}
            {stage !== 'setup' && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Interview Status</h3>
                  <Badge variant={
                    stage === 'connecting' ? 'secondary' :
                    stage === 'interviewing' ? 'default' :
                    'outline'
                  }>
                    {stage === 'connecting' && 'Connecting...'}
                    {stage === 'interviewing' && 'Live'}
                    {stage === 'completed' && 'Completed'}
                  </Badge>
                </div>

                {stage === 'interviewing' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Volume2 className="w-4 h-4" />
                      Duration: {formatTime(interviewTime)}
                    </div>

                    {aiIsSpeaking && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                        AI is speaking...
                      </div>
                    )}

                    <Button
                      onClick={endInterview}
                      variant="destructive"
                      size="sm"
                      className="w-full mt-4"
                    >
                      <StopCircle className="w-4 h-4 mr-2" />
                      End Interview
                    </Button>
                  </div>
                )}

                {stage === 'completed' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Interview completed in {formatTime(interviewTime)}
                    </p>
                    <p className="text-sm">
                      {transcript.length} messages exchanged
                    </p>
                  </div>
                )}
              </Card>
            )}

            {/* Candidate Info */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Candidate Profile
              </h3>

              <div className="space-y-2 text-sm">
                <p><strong>Name:</strong> {candidateData.fullName}</p>
                {candidateData.currentExperience && (
                  <p><strong>Current Role:</strong> {candidateData.currentExperience.jobTitle}</p>
                )}
                {candidateData.currentExperience && (
                  <p><strong>Company:</strong> {candidateData.currentExperience.company}</p>
                )}
                <p><strong>Total Experience:</strong> {candidateData.experienceTimeline?.length || 0} roles</p>
              </div>
            </Card>

            {/* Error Display */}
            {error && (
              <Card className="p-4 border-red-200 bg-red-50">
                <div className="flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              </Card>
            )}
          </div>

          {/* Right Panel - Transcript */}
          <div className="flex-1 flex flex-col">
            <Card className="flex-1 p-4">
              <h3 className="font-semibold mb-4">Live Transcript</h3>

              <div
                ref={transcriptRef}
                className="flex-1 overflow-y-auto space-y-3 max-h-[500px] pr-2"
              >
                {transcript.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Transcript will appear here during the interview</p>
                  </div>
                ) : (
                  transcript.map((message, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        message.type === 'user_message'
                          ? 'bg-blue-50 border-l-4 border-blue-400'
                          : 'bg-gray-50 border-l-4 border-green-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-xs font-medium">
                          {message.type === 'user_message' ? (
                            <>
                              <User className="w-3 h-3 inline mr-1" />
                              {recruiterName || 'Recruiter'}
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3 inline mr-1" />
                              {candidateName}
                            </>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed">{message.content}</p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}