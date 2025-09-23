import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onFileSelect?: (file: File) => void;
  acceptedFileTypes?: string;
  maxFileSize?: number; // in MB
  isUploading?: boolean;
}

export default function FileUpload({ 
  onFileSelect, 
  acceptedFileTypes = ".pdf,.doc,.docx",
  maxFileSize = 10,
  isUploading = false
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = acceptedFileTypes.split(',').map(type => type.trim());
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: `Please upload ${acceptedFileTypes} files only`,
        variant: "destructive",
      });
      return;
    }

    // Validate file size
    if (file.size > maxFileSize * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `File size must be less than ${maxFileSize}MB`,
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
    onFileSelect?.(file);
    
    toast({
      title: "File uploaded successfully",
      description: `${file.name} is ready for processing`,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
          <h3 className="text-lg font-semibold">Upload your resume</h3>
          <p className="text-sm text-muted-foreground">
            PDF, DOC, or DOCX files supported
          </p>
        </div>

        {/* Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
            isDragOver
              ? "border-primary bg-primary/5"
              : uploadedFile
              ? "border-success bg-success/5"
              : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFileDialog}
        >
          {isUploading ? (
            <div className="space-y-3">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <div>
                <p className="font-medium text-primary">Uploading and analyzing...</p>
                <p className="text-sm text-muted-foreground">Please wait while we process your resume</p>
              </div>
            </div>
          ) : uploadedFile ? (
            <div className="space-y-3">
              <CheckCircle className="w-12 h-12 mx-auto text-success" />
              <div>
                <p className="font-medium text-success">File uploaded successfully</p>
                <p className="text-sm text-muted-foreground">{uploadedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">Drop your resume here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse files
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Choose File Button */}
        <div className="text-center">
          <Button 
            onClick={openFileDialog}
            className="bg-gradient-primary hover:opacity-90"
            size="lg"
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              "Choose File"
            )}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFileTypes}
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* File requirements */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Supported formats: PDF, DOC, DOCX</p>
          <p>Maximum file size: {maxFileSize}MB</p>
        </div>
      </div>
    </Card>
  );
}