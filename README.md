# PathSim Backend Service

This is the backend service for the PathSim (Enhanced Contact Center Testing
Platform) application that manages agent resources and interactions.

## Prerequisites

- Node.js (v18 or higher)
- MongoDB
- Retell API credentials

## Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd va-backend
```
 
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and replace the placeholder values with your actual configuration:
# - Replace MONGODB_URI with your MongoDB connection string
# - Replace RETELL_API_KEY with your Retell API key
# - Update PORT and other server configurations as needed
# - Make sure to replace all placeholder values (like 'your_api_key_here') with actual values
```

4. Start MongoDB locally or use a cloud instance.

## Running Locally

1. Start the development server:

```bash
npm run dev
```

2. For production build:

```bash
npm run build
npm start
```

## API Endpoints

The service provides the following main functionalities:

- Phone Number Management
- LLM Resource Management
- Agent Resource Management
- Resource Provisioning

## Development

### Project Structure

```
src/
├── controllers/             # Request handlers and business logic
├── di/                      # Dependency injection setup
├── middlewares/             # Express middlewares
├── pkg/                     # Shared packages and common code
├── routes/                  # API route definitions
├── services/                # Core business services
│   ├── agent_resources/     # Agent resource management
│   ├── agents/              # Agent management
│   ├── auth/                # Authentication service
│   ├── campaigns/           # Campaign management
│   ├── common/              # Common utilities and types
│   ├── retell/              # Retell API integration
│   ├── scheduler/           # Task scheduling service
│   ├── templates/           # Template management
│   ├── user/                # User management
│   └── worker/              # Background worker service
├── utils/                   # Utility functions and helpers
├── config.ts                # Application configuration
└── server.ts                # Application entry point
```
# revenue-pro-backend
