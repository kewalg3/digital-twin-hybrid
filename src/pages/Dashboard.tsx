import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  Mic, 
  FileText, 
  User, 
  Briefcase, 
  Brain, 
  TrendingUp,
  Settings,
  Download,
  Share,
  Star
} from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold">
                Welcome to{" "}
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  Job Twin
                </span>
              </h1>
              <p className="text-muted-foreground mt-1">
                Your voice-enhanced resume intelligence platform
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button className="bg-gradient-primary hover:opacity-90" size="sm">
                <Share className="w-4 h-4 mr-2" />
                Share Profile
              </Button>
            </div>
          </div>
        </div>

        {/* Profile Overview */}
        <Card className="p-6 mb-8">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center">
                <span className="text-xl text-primary-foreground font-bold">JD</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">John Doe</h2>
                <p className="text-muted-foreground">Software Engineer</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">Voice Enhanced</Badge>
                  <Badge variant="outline" className="text-xs">AI Optimized</Badge>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">98%</div>
              <p className="text-sm text-muted-foreground">Profile Completeness</p>
              <Progress value={98} className="w-24 mt-2" />
            </div>
          </div>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 text-center">
            <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="text-2xl font-bold">24</div>
            <p className="text-sm text-muted-foreground">Job Matches</p>
          </Card>
          
          <Card className="p-4 text-center">
            <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold">12</div>
            <p className="text-sm text-muted-foreground">Profile Views</p>
          </Card>
          
          <Card className="p-4 text-center">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold">89%</div>
            <p className="text-sm text-muted-foreground">AI Match Score</p>
          </Card>
          
          <Card className="p-4 text-center">
            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div className="text-2xl font-bold">4.8</div>
            <p className="text-sm text-muted-foreground">Profile Rating</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Voice Profile */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
                <Mic className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Voice Profile</h3>
                <p className="text-sm text-muted-foreground">Enhanced with vocal characteristics</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gradient-subtle p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Voice Analysis Complete</span>
                  <Badge className="bg-success text-success-foreground">Active</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Confidence: Professional • Tone: Warm • Pace: Natural
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Voice Insights</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Excellent communication clarity</li>
                  <li>• Professional speaking demeanor</li>
                  <li>• Strong leadership voice presence</li>
                </ul>
              </div>
              
              <Button variant="outline" size="sm" className="w-full">
                <Mic className="w-4 h-4 mr-2" />
                Re-record Voice Sample
              </Button>
            </div>
          </Card>

          {/* Resume Analysis */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Resume Intelligence</h3>
                <p className="text-sm text-muted-foreground">AI-powered optimization</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gradient-subtle rounded-lg">
                  <div className="text-lg font-bold text-primary">18</div>
                  <div className="text-xs text-muted-foreground">Skills Identified</div>
                </div>
                <div className="text-center p-3 bg-gradient-subtle rounded-lg">
                  <div className="text-lg font-bold text-primary">95%</div>
                  <div className="text-xs text-muted-foreground">ATS Compatible</div>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Optimization Suggestions</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Add quantified achievements</li>
                  <li>• Include industry keywords</li>
                  <li>• Enhance project descriptions</li>
                </ul>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button size="sm" className="flex-1 bg-gradient-primary hover:opacity-90">
                  <FileText className="w-4 h-4 mr-2" />
                  Optimize
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="p-6 mt-8">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gradient-subtle rounded-lg">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">New job match found</p>
                <p className="text-xs text-muted-foreground">Senior Software Engineer at TechCorp</p>
              </div>
              <Badge variant="outline" className="text-xs">2h ago</Badge>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-gradient-subtle rounded-lg">
              <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Profile viewed by recruiter</p>
                <p className="text-xs text-muted-foreground">Tech Solutions Inc.</p>
              </div>
              <Badge variant="outline" className="text-xs">1d ago</Badge>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-gradient-subtle rounded-lg">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">AI analysis completed</p>
                <p className="text-xs text-muted-foreground">Resume optimization suggestions ready</p>
              </div>
              <Badge variant="outline" className="text-xs">2d ago</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}