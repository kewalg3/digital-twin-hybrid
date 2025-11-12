import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, ChevronDown, ChevronUp, Calendar, MapPin, Plus, X, Pencil, Save, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AIInterviewDialog from "./AIInterviewDialog";
import AutocompleteInput from "./AutocompleteInput";
import LocationInput from "./LocationInput";
import { useAuthStore } from "@/store/authStore";

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
  startDate?: string;
  endDate?: string;
  isCurrentRole?: boolean;
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
  const { token } = useAuthStore();
  const [localJob, setLocalJob] = useState(job);

  const MonthYearPicker = ({ value, onChange, disabled = false, placeholder = "Select Date" }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState('');

    const months = [
      { value: '01', label: 'Jan' },
      { value: '02', label: 'Feb' },
      { value: '03', label: 'Mar' },
      { value: '04', label: 'Apr' },
      { value: '05', label: 'May' },
      { value: '06', label: 'Jun' },
      { value: '07', label: 'Jul' },
      { value: '08', label: 'Aug' },
      { value: '09', label: 'Sep' },
      { value: '10', label: 'Oct' },
      { value: '11', label: 'Nov' },
      { value: '12', label: 'Dec' },
    ];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1950 + 1 }, (_, i) => currentYear - i);

    // Initialize selected values from prop
    React.useEffect(() => {
      if (value && value.includes('/')) {
        const [month, year] = value.split('/');
        setSelectedMonth(month);
        setSelectedYear(year);
      } else {
        setSelectedMonth('');
        setSelectedYear('');
      }
    }, [value]);

    const displayValue = value && value !== "" ? value : placeholder;

    const handleOk = () => {
      if (selectedMonth && selectedYear) {
        onChange(`${selectedMonth}/${selectedYear}`);
      }
      setIsOpen(false);
    };

    const handleCancel = () => {
      if (value && value.includes('/')) {
        const [month, year] = value.split('/');
        setSelectedMonth(month);
        setSelectedYear(year);
      } else {
        setSelectedMonth('');
        setSelectedYear('');
      }
      setIsOpen(false);
    };

    return (
      <Select open={isOpen} onOpenChange={setIsOpen} disabled={disabled}>
        <SelectTrigger className="text-sm">
          <span className="text-sm">{displayValue}</span>
        </SelectTrigger>
        <SelectContent className="w-80">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4 mb-4 font-medium text-sm border-b pb-2">
              <div className="text-center">Month</div>
              <div className="text-center">Year</div>
            </div>
            <div className="grid grid-cols-2 gap-4 h-48">
              {/* Month Column */}
              <div className="overflow-y-auto border rounded p-2">
                {months.map((month) => (
                  <div
                    key={month.value}
                    className={`p-2 text-sm cursor-pointer rounded hover:bg-muted text-center ${
                      selectedMonth === month.value ? 'bg-blue-500 text-white' : ''
                    }`}
                    onClick={() => setSelectedMonth(month.value)}
                  >
                    {month.label}
                  </div>
                ))}
              </div>

              {/* Year Column */}
              <div className="overflow-y-auto border rounded p-2">
                {years.map((year) => (
                  <div
                    key={year}
                    className={`p-2 text-sm cursor-pointer rounded hover:bg-muted text-center ${
                      selectedYear === year.toString() ? 'bg-blue-500 text-white' : ''
                    }`}
                    onClick={() => setSelectedYear(year.toString())}
                  >
                    {year}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleCancel} className="flex-1">
                Cancel
              </Button>
              <Button size="sm" onClick={handleOk} className="flex-1">
                Ok
              </Button>
            </div>
          </div>
        </SelectContent>
      </Select>
    );
  };

  const formatDateToMMYYYY = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${year}`;
  };

  const parseMMYYYYToDate = (mmyyyy: string) => {
    if (!mmyyyy || !mmyyyy.includes('/')) return '';
    const [month, year] = mmyyyy.split('/');
    if (!month || !year || month.length !== 2 || year.length !== 4) return '';
    return `${year}-${month}-01`;
  };

  const [skillsToAdd, setSkillsToAdd] = useState({
    skills: '',
    software: ''
  });
  const [showInterviewDialog, setShowInterviewDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    startDate: job.startDate ? formatDateToMMYYYY(job.startDate) : '',
    endDate: job.endDate ? formatDateToMMYYYY(job.endDate) : '',
    isCurrentRole: job.isCurrentRole || false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  const handleSaveEdit = async () => {
    if (!experienceId) {
      setSaveError('Experience ID is missing');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatePayload = {
        jobTitle: editData.title,
        company: editData.company,
        location: editData.location,
        description: editData.description,
        startDate: parseMMYYYYToDate(editData.startDate),
        endDate: editData.isCurrentRole ? null : parseMMYYYYToDate(editData.endDate),
        isCurrentRole: editData.isCurrentRole
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL}/experiences/${experienceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify(updatePayload),
      });

      if (response.ok) {
        // Update local job state
        const updatedJob = {
          ...localJob,
          title: editData.title,
          company: editData.company,
          location: editData.location,
          description: editData.description,
          startDate: parseMMYYYYToDate(editData.startDate),
          endDate: parseMMYYYYToDate(editData.endDate),
          isCurrentRole: editData.isCurrentRole,
          duration: editData.startDate && (editData.endDate || editData.isCurrentRole) ?
            `${editData.startDate.split('/')[1]} - ${
              editData.isCurrentRole ? 'Present' : editData.endDate.split('/')[1]
            }` : 'Duration not specified',
        };

        updateJob(updatedJob);
        setSaveSuccess(true);

        // Auto-close edit mode after success
        setTimeout(() => {
          setIsEditing(false);
          setSaveSuccess(false);
        }, 1500);
      } else {
        const errorData = await response.text();
        setSaveError(`Failed to save: ${response.status} ${errorData}`);
      }
    } catch (error) {
      setSaveError(`Error saving changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditData({
      title: localJob.title,
      company: localJob.company,
      location: localJob.location,
      description: localJob.description,
      startDate: localJob.startDate ? formatDateToMMYYYY(localJob.startDate) : '',
      endDate: localJob.endDate ? formatDateToMMYYYY(localJob.endDate) : '',
      isCurrentRole: localJob.isCurrentRole || false
    });
    setIsEditing(false);
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
              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    value={editData.title}
                    onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Job Title"
                    className="text-lg font-semibold"
                  />
                  <Input
                    value={editData.company}
                    onChange={(e) => setEditData(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="Company Name"
                    className="font-medium"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <MonthYearPicker
                        value={editData.startDate}
                        onChange={(value) => setEditData(prev => ({ ...prev, startDate: value }))}
                        placeholder="Start Date (MM/YYYY)"
                      />
                      <label className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={editData.isCurrentRole}
                          onChange={(e) => setEditData(prev => ({ ...prev, isCurrentRole: e.target.checked, endDate: e.target.checked ? '' : prev.endDate }))}
                        />
                        Current
                      </label>
                    </div>
                    <div>
                      <MonthYearPicker
                        value={editData.endDate}
                        onChange={(value) => setEditData(prev => ({ ...prev, endDate: value }))}
                        placeholder="End Date (MM/YYYY)"
                        disabled={editData.isCurrentRole}
                      />
                    </div>
                    <LocationInput
                      value={editData.location}
                      onChange={(value) => setEditData(prev => ({ ...prev, location: value }))}
                      placeholder="Location"
                      className="text-sm"
                    />
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <XCircle className="w-4 h-4" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span className="ml-1">Saving...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <span className="text-green-600">✓</span>
                      <span className="ml-1">Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => {
                setIsEditing(!isEditing);
                setSaveError(null);
                setSaveSuccess(false);
                // Auto-expand card when entering edit mode
                if (!isExpanded && !isEditing) {
                  onToggle();
                }
              }}>
                <Pencil className="w-4 h-4" />
              </Button>
            )}
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

        {/* Error and Success Messages */}
        {(saveError || saveSuccess) && (
          <div className={`p-3 rounded-md text-sm ${
            saveError
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {saveError ? (
              <>
                <span className="font-medium">Error: </span>
                {saveError}
              </>
            ) : (
              <>
                <span className="font-medium">✓ Success: </span>
                Changes saved successfully!
              </>
            )}
          </div>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <>
            <Separator />
            
            {/* Job Description */}
            <div className="space-y-3">
              <h4 className="font-medium">Description</h4>
              {isEditing ? (
                <Textarea
                  value={editData.description}
                  onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Job Description"
                  className="text-sm leading-relaxed min-h-20"
                  rows={4}
                />
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {localJob.description}
                </p>
              )}
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