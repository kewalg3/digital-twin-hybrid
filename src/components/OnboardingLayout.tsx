import { ReactNode } from "react";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  title: string;
  subtitle: string;
  onStepClick?: (step: number) => void;
}

const stepNames = [
  "Resume Upload",
  "Personal Information", 
  "Experience Enhancement",
  "Work Style & Career Goals",
  "Skills Intelligence"
];

const stepIcons = [
  "📄", "👤", "📈", "🎯", "🧠"
];

export default function OnboardingLayout({ 
  children, 
  currentStep, 
  totalSteps, 
  title, 
  subtitle,
  onStepClick
}: OnboardingLayoutProps) {
  const progressPercentage = Math.round((currentStep / totalSteps) * 100);
  const { user, logout, isAuthenticated, token } = useAuthStore();
  const navigate = useNavigate();
  
  // Debug auth state in layout
  console.log('🏠 OnboardingLayout auth state:', {
    hasUser: !!user,
    userEmail: user?.email,
    userId: user?.id,
    isAuthenticated,
    hasToken: !!token,
    tokenLength: token?.length
  });

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user) return "";
    const firstInitial = user.firstName?.charAt(0) || user.email?.charAt(0) || "";
    const lastInitial = user.lastName?.charAt(0) || "";
    return (firstInitial + lastInitial).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* User Avatar in Top Right */}
      {user && (
        <div className="absolute top-4 right-4 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none">
              <div className="w-10 h-10 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer">
                {getUserInitials()}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Onboarding
            </span>{" "}
            and{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Enhanced Resume Intelligence
            </span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Experience the future of resume processing with AI-powered skills 
            extraction, contextual job analysis, and intelligent career insights.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium text-muted-foreground">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {progressPercentage}% Complete
            </span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
        </div>

        {/* Step Icons */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center space-x-4 md:space-x-8">
            {stepNames.map((step, index) => {
              const stepNumber = index + 1;
              // Always clickable if onStepClick is provided
              const isClickable = !!onStepClick;
              
              return (
                <div key={step} className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg mb-2 transition-all ${
                      stepNumber === currentStep
                        ? "bg-gradient-primary text-white shadow-lg scale-110"
                        : stepNumber < currentStep
                        ? "bg-primary text-primary-foreground hover:bg-primary/80"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    } ${isClickable ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"}`}
                    onClick={isClickable ? () => onStepClick(stepNumber) : undefined}
                    title={isClickable ? `Go to ${step}` : `${step} (Not accessible)`}
                  >
                    {stepIcons[index]}
                  </div>
                  <span className={`text-xs text-center max-w-20 ${
                    stepNumber === currentStep ? "text-primary font-medium" : "text-muted-foreground"
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-card rounded-2xl shadow-xl border p-8">
          {children}
        </div>
      </div>
    </div>
  );
}