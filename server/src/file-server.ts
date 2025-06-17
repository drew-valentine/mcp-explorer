#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';

const DATA_DIR = resolve('./data/sample-files');

class FileSystemServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'filesystem-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const files = await readdir(DATA_DIR);
        const resources = await Promise.all(
          files.map(async (file) => {
            const filePath = join(DATA_DIR, file);
            const stats = await stat(filePath);
            
            return {
              uri: `file:///${file}`,
              name: file,
              description: `File: ${file} (${stats.size} bytes)`,
              mimeType: this.getMimeType(file),
            };
          })
        );

        return { resources };
      } catch (error) {
        throw new Error(`Failed to list resources: ${error}`);
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const filename = uri.replace('file:///', '');
      const filePath = join(DATA_DIR, filename);

      try {
        const content = await readFile(filePath, 'utf-8');
        return {
          contents: [
            {
              uri,
              mimeType: this.getMimeType(filename),
              text: content,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read file ${filename}: ${error}`);
      }
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_files',
            description: 'List all available files in the demo directory',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'read_file',
            description: 'Read the contents of a specific file',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Name of the file to read',
                },
              },
              required: ['filename'],
            },
          },
          {
            name: 'file_info',
            description: 'Get metadata information about a file',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Name of the file to get info about',
                },
              },
              required: ['filename'],
            },
          },
          {
            name: 'write_file',
            description: 'Write content to a file (creates or overwrites)',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Name of the file to write',
                },
                content: {
                  type: 'string',
                  description: 'Content to write to the file',
                },
              },
              required: ['filename', 'content'],
            },
          },
          {
            name: 'create_file',
            description: 'Create a new file with content',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Name of the new file',
                },
                content: {
                  type: 'string',
                  description: 'Initial content for the file',
                },
              },
              required: ['filename', 'content'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'list_files': {
          try {
            const files = await readdir(DATA_DIR);
            const fileList = await Promise.all(
              files.map(async (file) => {
                const stats = await stat(join(DATA_DIR, file));
                return {
                  name: file,
                  size: stats.size,
                  type: stats.isDirectory() ? 'directory' : 'file',
                  modified: stats.mtime.toISOString(),
                };
              })
            );

            return {
              content: [
                {
                  type: 'text',
                  text: `Files in demo directory:\n${JSON.stringify(fileList, null, 2)}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error listing files: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }

        case 'read_file': {
          try {
            const filename = args?.filename as string;
            if (!filename) {
              throw new Error('Filename is required');
            }

            const filePath = join(DATA_DIR, filename);
            const content = await readFile(filePath, 'utf-8');

            return {
              content: [
                {
                  type: 'text',
                  text: `Contents of ${filename}:\n\n${content}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error reading file: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }

        case 'file_info': {
          try {
            const filename = args?.filename as string;
            if (!filename) {
              throw new Error('Filename is required');
            }

            const filePath = join(DATA_DIR, filename);
            const stats = await stat(filePath);

            const info = {
              name: filename,
              size: stats.size,
              type: stats.isDirectory() ? 'directory' : 'file',
              created: stats.birthtime.toISOString(),
              modified: stats.mtime.toISOString(),
              accessed: stats.atime.toISOString(),
            };

            return {
              content: [
                {
                  type: 'text',
                  text: `File info for ${filename}:\n${JSON.stringify(info, null, 2)}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error getting file info: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }

        case 'write_file': {
          try {
            const filename = args?.filename as string;
            const content = args?.content as string;
            
            if (!filename) {
              throw new Error('Filename is required');
            }
            if (content === undefined) {
              throw new Error('Content is required');
            }

            const filePath = join(DATA_DIR, filename);
            
            // Ensure directory exists
            await mkdir(dirname(filePath), { recursive: true });
            
            await writeFile(filePath, content, 'utf-8');

            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Successfully wrote ${content.length} characters to ${filename}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error writing file: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }

        case 'create_file': {
          try {
            const filename = args?.filename as string;
            const content = args?.content as string;
            
            if (!filename) {
              throw new Error('Filename is required');
            }
            if (content === undefined) {
              throw new Error('Content is required');
            }

            const filePath = join(DATA_DIR, filename);
            
            // Check if file already exists
            try {
              await stat(filePath);
              throw new Error(`File ${filename} already exists. Use write_file to overwrite.`);
            } catch (statError: any) {
              if (statError.code !== 'ENOENT') {
                throw statError;
              }
              // File doesn't exist, proceed with creation
            }
            
            // Ensure directory exists
            await mkdir(dirname(filePath), { recursive: true });
            
            await writeFile(filePath, content, 'utf-8');

            return {
              content: [
                {
                  type: 'text',
                  text: `✅ Successfully created ${filename} with ${content.length} characters`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error creating file: ${error}`,
                },
              ],
              isError: true,
            };
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'txt':
        return 'text/plain';
      case 'json':
        return 'application/json';
      case 'md':
        return 'text/markdown';
      case 'csv':
        return 'text/csv';
      default:
        return 'text/plain';
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('File System MCP Server running on stdio');
  }
}

const server = new FileSystemServer();
server.run().catch(console.error);