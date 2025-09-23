import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Volume2, Play, Loader2 } from "lucide-react";
import { humeVoiceInterviewApi, VoiceOption } from "@/services/humeVoiceInterviewApi";
import { useToast } from "@/hooks/use-toast";

interface VoiceSelectionProps {
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function VoiceSelection({ 
  selectedVoice, 
  onVoiceChange, 
  onConfirm, 
  onCancel,
  isLoading = false 
}: VoiceSelectionProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      setLoading(true);
      const voiceOptions = await humeVoiceInterviewApi.getVoiceOptions();
      setVoices(voiceOptions);
      
      // Set default voice if none selected
      if (!selectedVoice && voiceOptions.length > 0) {
        onVoiceChange(voiceOptions[0].id);
      }
    } catch (error) {
      console.error('Error loading voices:', error);
      toast({
        title: "Error Loading Voices",
        description: "Could not load voice options. Using default voice.",
        variant: "destructive"
      });
      
      // Fallback voices
      const fallbackVoices: VoiceOption[] = [
        { id: 'luna', name: 'Luna', gender: 'female', description: 'Friendly and approachable' },
        { id: 'stella', name: 'Stella', gender: 'female', description: 'Professional and confident' },
        { id: 'angus', name: 'Angus', gender: 'male', description: 'Warm and professional' },
        { id: 'orpheus', name: 'Orpheus', gender: 'male', description: 'Confident and clear' },
        { id: 'hera', name: 'Hera', gender: 'neutral', description: 'Calm and steady' },
        { id: 'asteria', name: 'Asteria', gender: 'neutral', description: 'Energetic and engaging' }
      ];
      setVoices(fallbackVoices);
      if (!selectedVoice) {
        onVoiceChange('luna');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySample = async (voiceId: string) => {
    try {
      setPlayingVoice(voiceId);
      
      // Stop any currently playing audio
      if (window.currentVoiceAudio) {
        window.currentVoiceAudio.pause();
        window.currentVoiceAudio = null;
      }
      
      console.log(`🎵 Playing voice sample for: ${voiceId}`);
      
      // Generate voice preview
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/voice-interview/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice: voiceId,
          text: "Hello! I'm excited to help you prepare for your interview today."
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate voice preview: ${response.status}`);
      }

      console.log('Response content-type:', response.headers.get('content-type'));
      
      const audioBlob = await response.blob();
      console.log('Audio blob size:', audioBlob.size, 'type:', audioBlob.type);
      
      // Force correct MIME type for MP3 since Hume returns MP3
      const correctedBlob = new Blob([audioBlob], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(correctedBlob);
      
      const audio = new Audio();
      
      // Set up event handlers before setting src
      audio.onloadstart = () => console.log('🔄 Audio loading started');
      audio.onloadeddata = () => console.log('✅ Audio data loaded');
      audio.oncanplay = () => console.log('✅ Audio can start playing');
      
      audio.onended = () => {
        console.log('🔇 Audio ended');
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
        (window as any).currentVoiceAudio = null;
      };
      
      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e, audio.error);
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
        (window as any).currentVoiceAudio = null;
        
        toast({
          title: "Playback Error",
          description: `Audio error: ${audio.error?.message || 'Unknown error'}`,
          variant: "destructive"
        });
      };
      
      // Store reference to current audio for cleanup
      (window as any).currentVoiceAudio = audio;
      
      // Set source and attempt to play
      audio.src = audioUrl;
      audio.load(); // Explicitly load the audio
      
      // Add user interaction check for autoplay policy
      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          console.log('✅ Audio playing successfully');
          
          toast({
            title: "Voice Preview",
            description: `Playing sample of ${voices.find(v => v.id === voiceId)?.name}`,
          });
        }
      } catch (playError) {
        console.error('❌ Play promise rejected:', playError);
        
        if (playError.name === 'NotAllowedError') {
          toast({
            title: "Playback Blocked",
            description: "Browser blocked audio. Please interact with the page first.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Playback Error",
            description: `Could not play audio: ${playError.message}`,
            variant: "destructive"
          });
        }
        
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
        (window as any).currentVoiceAudio = null;
      }
      
    } catch (error) {
      console.error('Error playing voice sample:', error);
      toast({
        title: "Playback Error",
        description: "Could not play voice sample. Please try again.",
        variant: "destructive"
      });
      setPlayingVoice(null);
    }
  };


  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading voice options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Volume2 className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">Choose Your AI Interviewer</h3>
        <p className="text-muted-foreground text-sm">
          Select the voice that you'd be most comfortable speaking with
        </p>
      </div>

      <RadioGroup value={selectedVoice} onValueChange={onVoiceChange} className="space-y-3">
        {voices.map((voice) => (
          <Card key={voice.id} className={`p-4 cursor-pointer transition-all hover:shadow-md ${
            selectedVoice === voice.id ? 'ring-2 ring-primary bg-primary/5' : ''
          }`}>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value={voice.id} id={voice.id} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Label 
                    htmlFor={voice.id} 
                    className="font-medium cursor-pointer text-base"
                  >
                    {voice.name}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {voice.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePlaySample(voice.id)}
                disabled={playingVoice !== null}
                className="shrink-0"
              >
                {playingVoice === voice.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </div>
          </Card>
        ))}
      </RadioGroup>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Back
        </Button>
        <Button 
          onClick={onConfirm} 
          disabled={!selectedVoice || isLoading}
          className="bg-gradient-primary"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}