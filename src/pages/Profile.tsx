import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProfileVoiceInterviewDialog from "@/components/ProfileVoiceInterviewDialog";
import { ChevronDown, Mic, MapPin, User, Target, ChevronUp, Volume2, Sparkles, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  jobTitle: string;
  currentCompany?: string;
  location: string;
  country?: string;
  linkedinUrl?: string;
  totalExperience: number;
  professionalSummary?: string;
  experiences: Array<{
    id: string;
    jobTitle: string;
    company: string;
    location: string;
    startDate: string;
    endDate?: string;
    isCurrentRole: boolean;
    description: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    category: string;
    yearsOfExp?: number;
    lastUsed?: string;
    type: 'skill' | 'software';
  }>;
}

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInterviewContextOpen, setIsInterviewContextOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [sortColumn, setSortColumn] = useState<'years' | 'lastUsed' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch user profile data on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!userId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/users/profile/${userId}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch profile');
        }
        
        if (data.success && data.profile) {
          setUserProfile(data.profile);
        } else {
          throw new Error('Invalid profile data');
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [userId]);

  // Use actual user skills data or empty array
  const skillsData = userProfile?.skills || [];

  const handleSort = (column: 'years' | 'lastUsed') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedSkills = () => {
    if (!sortColumn) return skillsData;

    return [...skillsData].sort((a, b) => {
      if (sortColumn === 'years') {
        const aYears = a.yearsOfExp || 0;
        const bYears = b.yearsOfExp || 0;
        const comparison = aYears - bYears;
        return sortDirection === 'asc' ? comparison : -comparison;
      } else if (sortColumn === 'lastUsed') {
        const aValue = a.lastUsed === 'Current' || !a.lastUsed ? '2025' : 
                      a.lastUsed.includes('-') ? new Date(a.lastUsed).getFullYear().toString() : a.lastUsed;
        const bValue = b.lastUsed === 'Current' || !b.lastUsed ? '2025' : 
                      b.lastUsed.includes('-') ? new Date(b.lastUsed).getFullYear().toString() : b.lastUsed;
        const comparison = parseInt(aValue) - parseInt(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  };

  const getSortIcon = (column: 'years' | 'lastUsed') => {
    if (sortColumn !== column) {
      return <ChevronUp className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !userProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <div className="mb-4">
            <User className="w-16 h-16 mx-auto text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Profile Not Found</h2>
          <p className="text-muted-foreground mb-6">
            {error || 'The profile you are looking for does not exist.'}
          </p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Gradient Header */}
      <div className="relative h-64 bg-gradient-to-r from-purple-600 via-blue-500 to-cyan-400">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="flex items-center gap-6">
            {/* Profile Photo */}
            <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white">
              <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <User className="w-16 h-16 text-gray-400" />
              </div>
            </div>
            
            {/* Profile Info */}
            <div className="text-white">
              <h1 className="text-4xl font-bold mb-2">{userProfile.fullName}</h1>
              <p className="text-xl text-white/90 mb-2">
                {userProfile.jobTitle}
                {userProfile.currentCompany && ` at ${userProfile.currentCompany}`}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-white/80">
                  <MapPin className="w-4 h-4" />
                  <span>{userProfile.location}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Enhanced Interactive Voice Screening */}
          <Card className="relative overflow-hidden border-2 border-gradient-primary/20 bg-gradient-to-br from-primary/5 via-blue-500/5 to-cyan-400/5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-primary opacity-10 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="relative p-6 space-y-6">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center">
                    <Mic className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      Interactive Voice Screening
                      <Sparkles className="w-5 h-5 text-primary" />
                    </h2>
                    <p className="text-sm text-primary/80 font-medium">AI-Powered Professional Conversation</p>
                  </div>
                </div>
                
                <p className="text-muted-foreground max-w-2xl mx-auto text-center">
                  Experience next-generation candidate screening through natural conversation with our AI interviewer. 
                  Get personalized insights about my experience, skills, and professional background.
                </p>
              </div>
              
              {/* Enhanced Audio Visualization */}
              <div className="flex items-center justify-center gap-1 py-4">
                {[...Array(12)].map((_, i) => (
                  <div 
                    key={i}
                    className="rounded-full bg-gradient-to-t from-primary to-cyan-400 opacity-70"
                    style={{
                      width: '3px',
                      height: `${Math.random() * 30 + 8}px`,
                      animation: `pulse ${Math.random() * 0.8 + 0.8}s ease-in-out ${i * 0.1}s infinite alternate`
                    }}
                  ></div>
                ))}
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-primary/20">
                  <Volume2 className="w-5 h-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">Natural Conversation</p>
                    <p className="text-muted-foreground">Dynamic Q&A based on responses</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-primary/20">
                  <Target className="w-5 h-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">Smart Analysis</p>
                    <p className="text-muted-foreground">Real-time skill & fit assessment</p>
                  </div>
                </div>
              </div>

              {/* Interview Context Note */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Click "Start Voice Screening" to begin an AI-powered conversation and provide interview context.
                </p>
              </div>

              <div className="flex justify-center">
                <Button 
                  size="lg"
                  onClick={() => setShowVoiceDialog(true)}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  <Mic className="w-5 h-5 mr-3" />
                  Start Voice Screening
                  <Sparkles className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>

          {/* About Me */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">About Me</h2>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              {userProfile.professionalSummary ? (
                <p>{userProfile.professionalSummary}</p>
              ) : (
                <p>
                  I'm a {userProfile.jobTitle} with {userProfile.totalExperience || 'several'} years of experience
                  {userProfile.currentCompany && ` currently working at ${userProfile.currentCompany}`}.
                  {userProfile.experiences.length > 0 && ` I've worked with ${userProfile.experiences.length} different organizations throughout my career.`}
                </p>
              )}
              {userProfile.linkedinUrl && (
                <p>
                  Connect with me on{' '}
                  <a 
                    href={userProfile.linkedinUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    LinkedIn
                  </a>
                </p>
              )}
            </div>
          </Card>

          {/* View Resume */}
          <Collapsible open={isResumeOpen} onOpenChange={setIsResumeOpen}>
            <Card className="overflow-hidden group">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full p-6 justify-between text-left font-normal h-auto"
                >
                  <div>
                    <h2 className="text-xl font-semibold">View Resume</h2>
                    <p className="text-sm text-muted-foreground group-hover:text-white mt-1 transition-colors">
                      Complete professional background and experience
                    </p>
                  </div>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isResumeOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Separator />
                <div className="p-6 space-y-8">
                  {/* Professional Experience */}
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold">Professional Experience</h3>
                    
                    {userProfile.experiences.length > 0 ? (
                      userProfile.experiences.map((exp) => (
                        <div key={exp.id} className="border-l-4 border-primary pl-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold">{exp.jobTitle}</h4>
                              <p className="text-cyan-500 font-medium">
                                {exp.company} {exp.location && `• ${exp.location}`}
                              </p>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {new Date(exp.startDate).getFullYear()} - {' '}
                              {exp.isCurrentRole ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : 'N/A'}
                            </span>
                          </div>
                          {exp.description && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {exp.description}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No experience information available.</p>
                    )}
                  </div>

                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Skills & Expertise */}
          <Collapsible open={isSkillsOpen} onOpenChange={setIsSkillsOpen}>
            <Card className="overflow-hidden group">
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full p-6 justify-between text-left font-normal h-auto"
                >
                  <div>
                    <h2 className="text-xl font-semibold">Skills & Expertise</h2>
                    <p className="text-sm text-muted-foreground group-hover:text-white mt-1 transition-colors">
                      Advanced skills intelligence and analysis
                    </p>
                  </div>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isSkillsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Separator />
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-5 h-5" />
                    <h3 className="text-lg font-semibold">Skills & Software Summary</h3>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill/Software</TableHead>
                        <TableHead 
                          className="cursor-pointer select-none group hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('years')}
                        >
                          <div className="flex items-center gap-1">
                            Years Experience
                            {getSortIcon('years')}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer select-none group hover:bg-muted/50 transition-colors"
                          onClick={() => handleSort('lastUsed')}
                        >
                          <div className="flex items-center gap-1">
                            Last Used
                            {getSortIcon('lastUsed')}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSortedSkills().map((skill, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge 
                              variant="secondary" 
                              className={skill.type === 'skill' 
                                ? "bg-blue-50 text-blue-700 border-blue-200" 
                                : "bg-green-50 text-green-700 border-green-200"
                              }
                            >
                              {skill.name}
                            </Badge>
                          </TableCell>
                          <TableCell>{skill.yearsOfExp || 0}</TableCell>
                          <TableCell className={skill.lastUsed === 'Current' || !skill.lastUsed ? 'text-success font-medium' : ''}>
                            {skill.lastUsed ? (
                              skill.lastUsed === 'Current' ? 'Current' : 
                              skill.lastUsed.includes('-') ? new Date(skill.lastUsed).getFullYear() : 
                              skill.lastUsed
                            ) : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
      
      {/* Enhanced Voice Interview Dialog */}
      <ProfileVoiceInterviewDialog 
        isOpen={showVoiceDialog}
        onClose={() => setShowVoiceDialog(false)}
        candidateId={userProfile.id}
        candidateName={userProfile.fullName}
        candidateData={userProfile}
      />
    </div>
  );
}