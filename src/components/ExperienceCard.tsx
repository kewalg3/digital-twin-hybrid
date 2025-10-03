import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Briefcase, ChevronDown, ChevronUp, Calendar, MapPin, Plus, X } from "lucide-react";
import AIInterviewDialog from "./AIInterviewDialog";
import AutocompleteInput from "./AutocompleteInput";

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
}

interface ExperienceCardProps {
  job: Job;
  experienceId?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onJobUpdate?: (updatedJob: Job) => void;
  hasCompletedInterview?: boolean;
}

export default function ExperienceCard({ job, experienceId, isExpanded, onToggle, onJobUpdate, hasCompletedInterview = false }: ExperienceCardProps) {
  const [localJob, setLocalJob] = useState(job);
  const [skillsToAdd, setSkillsToAdd] = useState({
    skills: '',
    software: ''
  });
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);

  const updateJob = (updatedJob: Job) => {
    setLocalJob(updatedJob);
    onJobUpdate?.(updatedJob);
  };

  const handleAddSkill = (type: 'skills' | 'software', value: string) => {
    if (value.trim()) {
      const updatedJob = {
        ...localJob,
        [type]: [...localJob[type], value.trim()]
      };
      updateJob(updatedJob);
      setSkillsToAdd(prev => ({ ...prev, [type]: '' }));
    }
  };

  const handleAddSuggestedSkill = (type: 'skills' | 'software', value: string) => {
    const skillsKey = type === 'skills' ? 'skills' : 'software';
    const suggestedKey = type === 'skills' ? 'aiSuggestedSkills' : 'aiSuggestedSoftware';
    
    const updatedJob = {
      ...localJob,
      [skillsKey]: [...localJob[skillsKey], value],
      [suggestedKey]: localJob[suggestedKey].filter(item => item !== value)
    };
    updateJob(updatedJob);
  };

  const handleRemoveSkill = (type: 'skills' | 'software', value: string) => {
    const updatedJob = {
      ...localJob,
      [type]: localJob[type].filter(item => item !== value)
    };
    updateJob(updatedJob);
  };

  return (
    <Card className="p-6 border border-border hover:shadow-md transition-shadow">
      <div className="space-y-4">
        {/* Card Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-muted-foreground" />
            </div>
            
            <div className="space-y-2 flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground">{localJob.title}</h3>
              <div className="space-y-1">
                <p className="text-muted-foreground font-medium">{localJob.company}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{localJob.duration}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{localJob.location}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onToggle}>
              Skills & Software
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <>
            <Separator />
            
            {/* Job Description */}
            <div className="space-y-3">
              <h4 className="font-medium">Description</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {localJob.description}
              </p>
            </div>

            <Separator />

            {/* Skills & Software Section */}
            <div className="space-y-6">
              <h4 className="font-medium">Skills & Software</h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Skills Column */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="font-medium text-sm">Skills</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {localJob.skills.map((skill, index) => (
                        <Badge key={index} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                          {skill}
                          <button
                            onClick={() => handleRemoveSkill('skills', skill)}
                            className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    
                    {localJob.aiSuggestedSkills.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">AI Suggested Skills</p>
                        <div className="flex flex-wrap gap-2">
                          {localJob.aiSuggestedSkills.map((skill, index) => (
                            <button
                              key={index}
                              onClick={() => handleAddSuggestedSkill('skills', skill)}
                              className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              {skill}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Skills Lookup</p>
                      <AutocompleteInput
                        placeholder="Start typing to add a skill..."
                        value={skillsToAdd.skills}
                        onChange={(value) => setSkillsToAdd(prev => ({ ...prev, skills: value }))}
                        onAdd={(value) => handleAddSkill('skills', value)}
                        type="skills"
                      />
                    </div>
                  </div>
                </div>

                {/* Software Column */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium text-sm">Software</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {localJob.software.map((software, index) => (
                        <Badge key={index} variant="secondary" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                          {software}
                          <button
                            onClick={() => handleRemoveSkill('software', software)}
                            className="ml-1 hover:bg-green-200 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    
                    {localJob.aiSuggestedSoftware.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">AI Suggested Software</p>
                        <div className="flex flex-wrap gap-2">
                          {localJob.aiSuggestedSoftware.map((software, index) => (
                            <button
                              key={index}
                              onClick={() => handleAddSuggestedSkill('software', software)}
                              className="text-xs px-2 py-1 rounded border border-green-200 text-green-600 hover:bg-green-50 transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              {software}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Software Lookup</p>
                      <AutocompleteInput
                        placeholder="Start typing to add software..."
                        value={skillsToAdd.software}
                        onChange={(value) => setSkillsToAdd(prev => ({ ...prev, software: value }))}
                        onAdd={(value) => handleAddSkill('software', value)}
                        type="software"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <AIInterviewDialog 
        isOpen={showInterviewDialog}
        onClose={() => setShowInterviewDialog(false)}
        job={localJob}
      />
    </Card>
  );
}