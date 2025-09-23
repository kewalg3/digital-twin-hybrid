# Digital Twin Voice Interview Platform - Hybrid Edition

A modern, comprehensive full-stack application that creates AI-powered voice replicas of job candidates for recruiters to interview. This hybrid version combines the best of both worlds: the beautiful shadcn-ui design system with comprehensive Digital Twin functionality.

## 🎨 **What Makes This Special**

### **Modern UI with shadcn-ui**
- **Professional Components**: Uses the industry-leading shadcn-ui component library
- **Consistent Design**: Radix UI primitives with Tailwind CSS styling
- **Better UX**: Smooth animations, proper accessibility, and mobile-first design
- **Theme Support**: Built-in light/dark mode with CSS variables

### **Comprehensive Backend**
- **Full API Integration**: OpenAI, Hume.ai, Text Kernel, LiveKit
- **Real-time Features**: WebSocket support for voice conversations
- **Secure Architecture**: JWT authentication, rate limiting, file validation
- **Production Ready**: Comprehensive error handling and logging

## 🚀 **Tech Stack**

### **Frontend (Upgraded)**
- **Vite** - Lightning-fast build tool
- **React 18** with TypeScript
- **shadcn-ui** - Modern component library
- **Tailwind CSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **TanStack Query** - Powerful data fetching
- **React Router 6** - Modern routing
- **React Hook Form** - Form handling
- **Zod** - Runtime type validation

### **Backend (Proven)**
- **Node.js** with Express.js
- **PostgreSQL** with Prisma ORM
- **JWT Authentication**
- **AWS S3** file storage
- **WebSocket** real-time communication

### **AI Integrations**
- **OpenAI GPT-4** - Interview questions and responses
- **Hume.ai** - Voice synthesis and cloning
- **Text Kernel** - Resume parsing
- **LiveKit** - Real-time voice communication

## 📦 **Installation**

### **1. Clone and Setup**
```bash
git clone <repository-url>
cd digital-twin-hybrid

# Install frontend dependencies
npm install

# Setup backend
cd backend
npm install
cp env.example .env
# Configure your environment variables
```

### **2. Database Setup**
```bash
cd backend
npm run db:generate
npm run db:migrate
```

### **3. Start Development**
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd ..
npm run dev
```

## 🎯 **Environment Configuration**

### **Frontend (.env)**
```env
VITE_API_URL=http://localhost:5000/api
```

### **Backend (.env)**
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/digital_twin_db"

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# AWS S3
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=digital-twin-uploads

# AI Services
HUME_API_KEY=your-hume-api-key
OPENAI_API_KEY=your-openai-api-key
TEXT_KERNEL_API_KEY=your-text-kernel-api-key
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_SECRET=your-livekit-secret
LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
```

## ✨ **Key Features**

### **🔐 Authentication System**
- Beautiful login/register forms with shadcn-ui
- JWT-based secure authentication
- Protected routes with elegant loading states
- Profile management

### **📄 Resume Processing**
- Drag-and-drop file upload with progress
- AI-powered parsing with Text Kernel
- Skills and experience extraction
- Visual resume analytics

### **🎤 Voice Management**
- Voice selection from Hume.ai library
- Custom voice profile creation
- Real-time voice preview
- Audio quality controls

### **🤖 AI Interview System**
- Dynamic question generation
- Voice recording with waveform visualization
- Progress tracking
- Interview analytics

### **👥 Digital Twin Chat**
- Real-time voice conversations
- Context-aware AI responses
- Conversation history
- Recruiter dashboard

## 🎨 **UI Components**

### **Available shadcn-ui Components**
- ✅ **Forms**: Input, Button, Label, Checkbox, Radio, Select
- ✅ **Layout**: Card, Separator, Tabs, Accordion
- ✅ **Feedback**: Toast, Alert, Progress, Skeleton
- ✅ **Navigation**: Sidebar, Breadcrumb, Pagination
- ✅ **Overlay**: Dialog, Sheet, Popover, Tooltip
- ✅ **Data**: Table, Chart, Calendar, Badge

### **Custom Components**
- **ProtectedRoute**: Authentication wrapper
- **VoiceRecorder**: Audio recording with visualization
- **FileUpload**: Drag-and-drop with progress
- **InterviewDialog**: AI interview interface

## 📱 **Pages Overview**

### **Public Pages**
- **Landing Page** (`/`) - Beautiful hero section with features
- **Login** (`/auth/login`) - Elegant authentication form

### **Protected Pages**
- **Dashboard** (`/dashboard`) - Overview with analytics
- **Onboarding** (`/beta-onboarding`) - Resume upload and setup
- **Profile** (`/profile`) - User settings and preferences
- **Interviews** - AI interview sessions
- **Voice Setup** - Voice profile management
- **Digital Twin Chat** - Real-time conversations

## 🔧 **Development**

### **Available Scripts**
```bash
# Frontend development
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint

# Backend development
cd backend
npm run dev          # Start Express server
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio
```

### **Project Structure**
```
digital-twin-hybrid/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn-ui components
│   │   └── auth/            # Authentication components
│   ├── pages/
│   │   ├── auth/            # Login/register pages
│   │   └── ...              # Feature pages
│   ├── store/               # Zustand stores
│   ├── services/            # API services
│   ├── types/               # TypeScript types
│   └── lib/                 # Utilities
├── backend/                 # Express.js server
├── public/                  # Static assets
└── ...                      # Config files
```

## 🚀 **What You'll See**

### **Landing Page**
- Modern gradient hero section
- Feature cards with icons
- Call-to-action buttons
- Responsive design

### **Login Page**
- Clean, centered card layout
- Password visibility toggle
- Form validation with error states
- Loading states with spinners

### **Dashboard**
- Statistics cards
- Quick action buttons
- Recent activity feed
- Sidebar navigation

## 🎯 **Advantages of This Hybrid Approach**

### **Better UI/UX**
- ✅ **Professional Design**: shadcn-ui components look amazing
- ✅ **Consistent Styling**: Design system ensures consistency
- ✅ **Better Accessibility**: Radix UI primitives are accessible by default
- ✅ **Modern Tooling**: Vite provides faster development

### **Robust Backend**
- ✅ **Full Functionality**: All Digital Twin features implemented
- ✅ **Production Ready**: Proper error handling and security
- ✅ **Scalable Architecture**: Clean separation of concerns
- ✅ **Real-time Features**: WebSocket and voice support

### **Developer Experience**
- ✅ **Fast Development**: Vite HMR is instant
- ✅ **Type Safety**: Full TypeScript support
- ✅ **Modern Patterns**: React 18, hooks, suspense
- ✅ **Great DX**: ESLint, Prettier, auto-completion

## 📈 **Next Steps**

1. **Configure API Keys**: Add your service API keys to backend/.env
2. **Database Setup**: Run migrations and seed data
3. **Customize Theme**: Modify CSS variables in index.css
4. **Add Features**: Build additional Digital Twin functionality
5. **Deploy**: Use Vercel/Netlify for frontend, Railway/Heroku for backend

## 🤝 **Contributing**

This hybrid approach combines the best of both projects:
- **Your original UI**: Beautiful shadcn-ui components and modern design
- **My backend work**: Comprehensive Digital Twin functionality

The result is a production-ready application with professional UI and robust features.

---

**Ready to see your Digital Twin in action? 🚀**