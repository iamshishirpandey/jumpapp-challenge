# JumpApp - AI-Powered CRM Assistant

An intelligent CRM assistant that connects Gmail, Google Calendar, and HubSpot to provide conversational interactions and automated workflows using RAG (Retrieval-Augmented Generation) and LLM capabilities.

## 📋 Table of Contents
- [Features](#features)
- [Screenshots](#screenshots)
- [Requirements Fulfilled](#requirements-fulfilled)
- [Architecture](#architecture)
- [System Flow](#system-flow)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Deployment](#deployment)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)

## ✨ Features

### Core Functionality
- **Google OAuth Integration**: Seamless login with email and calendar permissions
- **HubSpot CRM Connection**: Full integration with HubSpot contacts and notes
- **ChatGPT-like Interface**: Natural language interaction for queries and commands
- **RAG-Powered Context**: Intelligent retrieval from emails, calendar, and CRM data
- **Automated Workflows**: Tool calling for complex multi-step tasks
- **Proactive Intelligence**: Event-driven automation with webhook processing
- **Memory System**: Persistent storage of instructions and task continuity

### Advanced Capabilities
- **Vector Search**: pgvector-powered semantic search across all data sources
- **Task Persistence**: Database-stored tasks with completion tracking
- **Ongoing Instructions**: Persistent rules that execute across sessions
- **Multi-step Workflows**: Handle complex scenarios with waiting periods
- **Edge Case Handling**: LLM-powered flexible response to unexpected situations

## 📸 Screenshots

### Login & Authentication
<img src="screenshots/login.png" alt="Google OAuth Login" width="600"/>

*Google OAuth login with email and calendar permissions*

### Main Interface
<img src="screenshots/homescreen.png" alt="Main Chat Interface" width="600"/>

*ChatGPT-like interface for natural language interactions*

<img src="screenshots/mobileview_chat.png" alt="Mobile Chat View" width="300"/>

*Mobile-responsive chat interface*

### Integrations Setup
<img src="screenshots/hubspot_connected.png" alt="HubSpot Integration" width="600"/>

*HubSpot CRM successfully connected*

<img src="screenshots/gmail_sync.png" alt="Gmail Synchronization" width="600"/>

*Gmail email synchronization and RAG processing*

<img src="screenshots/webhooks_config.png" alt="Webhook Configuration" width="600"/>

*Webhook endpoints configured for real-time automation*

### AI Processing & Responses
<img src="screenshots/thinking.png" alt="AI Processing" width="600"/>

*AI agent processing user requests with RAG context*

<img src="screenshots/sample_request1.png" alt="Sample Query Response" width="600"/>

*Example of contextual query: "Who mentioned baseball?"*

<img src="screenshots/prompt2.png" alt="Complex Request Handling" width="600"/>

*Complex multi-step task processing*

### Use Cases & Automation
<img src="screenshots/calendar_usecase.png" alt="Calendar Integration" width="600"/>

*Calendar integration for appointment scheduling*

<img src="screenshots/appointment_reminder.png" alt="Appointment Automation" width="600"/>

*Automated appointment reminders and follow-ups*

<img src="screenshots/hubspot_integration.png" alt="HubSpot Automation" width="600"/>

*HubSpot contact management and automated workflows*

## ✅ Requirements Fulfilled

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Google OAuth Login | NextAuth.js with Google provider, email/calendar permissions | ✅ |
| OAuth Test User Support | `webshookeng@gmail.com` configured as test user | ✅ |
| HubSpot CRM Integration | OAuth-based connection with contacts/notes sync | ✅ |
| ChatGPT-like Interface | Next.js chat UI with streaming responses | ✅ |
| RAG for Context | pgvector embeddings for emails/contacts/notes | ✅ |
| Contextual Q&A | "Who mentioned baseball?" type queries | ✅ |
| Tool Calling Actions | "Schedule appointment" automated workflows | ✅ |
| Task Persistence | Database storage with memory continuity | ✅ |
| Ongoing Instructions | "Auto-create contacts" type rules | ✅ |
| Proactive Automation | Webhook-triggered intelligent responses | ✅ |
| Multi-step Workflows | Email → Response → Calendar → Notification chains | ✅ |
| Edge Case Flexibility | LLM-powered adaptive handling | ✅ |

## 🏗️ Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[Next.js Chat Interface]
        Auth[NextAuth.js]
    end
    
    subgraph "API Layer"
        API[Next.js API Routes]
        Tools[Tool Functions]
        Webhooks[Webhook Handlers]
    end
    
    subgraph "Intelligence Layer"
        LLM[Gemini 1.5 Pro / GPT-4]
        RAG[RAG System]
        Memory[Memory System]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL + Prisma)]
        Vector[(pgvector)]
        Embeddings[Vector Embeddings]
    end
    
    subgraph "External Services"
        Gmail[Gmail API]
        Calendar[Google Calendar]
        HubSpot[HubSpot CRM]
    end
    
    UI --> Auth
    UI --> API
    API --> Tools
    API --> LLM
    LLM --> RAG
    RAG --> Vector
    LLM --> Tools
    Tools --> Gmail
    Tools --> Calendar
    Tools --> HubSpot
    Memory --> DB
    Vector --> DB
    Embeddings --> Vector
    Webhooks --> API
    Gmail -.-> Webhooks
    Calendar -.-> Webhooks
    HubSpot -.-> Webhooks
```

## 🔄 System Flow

### 1. Data Ingestion & Vector Storage
```mermaid
sequenceDiagram
    participant User
    participant App
    participant Gmail
    participant HubSpot
    participant DB
    participant Vector
    
    User->>App: Connect Accounts
    App->>Gmail: Sync Emails
    App->>HubSpot: Sync Contacts/Notes
    App->>Vector: Generate Embeddings
    Vector->>DB: Store Vector Data
```

### 2. Query Processing with RAG
```mermaid
sequenceDiagram
    participant User
    participant UI
    participant LLM
    participant RAG
    participant Vector
    participant DB
    
    User->>UI: "Who mentioned baseball?"
    UI->>LLM: Process Query
    LLM->>RAG: Request Context
    RAG->>Vector: Semantic Search
    Vector->>DB: Query Embeddings
    DB->>Vector: Return Matches
    Vector->>RAG: Relevant Context
    RAG->>LLM: Contextualized Data
    LLM->>UI: Generated Response
    UI->>User: Display Answer
```

### 3. Tool Calling & Task Execution
```mermaid
sequenceDiagram
    participant User
    participant LLM
    participant Tools
    participant DB
    participant External
    
    User->>LLM: "Schedule meeting with Sara"
    LLM->>Tools: Execute Schedule Tool
    Tools->>DB: Store Task
    Tools->>External: Send Email/Check Calendar
    External-->>Tools: Response/Webhook
    Tools->>DB: Update Task Status
    Tools->>LLM: Report Completion
    LLM->>User: Confirm Success
```

## 🛠️ Technology Stack

| Layer | Purpose | Technology |
|-------|---------|------------|
| **Authentication** | Google OAuth + HubSpot OAuth | NextAuth.js |
| **Database** | Store users, tasks, memory, vector embeddings | PostgreSQL + Prisma |
| **Vector Store** | Context retrieval | pgvector |
| **LLM** | Brain (context reasoning + tool use) | Gemini 1.5 Pro or OpenAI GPT-4/5 |
| **Tools** | Action layer (email, calendar, HubSpot APIs) | Node.js routes |
| **Memory** | Persist rules, instructions, summaries | Prisma models |
| **Webhooks** | Event-driven automation | Gmail, HubSpot, Google Calendar |
| **UI** | Chat interface | Next.js 13 (page router) |

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ with pgvector extension
- Google Cloud Console account
- HubSpot Developer account
- OpenAI API key or Google Cloud AI credentials

## 🚀 Installation & Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-username/jumpapp.git
cd jumpapp
npm install
```

### 2. Database Setup
```bash
# Install PostgreSQL and pgvector extension
brew install postgresql pgvector  # macOS
# or
sudo apt-get install postgresql postgresql-contrib  # Ubuntu

# Create database
createdb jumpapp
psql jumpapp -c "CREATE EXTENSION vector;"
```

### 3. Environment Configuration
```bash
cp .env.example .env.local
```

Fill in the required environment variables (see Configuration section).

### 4. Database Migration
```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Initial Data Setup
```bash
npm run seed  # Optional: seed with sample data
```

## ⚙️ Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/jumpapp"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# Google OAuth & APIs
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REFRESH_TOKEN="your-refresh-token"

# HubSpot
HUBSPOT_CLIENT_ID="your-hubspot-client-id"
HUBSPOT_CLIENT_SECRET="your-hubspot-client-secret"

# OpenAI (or Google AI)
OPENAI_API_KEY="your-openai-api-key"
# OR
GOOGLE_AI_API_KEY="your-google-ai-key"

# Webhook Endpoints
GMAIL_WEBHOOK_SECRET="your-webhook-secret"
HUBSPOT_WEBHOOK_SECRET="your-webhook-secret"
CALENDAR_WEBHOOK_SECRET="your-webhook-secret"
```

### Google Cloud Setup

1. **Create OAuth 2.0 Credentials**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Enable Gmail API, Calendar API
   - Create OAuth 2.0 client ID
   - Add `webshookeng@gmail.com` as test user
   - Add authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

2. **Configure Scopes**:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/calendar.events
   ```

### HubSpot Setup

1. **Create Private App**:
   - Go to HubSpot Developer Portal
   - Create new private app
   - Configure required scopes: `contacts`, `timeline`
   - Note the access token

2. **OAuth Configuration**:
   - Set redirect URI: `http://localhost:3000/api/auth/callback/hubspot`
   - Configure webhook endpoints for contact updates

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm start
```

### Background Services
```bash
# Vector embedding processing
npm run embeddings:process

# Webhook listener (if not using serverless)
npm run webhooks:listen
```

## 🚀 Deployment

### Vercel Deployment
```bash
npm install -g vercel
vercel --prod
```

### Docker Deployment
```bash
# Build image
docker build -t jumpapp .

# Run with environment
docker run -p 3000:3000 --env-file .env.local jumpapp
```

### Environment-Specific Configuration

**Production Environment Variables**:
- Update `NEXTAUTH_URL` to your production domain
- Use production database URL
- Configure production webhook endpoints
- Set up SSL certificates for webhook security

**Database Deployment**:
- Use managed PostgreSQL (AWS RDS, Google Cloud SQL, or Supabase)
- Ensure pgvector extension is installed
- Set up connection pooling for production load

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

### Test Scenarios

#### OAuth Integration Tests
- ✅ Google OAuth login flow
- ✅ HubSpot connection establishment
- ✅ Token refresh handling
- ✅ Permission scope validation

#### RAG System Tests
- ✅ Email ingestion and embedding
- ✅ HubSpot data synchronization
- ✅ Vector similarity search accuracy
- ✅ Context retrieval relevance

#### Tool Calling Tests
- ✅ Email sending functionality
- ✅ Calendar event creation
- ✅ HubSpot contact management
- ✅ Multi-step task execution

#### Chat Interface Tests
- ✅ Message streaming
- ✅ Context-aware responses
- ✅ Tool calling integration
- ✅ Error handling

#### Webhook Processing Tests
- ✅ Gmail webhook validation
- ✅ Calendar event processing
- ✅ HubSpot contact updates
- ✅ Proactive action triggers

### Sample Test Cases

**Example Query Tests**:
```javascript
describe('RAG Queries', () => {
  test('should find baseball mention', async () => {
    const response = await query("Who mentioned their kid plays baseball?");
    expect(response).toContain("John Smith");
  });
  
  test('should explain stock decision', async () => {
    const response = await query("Why did greg want to sell AAPL stock?");
    expect(response).toContain("market concerns");
  });
});
```

**Tool Calling Tests**:
```javascript
describe('Appointment Scheduling', () => {
  test('should schedule appointment with Sara Smith', async () => {
    const response = await executeCommand("Schedule an appointment with Sara Smith");
    expect(response.toolCalls).toContain("send_email");
    expect(response.toolCalls).toContain("check_calendar");
  });
});
```

## 📚 API Documentation

### Chat API
```
POST /api/chat
{
  "message": "Who mentioned baseball?",
  "sessionId": "unique-session-id"
}
```

### Tool Endpoints
```
POST /api/tools/email/send
POST /api/tools/calendar/create
POST /api/tools/hubspot/contact
```

### Webhook Endpoints
```
POST /api/webhooks/gmail
POST /api/webhooks/calendar
POST /api/webhooks/hubspot
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## 🆘 Support

For support, email iamshishirpandey@gmail.com or create an issue in the GitHub repository.

---

**Built with ❤️ using Next.js, PostgreSQL, pgvector, and modern AI technologies.**
