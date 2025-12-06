# Expert Prisma/PostgreSQL Debugging Request

## Your Role
You are a senior backend engineer specializing in Node.js, Prisma ORM, and PostgreSQL database systems. You have deep expertise in debugging database connection issues, prepared statement conflicts, and Prisma client configuration problems.

## Project Context

### Tech Stack
- **Backend Framework**: Node.js v18+ with Express.js 4.18.2
- **ORM**: Prisma Client 5.22.0
- **Database**: PostgreSQL (hosted on Supabase)
- **Environment**: macOS development, deployed to Railway for production
- **Authentication**: JWT with jsonwebtoken library
- **Process Management**: Running with NODE_ENV=production locally for testing

### Application Architecture
- Full-stack application: Digital Twin Voice Interview Platform
- Frontend: React 18 with TypeScript (running on localhost:8080)
- Backend API: Express server (running on localhost:3001)
- Database: Supabase PostgreSQL with connection pooling enabled

## The Critical Problem

### Error Messages
We are experiencing persistent Prisma prepared statement errors that prevent ALL database operations:

```
prisma:error
Invalid `prisma.user.findUnique()` invocation:

Error occurred during query execution:
ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError {
  code: "42P05",
  message: "prepared statement \"s0\" already exists",
  severity: "ERROR",
  detail: None,
  column: None,
  hint: None
}), transient: false })
```

Additional error variations:
- `"prepared statement \"s1\" already exists"`
- `"prepared statement \"s2\" already exists"`
- `"prepared statement \"s3\" does not exist"`
- `"bind message supplies 3 parameters, but prepared statement \"s2\" requires 2"`

### Error Pattern
1. Errors occur on EVERY database query attempt
2. Statement numbers increment with each query (s0, s1, s2...)
3. Errors persist even after:
   - Killing all Node.js processes
   - Regenerating Prisma client
   - Restarting the backend server
4. Login endpoint (/api/auth/login) returns 500 error
5. All protected routes fail with similar errors

## Current Prisma Configuration

### prisma.js (Singleton Pattern)
```javascript
const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  // In development, use a global variable to preserve the client across hot reloads
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.prisma;
}

// Handle cleanup on app shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
```

### Database Connection String Format
```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]?pgbouncer=true&connection_limit=1
```

## Solutions Already Attempted (All Failed)

1. **Regenerated Prisma Client**
   - Ran `npx prisma generate`
   - Confirmed successful generation
   - Error persists on first query after restart

2. **Killed All Processes**
   - Used `lsof -ti:3001 | xargs kill -9`
   - Verified no processes on port 3001
   - Started fresh backend process
   - Errors return immediately

3. **Singleton Pattern Implementation**
   - Already using singleton pattern in prisma.js
   - Global variable in development
   - Single instance in production
   - Still getting prepared statement conflicts

4. **Environment Variables**
   - Running with NODE_ENV=production locally
   - Using production database URL
   - Trust proxy enabled in Express

## Additional Observations

1. **Multiple Process Scenario**
   - Only ONE Node.js process is listening on port 3001 (verified with lsof)
   - No zombie processes detected
   - No PM2 or cluster mode in use

2. **Connection Pooling**
   - Supabase has pgbouncer enabled
   - Connection string includes `pgbouncer=true`
   - Connection limit set to 1

3. **Error Timing**
   - Errors start immediately on first database query
   - No successful queries before errors begin
   - Consistent across all Prisma operations (findUnique, findMany, create, update)

## What We Need From You

### Primary Questions
1. **Root Cause**: What is causing these prepared statement conflicts when we have a singleton Prisma client and only one Node.js process?
2. **pgBouncer Compatibility**: Is there a known issue with Prisma 5.22.0 and pgBouncer in transaction pooling mode?
3. **Connection String**: Should we modify our connection string parameters for Prisma + pgBouncer compatibility?

### Solution Requirements
1. Must work with Supabase PostgreSQL + pgBouncer
2. Must support both development and production environments
3. Must not require disabling pgBouncer (needed for production scalability)
4. Should provide clear explanation of why this is happening

### Specific Areas to Investigate
1. Prisma's prepared statement caching mechanism
2. pgBouncer's transaction pooling vs session pooling
3. Prisma connection pool settings vs pgBouncer settings
4. Whether we need to explicitly disable prepared statements
5. Prisma's `connection_limit` parameter and its interaction with pgBouncer

## Expected Solution Format

Please provide:
1. **Root cause explanation** - Why is this happening with our specific setup?
2. **Immediate fix** - What changes do we need to make RIGHT NOW to get the app working?
3. **Long-term solution** - Best practices for Prisma + pgBouncer + Supabase
4. **Code changes** - Specific modifications to our prisma.js or connection string
5. **Verification steps** - How to confirm the fix is working

## Additional Context Files Available
- Full prisma.schema file
- Complete package.json with all dependencies
- Express app.js configuration
- Auth controller implementation
- Middleware configuration

Please help us resolve this critical production-blocking issue. The application is completely non-functional due to these database errors.