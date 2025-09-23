// User session management utilities

const SESSION_KEY = 'digital_twin_session';

export interface UserSession {
  userId: string;
  sessionToken: string;
  isAnonymous: boolean;
  createdAt: number;
}

/**
 * Get or create user session
 */
export async function getOrCreateUserSession(): Promise<UserSession> {
  // Check for existing session
  const existingSession = localStorage.getItem(SESSION_KEY);
  
  if (existingSession) {
    try {
      const session = JSON.parse(existingSession) as UserSession;
      
      // Validate session is still valid (within 24 hours)
      const hoursSinceCreation = (Date.now() - session.createdAt) / (1000 * 60 * 60);
      if (hoursSinceCreation < 24) {
        // Validate with backend
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/users/validate-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: session.sessionToken })
        });
        
        if (response.ok) {
          return session;
        }
      }
    } catch (error) {
      console.warn('Invalid session, creating new one');
    }
  }
  
  // Create new anonymous user
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/users/create-anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error('Failed to create anonymous user');
    }
    
    const data = await response.json();
    
    const newSession: UserSession = {
      userId: data.userId,
      sessionToken: data.sessionToken,
      isAnonymous: true,
      createdAt: Date.now()
    };
    
    // Save to localStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    
    console.log('✅ Created new user session:', newSession.userId);
    return newSession;
    
  } catch (error) {
    console.error('❌ Error creating user session:', error);
    // Fallback to a temporary ID
    return {
      userId: `temp_${Date.now()}`,
      sessionToken: '',
      isAnonymous: true,
      createdAt: Date.now()
    };
  }
}

/**
 * Clear user session
 */
export function clearUserSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Update session after user signs up
 */
export function updateUserSession(userId: string, email: string): void {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    const parsed = JSON.parse(session) as UserSession;
    parsed.userId = userId;
    parsed.isAnonymous = false;
    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
  }
}