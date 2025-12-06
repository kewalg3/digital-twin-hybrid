import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Square, Play, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/authStore";

interface VoiceRecorderProps {
  onRecordingComplete?: (audioBlob: Blob) => void;
  onCloneComplete?: (voiceId: string) => void;
}

export default function VoiceRecorder({ onRecordingComplete, onCloneComplete }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isCloning, setIsCloning] = useState(false);
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Sample text for users to read during recording
  const sampleText = "Hello! I'm excited to discuss my professional experience and career goals with you. I look forward to sharing how my skills and background align with your team's needs.";

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Use the actual MIME type from MediaRecorder instead of lying about it
        const mimeType = mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: mimeType });
        setAudioBlob(blob);
        onRecordingComplete?.(blob);
        stream.getTracks().forEach(track => track.stop());

        // Immediately start cloning process
        await cloneVoice(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Speak clearly into your microphone",
      });
    } catch (error) {
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const cloneVoice = async (audioBlob: Blob) => {
    setIsCloning(true);

    try {
      const formData = new FormData();
      // Use appropriate filename based on MIME type
      const extension = audioBlob.type.includes('webm') ? 'webm' :
                       audioBlob.type.includes('mp4') ? 'mp4' : 'wav';

      // Convert Blob to File object - multer requires a proper File, not just a Blob
      const audioFile = new File([audioBlob], `voice_sample.${extension}`, {
        type: audioBlob.type,
        lastModified: Date.now()
      });
      formData.append('audio', audioFile);

      const token = useAuthStore.getState().token;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/voice/clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Voice cloning failed: ${response.status}`);
      }

      const result = await response.json();
      const voiceId = result.voiceData?.voiceId || 'cloned_voice';

      setClonedVoiceId(voiceId);
      onCloneComplete?.(voiceId);

      toast({
        title: "Voice cloned successfully!",
        description: "Your voice has been processed and is ready to use.",
      });
    } catch (error) {
      console.error('Voice cloning failed:', error);
      toast({
        title: "Voice cloning failed",
        description: "Failed to process your voice. Please try recording again.",
        variant: "destructive",
      });
    } finally {
      setIsCloning(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      toast({
        title: "Recording completed",
        description: "Processing your voice for cloning...",
      });
    }
  };

  const playRecording = () => {
    if (audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(audioUrl);
      audioRef.current.play();
      setIsPlaying(true);

      audioRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
    }
  };

  const pausePlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-6">
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Voice Recording</h3>
          <p className="text-muted-foreground text-sm">
            Record a voice sample to enhance your profile with vocal characteristics
          </p>
        </div>

        {/* Recording Visualization */}
        <div className="flex justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
            isRecording 
              ? "bg-recording animate-pulse shadow-lg" 
              : "bg-muted"
          }`}>
            <Mic className={`w-10 h-10 ${
              isRecording ? "text-recording-foreground" : "text-muted-foreground"
            }`} />
          </div>
        </div>

        {/* Timer */}
        {(isRecording || recordingTime > 0) && (
          <div className="text-2xl font-mono font-bold text-primary">
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Sample Text for Recording */}
        {isRecording && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-blue-900">Please read this text clearly:</h4>
            <p className="text-blue-800 text-lg leading-relaxed">
              {sampleText}
            </p>
            <p className="text-blue-600 text-sm">
              Speak naturally and clearly for best voice cloning results.
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center space-x-4">
          {!isRecording ? (
            <Button
              onClick={startRecording}
              size="lg"
              className="bg-gradient-primary hover:opacity-90"
            >
              <Mic className="w-5 h-5 mr-2" />
              Start Recording
            </Button>
          ) : (
            <Button
              onClick={stopRecording}
              size="lg"
              variant="destructive"
            >
              <Square className="w-5 h-5 mr-2" />
              Stop Recording
            </Button>
          )}

          {audioBlob && !isRecording && (
            <Button
              onClick={isPlaying ? pausePlayback : playRecording}
              size="lg"
              variant="outline"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-5 h-5 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Play
                </>
              )}
            </Button>
          )}
        </div>

        {/* Status Messages */}
        {isCloning && (
          <div className="text-sm text-blue-600 font-medium flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Processing your voice...
          </div>
        )}

        {clonedVoiceId && !isCloning && (
          <div className="text-sm text-green-600 font-medium">
            ✓ Voice cloned successfully
          </div>
        )}

        {audioBlob && !clonedVoiceId && !isCloning && (
          <div className="text-sm text-success font-medium">
            ✓ Voice recording ready
          </div>
        )}
      </div>
    </Card>
  );
}