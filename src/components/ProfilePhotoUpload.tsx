import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfilePhotoUploadProps {
  onPhotoSelect?: (file: File) => void;
  currentPhoto?: File;
}

export default function ProfilePhotoUpload({ onPhotoSelect, currentPhoto }: ProfilePhotoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload JPG, PNG, or GIF files only",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Profile photo must be less than 2MB",
        variant: "destructive",
      });
      return;
    }

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onPhotoSelect?.(file);
    
    toast({
      title: "Profile photo updated",
      description: "Your profile photo has been uploaded successfully",
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label>Profile Photo (Optional)</Label>
      <div
        className="w-32 h-32 mx-auto border-2 border-dashed border-muted-foreground/25 rounded-full flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={openFileDialog}
      >
        {previewUrl || currentPhoto ? (
          <div className="relative w-full h-full">
            <img
              src={previewUrl || (currentPhoto ? URL.createObjectURL(currentPhoto) : '')}
              alt="Profile preview"
              className="w-full h-full object-cover rounded-full"
            />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              <p>Upload</p>
            </div>
          </div>
        )}
      </div>
      
      <p className="text-center text-xs text-muted-foreground">
        Click to upload or drag and drop<br />
        JPG, PNG, or GIF (max 2MB)
      </p>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}