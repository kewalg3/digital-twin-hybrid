# LiveKit Integration Deployment Guide

This guide covers deploying the LiveKit integration to production environments.

## Production Environment Setup

### 1. LiveKit Cloud Production

1. **Create Production Project**:
   - Login to [LiveKit Cloud](https://cloud.livekit.io/)
   - Create a new project for production
   - Note the production WebSocket URL
   - Generate production API keys

2. **Configure Scaling**:
   - Set appropriate room limits
   - Configure auto-scaling for high traffic
   - Set up monitoring and alerts

### 2. Environment Variables

Create production environment files:

**Backend Production** (`/backend/.env.production`):
```bash
# LiveKit Production Configuration
LIVEKIT_URL=wss://your-prod-project.livekit.cloud
LIVEKIT_API_KEY=your-prod-api-key
LIVEKIT_API_SECRET=your-prod-api-secret

# Hume AI Production
HUME_API_KEY=your-prod-hume-api-key

# Database
DATABASE_URL=postgresql://user:password@prod-db:5432/digital_twin_prod

# API Configuration
BACKEND_API_URL=https://your-domain.com/api
JWT_SECRET=your-strong-production-secret

# Node Environment
NODE_ENV=production
```

**Frontend Production** (`/.env.production`):
```bash
VITE_LIVEKIT_URL=wss://your-prod-project.livekit.cloud
VITE_API_URL=https://your-domain.com/api
```

### 3. Security Configuration

#### JWT Security
```bash
# Generate a strong JWT secret
openssl rand -base64 64
```

#### API Key Management
- Use environment-specific API keys
- Rotate keys regularly
- Never commit production keys to repository
- Use secure secret management (e.g., AWS Secrets Manager)

#### Network Security
- Enable HTTPS for all connections
- Configure CORS properly
- Use secure WebSocket connections (WSS)
- Implement rate limiting

## Container Deployment

### Docker Configuration

**Backend Dockerfile** (`/backend/Dockerfile`):
```dockerfile
FROM node:18-alpine

# Install Python for agents
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy agent requirements
COPY agents/requirements.txt ./agents/
RUN pip3 install -r agents/requirements.txt

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3001

CMD ["node", "src/app.js"]
```

**Docker Compose** (`/docker-compose.prod.yml`):
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - HUME_API_KEY=${HUME_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
    restart: unless-stopped

  frontend:
    build: .
    environment:
      - VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
      - VITE_API_URL=${VITE_API_URL}
    ports:
      - "80:80"
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=digital_twin_prod
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

## Cloud Deployment

### Railway Deployment

**Railway Configuration** (`/railway.toml`):
```toml
[build]
command = "npm run build"

[deploy]
startCommand = "npm start"

[environments.production]
variables = [
  "NODE_ENV=production",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "HUME_API_KEY",
  "JWT_SECRET",
  "DATABASE_URL"
]
```

**Package.json Scripts**:
```json
{
  "scripts": {
    "build": "npm run build:frontend && npm run build:backend",
    "build:frontend": "vite build",
    "build:backend": "cd backend && npm install && npx prisma generate",
    "start": "cd backend && npm start",
    "deploy:prod": "railway up --environment production"
  }
}
```

### Vercel Frontend Deployment

**Vercel Configuration** (`/vercel.json`):
```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/backend/src/app.js"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "env": {
    "VITE_LIVEKIT_URL": "@livekit-url",
    "VITE_API_URL": "@api-url"
  }
}
```

### AWS Deployment

#### ECS Configuration

**Task Definition** (`/aws/task-definition.json`):
```json
{
  "family": "digital-twin-backend",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "your-registry/digital-twin-backend:latest",
      "memory": 1024,
      "cpu": 512,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3001,
          "hostPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "LIVEKIT_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:livekit/api-key"
        },
        {
          "name": "LIVEKIT_API_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:livekit/api-secret"
        }
      ]
    }
  ]
}
```

## Database Migration

### Production Database Setup

1. **Create Production Database**:
```bash
# Create database
createdb digital_twin_prod

# Run migrations
cd backend
npx prisma migrate deploy
```

2. **Backup Strategy**:
```bash
# Automated backups
pg_dump digital_twin_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql digital_twin_prod < backup_file.sql
```

## Monitoring and Observability

### Health Checks

**Backend Health Check**:
```javascript
// /backend/src/routes/health.js
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check LiveKit connectivity
    const roomService = new RoomServiceClient(
      process.env.LIVEKIT_URL,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET
    );

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        livekit: 'connected'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

### Logging Configuration

**Production Logging**:
```javascript
// /backend/src/config/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'digital-twin-backend' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### Metrics Collection

**Key Metrics to Monitor**:
- Interview session creation rate
- Agent dispatch success rate
- Room connection failures
- Audio quality metrics
- Response times

**Example Prometheus Metrics**:
```javascript
const prometheus = require('prom-client');

const interviewCounter = new prometheus.Counter({
  name: 'interviews_total',
  help: 'Total number of interviews created',
  labelNames: ['type', 'status']
});

const agentGauge = new prometheus.Gauge({
  name: 'active_agents',
  help: 'Number of active agents'
});

// Increment on interview creation
interviewCounter.inc({ type: 'profile', status: 'created' });

// Update agent count
agentGauge.set(activeAgents.length);
```

## Performance Optimization

### Caching Strategy

1. **Redis for Session Storage**:
```javascript
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

// Cache user session data
await client.setex(`session:${sessionId}`, 3600, JSON.stringify(sessionData));
```

2. **CDN for Static Assets**:
- Use CloudFlare or AWS CloudFront
- Cache audio/video assets
- Optimize for global delivery

### Load Balancing

**Nginx Configuration**:
```nginx
upstream backend {
    server backend1:3001;
    server backend2:3001;
    server backend3:3001;
}

server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Backup and Recovery

### Automated Backups

**Database Backup Script**:
```bash
#!/bin/bash
# /scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="digital_twin_backup_${DATE}.sql"

# Create backup
pg_dump $DATABASE_URL > $BACKUP_FILE

# Upload to S3
aws s3 cp $BACKUP_FILE s3://your-backup-bucket/database/

# Clean up local file
rm $BACKUP_FILE

# Keep only last 30 days of backups
aws s3 ls s3://your-backup-bucket/database/ | head -n -30 | awk '{print $4}' | xargs -I {} aws s3 rm s3://your-backup-bucket/database/{}
```

**Cron Job**:
```bash
# Run backup daily at 2 AM
0 2 * * * /scripts/backup-db.sh
```

## Security Hardening

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const createInterviewLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 interview creations per window
  message: 'Too many interview requests from this IP'
});

app.use('/api/livekit/create-interview-room', createInterviewLimit);
```

### Input Validation

```javascript
const { body, validationResult } = require('express-validator');

const validateInterviewRequest = [
  body('userId').isUUID().withMessage('Invalid user ID'),
  body('interviewType').isIn(['profile']).withMessage('Invalid interview type'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

app.post('/api/livekit/create-interview-room', validateInterviewRequest, handler);
```

## Troubleshooting Production Issues

### Common Production Problems

1. **High Memory Usage**: Agent processes not cleaned up
2. **Database Connections**: Connection pool exhaustion
3. **WebRTC Failures**: TURN server configuration
4. **API Rate Limits**: LiveKit Cloud limits exceeded

### Emergency Procedures

**Restart All Agents**:
```bash
# Kill all Python agent processes
pkill -f "python3.*agent.py"

# Clear agent registry
curl -X POST http://localhost:3001/api/livekit/agents/reset
```

**Database Connection Issues**:
```bash
# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Reset connection pool
curl -X POST http://localhost:3001/api/admin/reset-db-pool
```

## Monitoring Checklist

Regular monitoring should include:

- ✅ **Health Check Endpoints**: All services responding
- ✅ **Database Performance**: Query times, connection count
- ✅ **LiveKit Metrics**: Room creation success rate
- ✅ **Agent Status**: Active agent count, failure rate
- ✅ **Error Rates**: 4xx/5xx responses, exception counts
- ✅ **Resource Usage**: CPU, memory, disk usage
- ✅ **Network**: WebRTC connection quality
- ✅ **Security**: Authentication failures, rate limit hits

## Scaling Considerations

As your application grows:

1. **Horizontal Scaling**: Multiple backend instances
2. **Database Sharding**: Separate read replicas
3. **Agent Pool**: Pre-warmed agent processes
4. **CDN**: Global audio/video delivery
5. **Microservices**: Split functionality into services

## Related Documentation

- [Main Integration Guide](./LIVEKIT_INTEGRATION.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Architecture Overview](./ARCHITECTURE.md)