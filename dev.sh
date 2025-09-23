#!/bin/bash

# Development Environment Management Script for Digital Twin Hybrid
# This script properly manages both frontend and backend servers

echo "🚀 Digital Twin Development Environment Manager"
echo "=============================================="

# Set paths
BACKEND_DIR="/Users/kewalgosrani/digital-twin-hybrid/backend"
FRONTEND_DIR="/Users/kewalgosrani/digital-twin-hybrid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if port is in use
check_port() {
    if lsof -i :$1 >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $1 is already in use${NC}"
        lsof -i :$1
        return 1
    else
        echo -e "${GREEN}✅ Port $1 is available${NC}"
        return 0
    fi
}

# Function to kill processes
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up existing processes...${NC}"
    
    # Kill backend processes
    pkill -f "node.*app.js" 2>/dev/null
    pkill -f "node.*working-server" 2>/dev/null
    pkill -f "nodemon" 2>/dev/null
    
    # Kill frontend processes
    pkill -f "vite" 2>/dev/null
    
    # Wait for processes to die
    sleep 2
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Function to start backend
start_backend() {
    echo -e "\n${YELLOW}🔧 Starting backend server...${NC}"
    cd $BACKEND_DIR
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Backend package.json not found!${NC}"
        return 1
    fi
    
    # Start backend with monitoring
    npm start > backend.log 2>&1 &
    BACKEND_PID=$!
    
    # Wait for backend to start
    echo -n "Waiting for backend to start"
    for i in {1..10}; do
        if curl -s http://localhost:3001/health >/dev/null 2>&1; then
            echo -e "\n${GREEN}✅ Backend started successfully (PID: $BACKEND_PID)${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e "\n${RED}❌ Backend failed to start${NC}"
    tail -n 20 backend.log
    return 1
}

# Function to start frontend
start_frontend() {
    echo -e "\n${YELLOW}🎨 Starting frontend server...${NC}"
    cd $FRONTEND_DIR
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ Frontend package.json not found!${NC}"
        return 1
    fi
    
    # Start frontend
    npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    
    # Wait for frontend to start
    echo -n "Waiting for frontend to start"
    for i in {1..10}; do
        if curl -s http://localhost:8080 >/dev/null 2>&1; then
            echo -e "\n${GREEN}✅ Frontend started successfully (PID: $FRONTEND_PID)${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo -e "\n${RED}❌ Frontend failed to start${NC}"
    tail -n 20 frontend.log
    return 1
}

# Function to show status
show_status() {
    echo -e "\n${YELLOW}📊 System Status:${NC}"
    echo "=================="
    
    # Check backend
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        echo -e "Backend:  ${GREEN}✅ Running${NC} - http://localhost:3001"
    else
        echo -e "Backend:  ${RED}❌ Not running${NC}"
    fi
    
    # Check frontend
    if curl -s http://localhost:8080 >/dev/null 2>&1; then
        echo -e "Frontend: ${GREEN}✅ Running${NC} - http://localhost:8080"
        echo -e "Beta Onboarding: http://localhost:8080/beta-onboarding"
    else
        echo -e "Frontend: ${RED}❌ Not running${NC}"
    fi
    
    echo -e "\nProcess IDs:"
    echo "Backend PID:  ${BACKEND_PID:-Not running}"
    echo "Frontend PID: ${FRONTEND_PID:-Not running}"
}

# Main execution
echo -e "${YELLOW}🔍 Checking current state...${NC}"

# Check ports
check_port 3001
BACKEND_PORT_FREE=$?

check_port 8080
FRONTEND_PORT_FREE=$?

# If ports are in use, clean up
if [ $BACKEND_PORT_FREE -ne 0 ] || [ $FRONTEND_PORT_FREE -ne 0 ]; then
    cleanup
fi

# Start servers
echo -e "\n${YELLOW}🚀 Starting development environment...${NC}"

# Start backend
if start_backend; then
    # Start frontend only if backend started successfully
    if start_frontend; then
        show_status
        
        echo -e "\n${GREEN}✅ Development environment is ready!${NC}"
        echo -e "\n${YELLOW}📝 Monitoring logs...${NC}"
        echo "Press Ctrl+C to stop all servers"
        
        # Set up trap to handle Ctrl+C
        trap "echo -e '\n${YELLOW}Shutting down...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; cleanup; exit" INT
        
        # Monitor both processes
        while true; do
            # Check if processes are still running
            if ! kill -0 $BACKEND_PID 2>/dev/null; then
                echo -e "\n${RED}❌ Backend crashed!${NC}"
                tail -n 20 backend.log
                break
            fi
            
            if ! kill -0 $FRONTEND_PID 2>/dev/null; then
                echo -e "\n${RED}❌ Frontend crashed!${NC}"
                tail -n 20 frontend.log
                break
            fi
            
            sleep 5
        done
        
        # Cleanup on exit
        cleanup
    else
        kill $BACKEND_PID 2>/dev/null
        cleanup
    fi
else
    cleanup
fi

echo -e "\n${RED}❌ Development environment stopped${NC}"