import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Mic, FileText, Brain, Zap, Star, Users, ArrowRight } from "lucide-react";
import AuthModal from "@/components/AuthModal";

const Index = () => {
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="text-center mb-16">
          <Badge className="mb-6 bg-gradient-primary text-primary-foreground">
            🚀 Beta Version Available
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Digital Twin
            </span>
            <br />
            <span className="text-foreground">Voice Interview</span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Platform
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Experience the future of resume processing with AI-powered skills extraction, 
            contextual job analysis, and intelligent career insights enhanced by your unique voice profile.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-primary hover:opacity-90 text-lg px-8"
              onClick={() => setAuthModalOpen(true)}
            >
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card className="p-6 text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Voice-Enhanced Profiles</h3>
            <p className="text-muted-foreground">
              Add personality and authenticity to your resume with voice recordings that showcase your communication skills.
            </p>
          </Card>

          <Card className="p-6 text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-3">AI Resume Intelligence</h3>
            <p className="text-muted-foreground">
              Leverage advanced AI to extract skills, analyze content, and optimize your resume for better job matching.
            </p>
          </Card>

          <Card className="p-6 text-center hover:shadow-lg transition-shadow">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Instant Processing</h3>
            <p className="text-muted-foreground">
              Get immediate insights and recommendations with our lightning-fast AI processing and analysis engine.
            </p>
          </Card>
        </div>

        {/* How It Works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                1
              </div>
              <h4 className="font-semibold mb-2">Upload Resume</h4>
              <p className="text-sm text-muted-foreground">Upload your existing resume in PDF, DOC, or DOCX format</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                2
              </div>
              <h4 className="font-semibold mb-2">Record Voice</h4>
              <p className="text-sm text-muted-foreground">Add a voice sample to enhance your professional profile</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                3
              </div>
              <h4 className="font-semibold mb-2">AI Analysis</h4>
              <p className="text-sm text-muted-foreground">Our AI processes and optimizes your profile for maximum impact</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-primary-foreground font-bold">
                4
              </div>
              <h4 className="font-semibold mb-2">Get Matched</h4>
              <p className="text-sm text-muted-foreground">Receive personalized job recommendations and insights</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <Card className="p-8 mb-16 bg-gradient-primary text-primary-foreground">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold mb-2">10,000+</div>
              <p className="text-primary-foreground/80">Resumes Enhanced</p>
            </div>
            <div>
              <div className="text-3xl font-bold mb-2">95%</div>
              <p className="text-primary-foreground/80">User Satisfaction</p>
            </div>
            <div>
              <div className="text-3xl font-bold mb-2">3x</div>
              <p className="text-primary-foreground/80">Faster Job Matching</p>
            </div>
          </div>
        </Card>

        {/* Testimonials */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-12">What Our Users Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="p-6">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">
                "Job Twin transformed my job search. The voice feature made my application stand out, 
                and I landed my dream job in just 2 weeks!"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">
                  S
                </div>
                <div>
                  <p className="font-medium">Sarah Chen</p>
                  <p className="text-sm text-muted-foreground">Software Engineer</p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-muted-foreground mb-4">
                "The AI insights were incredible. It identified skills I didn't even know I had and 
                optimized my resume perfectly for my industry."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                  M
                </div>
                <div>
                  <p className="font-medium">Michael Rodriguez</p>
                  <p className="text-sm text-muted-foreground">Marketing Director</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <Card className="p-8 text-center bg-gradient-subtle">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Career?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Join thousands of professionals who have already enhanced their resumes with Job Twin's 
            voice-powered AI technology. Start your journey today.
          </p>
          <Button 
            size="lg" 
            className="bg-gradient-primary hover:opacity-90 text-lg px-8"
            onClick={() => setAuthModalOpen(true)}
          >
            Start Free Beta
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Card>
      </div>
      
      {/* Authentication Modal */}
      <AuthModal 
        open={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
      />
    </div>
  );
};

export default Index;
