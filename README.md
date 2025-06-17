# MCP Explorer

An interactive demonstration of the Model Context Protocol (MCP) with real-time visualization and comprehensive tooling.

## 🌟 Features

### 📊 **Interactive Dashboard**
- **Real-time WebSocket communication** between MCP client and servers
- **5 comprehensive tabs** for exploring different aspects of MCP
- **Live message flow visualization** with D3.js network graphs
- **Dynamic capability discovery** from actual MCP servers

### 🤖 **AI Agent Integration**
- **Anthropic Claude integration** with persistent API key storage
- **Dynamic tool discovery** and execution through MCP servers
- **Real-time tool calling** with parameter validation
- **Demo mode** when no API key is provided

### ⚡ **Tool Execution**
- **Manual tool execution** with schema-based parameter generation
- **JSON parameter editor** with syntax validation
- **Execution history** with success/error tracking
- **Sample parameter generation** for quick testing

### 📂 **Resource Management**
- **Live resource browsing** with auto-refresh capabilities
- **Real-time content preview** for various file types
- **Resource metadata display** (size, type, modification time)
- **Cross-server resource discovery**

### 🔍 **Capability Explorer**
- **Dynamic capability discovery** from connected MCP servers
- **Interactive schema exploration** with examples
- **Grid and list view modes** for different perspectives
- **Real-time statistics** on tools, resources, and prompts

### 🌐 **Network Visualization**
- **D3.js-powered network graph** showing client-server connections
- **Real-time message flow** with directional arrows and animations
- **Color-coded message types** (requests, responses, errors)
- **Interactive node dragging** and zoom capabilities

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** and npm
- **Git** for version control
- **Optional**: Anthropic API key for AI agent functionality

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/mcp-explorer.git
   cd mcp-explorer
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Start the development environment**
   ```bash
   npm run dev
   ```

This will start:
- **MCP Server Manager** on port 8080
- **MCP Client** on port 8081  
- **React Dashboard** on port 3000

### Access the Dashboard

Open [http://localhost:3000](http://localhost:3000) in your browser to access the interactive dashboard.

## 📁 Project Structure

```
mcp-explorer/
├── client/          # MCP client with WebSocket server
├── server/          # MCP server implementations
├── dashboard/       # React dashboard application
├── shared/          # Common TypeScript types
├── data/           # Sample data files and SQLite database
├── examples/       # Usage examples and documentation
└── docs/           # Additional documentation
```

## 🔧 Available Scripts

### Root Commands
```bash
npm run install:all   # Install dependencies for all packages
npm run build        # Build all components
npm run dev          # Start all components in development (demo disabled)
npm run dev:demo     # Start with automatic demo operations enabled
npm run clean        # Clean build artifacts
```

### Individual Components
```bash
npm run dev:server    # Start MCP servers (port 8080)
npm run dev:client    # Start MCP client (port 8081)
npm run dev:dashboard # Start React dashboard (port 3000)
```

## 🖥️ Dashboard Tabs

### 1. 📊 Overview
- **Connection status** and server health monitoring
- **Network visualization** with real-time message flow
- **Quick tool browser** with one-click execution
- **Message flow stream** and detailed message inspector

### 2. 🤖 AI Agent
- **Claude integration** with configurable models and parameters
- **Persistent API key storage** across sessions
- **Dynamic tool discovery** and automatic parameter generation
- **Demo mode** with simulated responses

### 3. ⚡ Tool Executor
- **Manual tool execution** with parameter customization
- **Schema-based parameter templates** for all available tools
- **Execution history** with detailed success/error tracking
- **Sample parameter generation** for quick testing

### 4. 📂 Resource Browser
- **Live resource discovery** with auto-refresh controls
- **Real-time content preview** with multiple format support
- **Resource metadata** including size, type, and timestamps
- **Cross-server resource exploration**

### 5. 🔍 Capabilities
- **Dynamic capability discovery** from all connected servers
- **Interactive schema exploration** with generated examples
- **Grid and list view modes** for different visualization needs
- **Real-time statistics** on available tools, resources, and prompts

### 6. 🔧 Protocol Inspector
- **Advanced JSON editor** for crafting custom MCP messages
- **Protocol message templates** for common operations
- **Real-time message validation** and error checking
- **Message history** with edit and resend capabilities

## 🔌 MCP Servers

The demo includes 4 fully functional MCP servers:

### 📁 File Server
- **Tools**: `list_files`, `read_file`, `file_info`, `write_file`, `create_file`
- **Resources**: Files in `data/sample-files/` directory
- **Use Cases**: File system operations and content management

### 🧮 Calculator Server
- **Tools**: `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`
- **Use Cases**: Mathematical calculations and demonstrations

### 📝 Notes Server
- **Tools**: `create_note`, `list_notes`, `get_note`, `update_note`, `delete_note`, `search_notes`
- **Resources**: Individual notes stored in SQLite database
- **Use Cases**: Note-taking, content management, and search functionality

### 🌤️ Weather Server
- **Tools**: `get_weather`, `get_forecast`, `compare_weather`, `weather_alerts`, `add_location`
- **Resources**: Weather data for cached locations
- **Use Cases**: Weather information and location-based services
- **Note**: Requires `OPENWEATHER_API_KEY` environment variable for real data

## ⚙️ Configuration

### Environment Variables
```bash
# Optional: For real weather data
OPENWEATHER_API_KEY=your_api_key_here
```

### AI Agent Configuration
- **API Key**: Set your Anthropic API key in the AI Agent tab settings
- **Model Selection**: Choose from Claude 3.5 Sonnet, Haiku, or Opus
- **Max Tokens**: Configure response length (default: 4096)
- **Persistence**: Settings automatically save to localStorage

## 🧪 Testing the Demo

### Quick Test Scenarios

1. **Tool Execution**
   ```bash
   # Calculator: 15 + 27 = 42
   # File Operations: List and read sample files
   # Notes: Create and search notes
   # Weather: Compare San Francisco vs New York
   ```

2. **Resource Browsing**
   - Browse sample files in data/sample-files/
   - View note resources from the SQLite database
   - Explore weather resources for cached locations

3. **AI Agent Testing**
   ```bash
   # Try these prompts:
   "What's the weather in San Francisco?"
   "Calculate 15 × 27"
   "List available files"
   "Create a note about MCP Explorer"
   ```

## 🔧 Development

### Adding New MCP Servers

1. Create a new server file in `server/src/`
2. Implement MCP protocol with tools and/or resources
3. Add server configuration to `server/src/index.ts`
4. Update client connection logic in `client/src/index.ts`

### Extending the Dashboard

- **Components**: Add new React components in `dashboard/src/components/`
- **Hooks**: Extend WebSocket functionality in `dashboard/src/hooks/`
- **Styling**: Uses Tailwind CSS for consistent styling

## 📚 Learning Resources

### MCP Protocol
- **Official Specification**: [Model Context Protocol](https://modelcontextprotocol.io)
- **JSON-RPC 2.0**: Understanding the underlying communication protocol
- **WebSocket Communication**: Real-time bidirectional messaging

### Key Concepts Demonstrated
- **Client-Server Architecture**: MCP client managing multiple server connections
- **Tool Calling**: Dynamic tool discovery and execution
- **Resource Management**: File-like resource access patterns
- **Protocol Inspection**: Real-time message flow visualization

## 🐛 Troubleshooting

### Common Issues

1. **Dashboard Reload/Blank Page on Startup**
   ```bash
   # This is caused by demo operations overwhelming the initial connection
   # Use the standard dev command (demo disabled by default)
   npm run dev
   
   # Or manually refresh the page after ~10 seconds
   # To enable demo operations:
   npm run dev:demo
   ```

2. **Port Conflicts**
   ```bash
   # Kill processes on required ports
   lsof -ti:8080,8081,3000 | xargs kill -9
   ```

3. **WebSocket Connection Issues**
   - Check that all three services are running
   - Verify no firewall blocking local connections
   - Check browser console for connection errors
   - Try refreshing the page if connection drops during startup

3. **Missing Dependencies**
   ```bash
   # Reinstall all dependencies
   npm run clean
   npm run install:all
   ```

4. **Build Errors**
   ```bash
   # Clean and rebuild
   npm run clean
   npm run build
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Anthropic** for the Model Context Protocol specification
- **D3.js** for powerful data visualization capabilities
- **React** and **TypeScript** for robust frontend development
- **WebSocket** technology for real-time communication

---

**Built with ❤️ to demonstrate the power and flexibility of the Model Context Protocol**