#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import { join, resolve, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create data directory relative to project root
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'notes.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

class NotesServer {
  private server: Server;
  private db!: sqlite3.Database;

  constructor() {
    this.server = new Server(
      {
        name: 'notes-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.initDatabase();
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private initDatabase() {
    console.error(`Initializing database at: ${DB_PATH}`);
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        console.error('Data directory:', DATA_DIR);
        console.error('Database path:', DB_PATH);
      } else {
        console.error('Connected to SQLite database for notes');
      }
    });

    // Create notes table if it doesn't exist
    this.db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample notes if table is empty
    this.db.get('SELECT COUNT(*) as count FROM notes', (err, row: any) => {
      if (!err && row.count === 0) {
        const sampleNotes = [
          {
            title: 'Welcome to MCP Notes',
            content: 'This is a sample note demonstrating the MCP notes server. You can create, read, update, and delete notes through the MCP protocol.',
            tags: '["demo", "welcome"]'
          },
          {
            title: 'MCP Architecture Notes',
            content: 'Key concepts:\n- Servers expose tools and resources\n- Clients connect via JSON-RPC 2.0\n- Protocol enables AI-data integration',
            tags: '["mcp", "architecture", "learning"]'
          },
          {
            title: 'Development TODO',
            content: 'Features to implement:\n- [ ] Search functionality\n- [ ] Note categories\n- [ ] Export to markdown\n- [ ] Rich text formatting',
            tags: '["todo", "development"]'
          }
        ];

        sampleNotes.forEach(note => {
          this.db.run(
            'INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)',
            [note.title, note.content, note.tags]
          );
        });
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return new Promise((resolve, reject) => {
        this.db.all('SELECT id, title, created_at FROM notes ORDER BY updated_at DESC', (err, rows: any[]) => {
          if (err) {
            reject(new Error(`Failed to list notes: ${err.message}`));
            return;
          }

          const resources = rows.map(row => ({
            uri: `note://${row.id}`,
            name: row.title,
            description: `Note: ${row.title} (created ${new Date(row.created_at).toLocaleDateString()})`,
            mimeType: 'text/markdown',
          }));

          resolve({ resources });
        });
      });
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const noteId = uri.replace('note://', '');

      return new Promise((resolve, reject) => {
        this.db.get('SELECT * FROM notes WHERE id = ?', [noteId], (err, row: any) => {
          if (err) {
            reject(new Error(`Failed to read note ${noteId}: ${err.message}`));
            return;
          }

          if (!row) {
            reject(new Error(`Note ${noteId} not found`));
            return;
          }

          const tags = JSON.parse(row.tags || '[]');
          const content = `# ${row.title}\n\n${row.content}\n\n**Tags:** ${tags.join(', ')}\n**Created:** ${row.created_at}\n**Updated:** ${row.updated_at}`;

          resolve({
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: content,
              },
            ],
          });
        });
      });
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_note',
            description: 'Create a new note',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Note title' },
                content: { type: 'string', description: 'Note content' },
                tags: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Optional tags for the note' 
                },
              },
              required: ['title', 'content'],
            },
          },
          {
            name: 'list_notes',
            description: 'List all notes with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                tag: { type: 'string', description: 'Filter by tag' },
                limit: { type: 'number', description: 'Maximum number of notes to return' },
              },
              required: [],
            },
          },
          {
            name: 'get_note',
            description: 'Get a specific note by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Note ID' },
              },
              required: ['id'],
            },
          },
          {
            name: 'update_note',
            description: 'Update an existing note',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Note ID' },
                title: { type: 'string', description: 'New title' },
                content: { type: 'string', description: 'New content' },
                tags: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'New tags' 
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_note',
            description: 'Delete a note by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Note ID to delete' },
              },
              required: ['id'],
            },
          },
          {
            name: 'search_notes',
            description: 'Search notes by title and content',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error('Arguments are required');
      }

      try {
        switch (name) {
          case 'create_note':
            return await this.createNote(args) as any;
          case 'list_notes':
            return await this.listNotes(args) as any;
          case 'get_note':
            return await this.getNote(args) as any;
          case 'update_note':
            return await this.updateNote(args) as any;
          case 'delete_note':
            return await this.deleteNote(args) as any;
          case 'search_notes':
            return await this.searchNotes(args) as any;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async createNote(args: any) {
    const title = args.title as string;
    const content = args.content as string;
    const tags = args.tags ? JSON.stringify(args.tags) : '[]';

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)',
        [title, content, tags],
        function(err) {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            content: [
              {
                type: 'text',
                text: `Note created successfully with ID: ${this.lastID}\nTitle: ${title}`,
              },
            ],
          });
        }
      );
    });
  }

  private async listNotes(args: any) {
    const tag = args.tag as string;
    const limit = args.limit as number || 50;

    return new Promise((resolve, reject) => {
      let query = 'SELECT id, title, tags, created_at, updated_at FROM notes';
      let params: any[] = [];

      if (tag) {
        query += ' WHERE tags LIKE ?';
        params.push(`%"${tag}"%`);
      }

      query += ' ORDER BY updated_at DESC LIMIT ?';
      params.push(limit);

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const notesList = rows.map(row => {
          const tags = JSON.parse(row.tags || '[]');
          return {
            id: row.id,
            title: row.title,
            tags: tags,
            created: row.created_at,
            updated: row.updated_at,
          };
        });

        resolve({
          content: [
            {
              type: 'text',
              text: `Found ${notesList.length} notes:\n\n${JSON.stringify(notesList, null, 2)}`,
            },
          ],
        });
      });
    });
  }

  private async getNote(args: any) {
    const id = args.id as number;

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error(`Note with ID ${id} not found`));
          return;
        }

        const tags = JSON.parse(row.tags || '[]');
        const note = {
          id: row.id,
          title: row.title,
          content: row.content,
          tags: tags,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };

        resolve({
          content: [
            {
              type: 'text',
              text: `# ${note.title}\n\n${note.content}\n\n**Tags:** ${note.tags.join(', ')}\n**Created:** ${note.created_at}\n**Updated:** ${note.updated_at}`,
            },
          ],
        });
      });
    });
  }

  private async updateNote(args: any) {
    const id = args.id as number;
    const title = args.title as string;
    const content = args.content as string;
    const tags = args.tags ? JSON.stringify(args.tags) : undefined;

    return new Promise((resolve, reject) => {
      let updates: string[] = [];
      let params: any[] = [];

      if (title) {
        updates.push('title = ?');
        params.push(title);
      }
      if (content) {
        updates.push('content = ?');
        params.push(content);
      }
      if (tags) {
        updates.push('tags = ?');
        params.push(tags);
      }

      if (updates.length === 0) {
        reject(new Error('No fields to update'));
        return;
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error(`Note with ID ${id} not found`));
          return;
        }

        resolve({
          content: [
            {
              type: 'text',
              text: `Note ${id} updated successfully`,
            },
          ],
        });
      });
    });
  }

  private async deleteNote(args: any) {
    const id = args.id as number;

    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error(`Note with ID ${id} not found`));
          return;
        }

        resolve({
          content: [
            {
              type: 'text',
              text: `Note ${id} deleted successfully`,
            },
          ],
        });
      });
    });
  }

  private async searchNotes(args: any) {
    const query = args.query as string;

    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, title, content, tags FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC',
        [`%${query}%`, `%${query}%`],
        (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          const results = rows.map(row => ({
            id: row.id,
            title: row.title,
            content: row.content.substring(0, 200) + (row.content.length > 200 ? '...' : ''),
            tags: JSON.parse(row.tags || '[]'),
          }));

          resolve({
            content: [
              {
                type: 'text',
                text: `Search results for "${query}":\n\n${JSON.stringify(results, null, 2)}`,
              },
            ],
          });
        }
      );
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Notes MCP Server running on stdio');
  }
}

const server = new NotesServer();
server.run().catch(console.error);