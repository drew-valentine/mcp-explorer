#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class CalculatorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'calculator-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'add',
            description: 'Add two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' },
              },
              required: ['a', 'b'],
            },
          },
          {
            name: 'subtract',
            description: 'Subtract two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' },
              },
              required: ['a', 'b'],
            },
          },
          {
            name: 'multiply',
            description: 'Multiply two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number', description: 'First number' },
                b: { type: 'number', description: 'Second number' },
              },
              required: ['a', 'b'],
            },
          },
          {
            name: 'divide',
            description: 'Divide two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number', description: 'Dividend' },
                b: { type: 'number', description: 'Divisor' },
              },
              required: ['a', 'b'],
            },
          },
          {
            name: 'power',
            description: 'Raise a number to a power',
            inputSchema: {
              type: 'object',
              properties: {
                base: { type: 'number', description: 'Base number' },
                exponent: { type: 'number', description: 'Exponent' },
              },
              required: ['base', 'exponent'],
            },
          },
          {
            name: 'sqrt',
            description: 'Calculate square root of a number',
            inputSchema: {
              type: 'object',
              properties: {
                number: { type: 'number', description: 'Number to find square root of' },
              },
              required: ['number'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error('Arguments are required');
        }

        switch (name) {
          case 'add': {
            const a = args.a as number;
            const b = args.b as number;
            const result = a + b;
            return {
              content: [
                {
                  type: 'text',
                  text: `${a} + ${b} = ${result}`,
                },
              ],
            };
          }

          case 'subtract': {
            const a = args.a as number;
            const b = args.b as number;
            const result = a - b;
            return {
              content: [
                {
                  type: 'text',
                  text: `${a} - ${b} = ${result}`,
                },
              ],
            };
          }

          case 'multiply': {
            const a = args.a as number;
            const b = args.b as number;
            const result = a * b;
            return {
              content: [
                {
                  type: 'text',
                  text: `${a} × ${b} = ${result}`,
                },
              ],
            };
          }

          case 'divide': {
            const a = args.a as number;
            const b = args.b as number;
            if (b === 0) {
              throw new Error('Division by zero is not allowed');
            }
            const result = a / b;
            return {
              content: [
                {
                  type: 'text',
                  text: `${a} ÷ ${b} = ${result}`,
                },
              ],
            };
          }

          case 'power': {
            const base = args.base as number;
            const exponent = args.exponent as number;
            const result = Math.pow(base, exponent);
            return {
              content: [
                {
                  type: 'text',
                  text: `${base}^${exponent} = ${result}`,
                },
              ],
            };
          }

          case 'sqrt': {
            const number = args.number as number;
            if (number < 0) {
              throw new Error('Cannot calculate square root of negative number');
            }
            const result = Math.sqrt(number);
            return {
              content: [
                {
                  type: 'text',
                  text: `√${number} = ${result}`,
                },
              ],
            };
          }

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Calculator MCP Server running on stdio');
  }
}

const server = new CalculatorServer();
server.run().catch(console.error);