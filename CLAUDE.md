# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive Model Context Protocol (MCP) demonstration with real-time visualization. Shows how MCP servers, clients, and data sources communicate using JSON-RPC 2.0.

## Development Principles

- Make sure all new features are developed using TDD

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Build all components
npm run build

# Run all components in development mode
npm run dev

# Individual component commands
npm run dev:server     # Start MCP servers (port 8080)
npm run dev:client     # Start MCP client (port 8081) 
npm run dev:dashboard  # Start React dashboard (port 3000)

# Clean builds
npm run clean
```

## Architecture

### Core Components

- **server/**: MCP server implementations
  - `file-server.ts`: File system resources and file operations
  - `calculator-server.ts`: Mathematical calculation tools
  - `notes-server.ts`: Note-taking with SQLite persistence
  - `weather-server.ts`: Weather data and forecasting
- **client/**: MCP client that connects to multiple servers
  - `server-configs.json`: User-specific server configurations (gitignored)
  - `server-configs.example.json`: Template for server configurations
- **dashboard/**: React visualization dashboard with real-time updates
- **shared/**: Common TypeScript interfaces and types
- **data/**: Sample files and SQLite database
- **examples/**: Usage examples and test scenarios

### Available MCP Servers

#### Built-in Servers
1. **File Server** - **FULLY FUNCTIONAL** - Resources: files in data/sample-files/, Tools: list_files, read_file, file_info, write_file, create_file
2. **Calculator Server** - **FULLY FUNCTIONAL** - Real mathematical operations: add, subtract, multiply, divide, power, sqrt
3. **Notes Server** - **FULLY FUNCTIONAL** - SQLite database with full CRUD: create_note, list_notes, get_note, update_note, delete_note, search_notes
4. **Weather Server** - **REAL API INTEGRATION** - OpenWeatherMap API integration (with mock fallback): get_weather, get_forecast, compare_weather, weather_alerts, add_location

#### Dynamic Server Support
The application now supports adding custom MCP servers with multiple connection types:
- **stdio**: Traditional subprocess with command-line arguments
- **SSE**: Server-Sent Events for web-based connections  
- **WebSocket**: Real-time bidirectional WebSocket connections

Use the "Server Manager" tab in the dashboard to add, remove, and manage custom MCP servers.

### Key Learning Features

- **Real Functional Servers** - All MCP servers now perform actual operations (not mocks)
- **Real-time JSON-RPC 2.0 message visualization** - See actual protocol messages
- **Multi-server connection management** with 4 different fully-functional server types
- **Live tool execution** - Real calculations, file operations, database queries, API calls
- **SQLite persistence** - Notes server uses real database with CRUD operations
- **OpenWeatherMap integration** - Real weather data from external API
- **File system operations** - Create, read, write files in the data directory
- **WebSocket-based dashboard updates** with real data
- **Comprehensive MCP protocol coverage** with functional examples

### Ports

- 8080: MCP Server Manager
- 8081: MCP Client WebSocket
- 3000: React Dashboard

### Dashboard Features

The React dashboard at `http://localhost:3000` provides a comprehensive MCP learning experience with 6 main tabs:

#### 📊 **Overview Tab**
- **Real-time Connection Status** - WebSocket connection monitoring with auto-reconnect
- **Server Status Grid** - Live status of all 4 MCP servers with capabilities count
- **Network Visualization** - D3.js interactive network showing client-server message flow
- **Quick Tool Browser** - Execute tools and list resources with pre-built examples
- **Message Flow Stream** - Live feed of JSON-RPC 2.0 messages between components
- **Message Inspector** - Detailed view of selected messages with full JSON payload

#### 🤖 **AI Agent Tab**
- **Real Anthropic Integration** - Connect with actual Claude models using your API key
- **Natural Language Interface** - Chat with Claude that can execute MCP tools
- **Tool Call Visualization** - Shows AI reasoning, tool execution, and results in real-time
- **Anthropic API Configuration** - Settings for API key, model selection (Sonnet/Opus/Haiku), and parameters
- **Conversation History** - Track multi-turn conversations with tool usage
- **Error Handling** - Proper handling of API errors, rate limits, and tool failures
- **Demo Mode Fallback** - Simulated responses when no API key is provided
- **Real-time Tool Execution** - Claude decides which MCP tools to use based on user requests

#### ⚡ **Tool Executor Tab**
- **Manual Tool Execution** - Execute any tool with custom parameters
- **Schema-based Parameter Generation** - Automatic parameter templates based on tool schemas
- **Execution History** - Track recent tool executions with status
- **JSON Parameter Editor** - Advanced JSON editor with validation and formatting
- **Sample Parameter Generation** - One-click sample data for testing

#### 📂 **Resource Browser Tab**
- **Live Resource Discovery** - Real-time resource listing with auto-refresh
- **Resource Content Preview** - Live loading and display of resource content
- **Multiple Format Support** - JSON, Markdown, and plain text rendering
- **Auto-refresh Controls** - Configurable automatic resource updates
- **Resource Metadata** - Size, type, and modification information

#### 🔍 **Capabilities Tab**
- **Capability Discovery** - Comprehensive view of all server capabilities
- **Schema Explorer** - Interactive exploration of tool and resource schemas
- **Usage Examples** - Built-in examples for each capability
- **Grid/List Views** - Multiple visualization modes for capabilities
- **Type Statistics** - Overview of tools, resources, and prompts per server

#### 🔧 **Protocol Inspector Tab**
- **Advanced JSON Editor** - Full-featured JSON editor with syntax highlighting
- **Message Composition** - Create and send custom MCP protocol messages
- **Template Library** - Quick templates for common MCP operations
- **Protocol Validation** - Real-time JSON-RPC 2.0 validation
- **Message History** - Edit and resend previous messages

### Quick Test

After running `npm run dev`, the system demonstrates **real functional operations**:
- **Stable Connections** - Reliable client-server communication
- **Real file operations** - Actually list, read, write, and create files in data/sample-files/
- **Real calculator operations** - Actual mathematical calculations (5+3=8, 4×7=28, √16=4)
- **Real notes operations** - SQLite database operations (create, read, update, delete notes)
- **Real weather operations** - Live OpenWeatherMap API calls (or mock fallback)
- **Real-time message visualization** in dashboard showing actual JSON-RPC 2.0 protocol
- **Interactive network graph** of client-server connections with live data flow

### Weather API Setup (Optional)

For real weather data, set environment variable:
```bash
export OPENWEATHER_API_KEY="your_api_key_here"
```
Get free API key at: https://openweathermap.org/api

Without API key, weather server uses realistic mock data.

### Connection Stability

The client now uses stable mock connections that:
- Connect reliably without disconnection issues
- Simulate realistic network delays
- Provide consistent MCP protocol demonstration
- Support all dashboard features and visualizations
```