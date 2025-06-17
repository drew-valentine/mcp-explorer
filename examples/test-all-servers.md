# Test All MCP Servers

This document describes how to test all MCP servers working together in the demo project.

## Available Servers

### 1. File Server
**Capabilities:**
- **Resources:** Exposes files in `data/sample-files/` as MCP resources
- **Tools:** `list_files`, `read_file`, `file_info`

**Test Commands:**
```bash
# List all available files
list_files

# Read a specific file
read_file --filename=readme.txt

# Get file metadata
file_info --filename=config.json
```

### 2. Calculator Server
**Capabilities:**
- **Tools:** `add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`

**Test Commands:**
```bash
# Basic math operations
add --a=5 --b=3
multiply --a=4 --b=7
divide --a=15 --b=3
power --base=2 --exponent=8
sqrt --number=16
```

### 3. Notes Server (SQLite)
**Capabilities:**
- **Resources:** Individual notes accessible as `note://ID`
- **Tools:** `create_note`, `list_notes`, `get_note`, `update_note`, `delete_note`, `search_notes`

**Test Commands:**
```bash
# List all notes
list_notes

# Create a new note
create_note --title="Test Note" --content="This is a test note" --tags=["test", "demo"]

# Get a specific note
get_note --id=1

# Search notes
search_notes --query="MCP"

# Update a note
update_note --id=1 --title="Updated Title"

# Delete a note
delete_note --id=4
```

### 4. Weather Server
**Capabilities:**
- **Resources:** Weather data for cached locations as `weather://location`
- **Tools:** `get_weather`, `get_forecast`, `compare_weather`, `weather_alerts`, `add_location`

**Test Commands:**
```bash
# Get current weather
get_weather --location="San Francisco, CA"

# Get weather forecast
get_forecast --location="New York, NY" --days=5

# Compare two locations
compare_weather --location1="San Francisco, CA" --location2="London, UK"

# Check weather alerts
weather_alerts --location="Tokyo, Japan"

# Add a new location
add_location --location="Seattle, WA" --temperature=12 --condition="Rainy" --humidity=85
```

## Integration Test Scenarios

### Scenario 1: Research and Documentation Workflow
1. Use **File Server** to read configuration and documentation files
2. Use **Notes Server** to create research notes based on file contents
3. Use **Calculator Server** to perform calculations mentioned in documents
4. Use **Weather Server** to get location-specific context

### Scenario 2: Data Analysis Pipeline
1. Use **File Server** to access data files
2. Use **Calculator Server** to perform statistical calculations
3. Use **Notes Server** to document findings and methodology
4. Use **Weather Server** to correlate with environmental data

### Scenario 3: Content Creation Workflow
1. Use **Weather Server** to get current conditions for location-based content
2. Use **Calculator Server** to verify numerical claims
3. Use **Notes Server** to draft and store content
4. Use **File Server** to access templates and reference materials

## Running the Demo

### Start All Servers
```bash
npm run dev
```

This starts:
- Server Manager on port 8080
- MCP Client on port 8081  
- Dashboard on port 3000

### Access the Dashboard
Open `http://localhost:3000` to see:
- Real-time server status
- MCP message flow visualization
- Interactive tool execution interface
- Resource browser

### Check Logs
The client will automatically run demo operations showing:
- Calculator: `5 + 3 = 8`, `4 × 7 = 28`
- File operations: List files, read readme.txt
- Notes: List existing notes, create new demo note
- Weather: Get SF weather, compare SF vs NYC

## Expected Message Flow

1. **Client connects** to each server
2. **Capability discovery** - Client calls `listTools()`, `listResources()` on each server
3. **Demo operations** execute automatically
4. **WebSocket messages** broadcast all MCP protocol traffic to dashboard
5. **Real-time visualization** shows JSON-RPC 2.0 messages flowing between components

## Troubleshooting

### Database Issues
- Ensure `data/` directory exists
- Check SQLite permissions
- Notes server will create database automatically

### Connection Issues  
- Verify all ports are available (8080, 8081, 3000)
- Check that servers start without errors
- Look for TypeScript compilation issues

### Missing Data
- Sample files should be in `data/sample-files/`
- Notes server creates sample notes automatically
- Weather server has built-in sample locations