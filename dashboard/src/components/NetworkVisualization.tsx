import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { MCPMessage, ServerStatus } from '../hooks/useWebSocket';

interface Props {
  servers: ServerStatus[];
  messages: MCPMessage[];
  className?: string;
}

interface Node {
  id: string;
  type: 'client' | 'server';
  name: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link {
  source: string;
  target: string;
  type: 'request' | 'response' | 'error';
  count: number;
  lastMessage?: number;
}

export const NetworkVisualization: React.FC<Props> = ({ servers, messages, className }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const [activeConnections, setActiveConnections] = useState<number>(0);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const width = Math.max(containerRect.width - 48, 600); // Account for padding, minimum 600px
        const height = Math.max(width * 0.6, 400); // Maintain aspect ratio, minimum 400px
        setDimensions({ width, height });
      }
    };

    // Initial measurement
    updateDimensions();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    // Update SVG dimensions
    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Clear previous content
    svg.selectAll('*').remove();

    // Create nodes
    const nodes: Node[] = [
      { id: 'client', type: 'client', name: 'MCP Client', fx: width / 2, fy: height / 4 },
      ...servers.map(server => ({
        id: server.name,
        type: 'server' as const,
        name: server.name,
      }))
    ];
    
    console.log('NetworkVisualization nodes:', nodes.map(n => n.id));
    console.log('NetworkVisualization servers:', servers.map(s => `${s.name}:${s.connected}`));

    // Create links based on message history
    const linkMap = new Map<string, Link>();
    
    // Process recent messages to create links
    const recentMessages = messages.slice(-50); // Last 50 messages
    console.log('Processing', recentMessages.length, 'messages for network visualization');
    
    // Create a set of valid node IDs for validation
    const validNodeIds = new Set(nodes.map(n => n.id));
    
    recentMessages.forEach(message => {
      const sourceId = message.direction === 'client-to-server' ? 'client' : message.serverName;
      const targetId = message.direction === 'client-to-server' ? message.serverName : 'client';
      
      // Only create links if both source and target nodes exist
      if (!validNodeIds.has(sourceId) || !validNodeIds.has(targetId)) {
        console.warn(`Skipping link ${sourceId} -> ${targetId}: node not found in visualization`);
        return;
      }
      
      const linkId = `${sourceId}-${targetId}`;
      
      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, {
          source: sourceId,
          target: targetId,
          type: message.error ? 'error' : message.type === 'response' ? 'response' : 'request',
          count: 0,
          lastMessage: message.timestamp,
        });
      }
      
      const link = linkMap.get(linkId)!;
      link.count++;
      if (message.timestamp > (link.lastMessage || 0)) {
        link.lastMessage = message.timestamp;
        link.type = message.error ? 'error' : message.type === 'response' ? 'response' : 'request';
      }
    });

    // Ensure we have links for all connected servers (even if no recent messages)
    // But only if the server node actually exists in the visualization
    servers.filter(s => s.connected).forEach(server => {
      if (!validNodeIds.has(server.name)) {
        console.warn(`Skipping baseline link for ${server.name}: node not found in visualization`);
        return;
      }
      
      const linkId = `client-${server.name}`;
      if (!linkMap.has(linkId)) {
        linkMap.set(linkId, {
          source: 'client',
          target: server.name,
          type: 'request',
          count: 1,
          lastMessage: Date.now() - 60000, // 1 minute ago
        });
      }
    });

    const links = Array.from(linkMap.values());
    console.log('Created', links.length, 'links for network visualization:', links);
    
    // Update state for UI display
    setActiveConnections(links.length);

    // Create force simulation with error handling
    try {
      simulationRef.current = d3.forceSimulation<Node>(nodes)
        .force('link', d3.forceLink<Node, Link>(links)
          .id(d => d.id)
          .distance(150)
          .strength(0.5)
        )
        .force('charge', d3.forceManyBody().strength(-500))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40));
    } catch (error) {
      console.error('Error creating force simulation:', error);
      console.log('Nodes:', nodes.map(n => n.id));
      console.log('Links:', links.map(l => `${l.source} -> ${l.target}`));
      // Return early to prevent further errors
      return;
    }

    // Create container groups
    const g = svg.append('g')
      .attr('width', width)
      .attr('height', height);

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create links
    const linkGroup = g.append('g').attr('class', 'links');
    
    const linkElements = linkGroup
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke-width', d => {
        const width = Math.min(Math.max(d.count / 2, 2), 6);
        console.log(`Link ${d.source}->${d.target}: count=${d.count}, width=${width}`);
        return width;
      })
      .attr('stroke', d => {
        const color = d.type === 'error' ? '#ef4444' : d.type === 'response' ? '#22c55e' : '#3b82f6';
        console.log(`Link ${d.source}->${d.target}: type=${d.type}, color=${color}`);
        return color;
      })
      .attr('stroke-opacity', d => {
        if (!d.lastMessage) return 0.6;
        const age = Date.now() - d.lastMessage;
        const opacity = Math.max(0.4, 1 - (age / 60000)); // Fade over 60 seconds
        console.log(`Link ${d.source}->${d.target}: age=${age}ms, opacity=${opacity}`);
        return opacity;
      })
      .attr('stroke-dasharray', d => d.type === 'request' ? '8,4' : d.type === 'error' ? '4,4' : null)
      .attr('marker-end', 'url(#arrowhead)');
      
    // Add arrowhead marker
    const defs = svg.append('defs');
    
    const arrowhead = defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto');
      
    arrowhead.append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#666')
      .attr('opacity', 0.7);

    // Create nodes
    const nodeElements = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Add circles for nodes
    nodeElements.append('circle')
      .attr('r', d => d.type === 'client' ? 25 : 20)
      .attr('fill', d => {
        if (d.type === 'client') return '#1f2937';
        const server = servers.find(s => s.name === d.id);
        return server?.connected ? '#22c55e' : '#ef4444';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add labels
    nodeElements.append('text')
      .text(d => d.type === 'client' ? 'Client' : d.name.replace('-server', ''))
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white');
      
    // Add server status indicators
    nodeElements
      .filter(d => d.type === 'server')
      .append('circle')
      .attr('r', 6)
      .attr('cx', 15)
      .attr('cy', -15)
      .attr('fill', d => {
        const server = servers.find(s => s.name === d.id);
        return server?.connected ? '#22c55e' : '#ef4444';
      })
      .attr('stroke', 'white')
      .attr('stroke-width', 1);
      
    // Add tool/resource count badges
    nodeElements
      .filter(d => d.type === 'server')
      .append('text')
      .attr('x', 15)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .text(d => {
        const server = servers.find(s => s.name === d.id);
        return server ? server.tools : '0';
      });

    // Add connection count labels
    const linkLabels = g.append('g')
      .selectAll('text')
      .data(links.filter(d => d.count > 1))
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('font-weight', 'bold')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .attr('paint-order', 'stroke fill')
      .text(d => d.count);
      
    // Add pulsing animation for recent messages
    const recentThreshold = Date.now() - 5000; // 5 seconds
    linkElements
      .filter(d => !!d.lastMessage && d.lastMessage > recentThreshold)
      .style('animation', 'pulse 2s infinite');
      
    // Add CSS animation styles
    if (!document.getElementById('network-viz-styles')) {
      const style = document.createElement('style');
      style.id = 'network-viz-styles';
      style.textContent = `
        @keyframes pulse {
          0%, 100% { stroke-opacity: 0.4; }
          50% { stroke-opacity: 1; }
        }
        @keyframes flow {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 20; }
        }
        .message-flow {
          animation: flow 1s linear infinite;
        }
      `;
      document.head.appendChild(style);
    }

    // Update positions on tick
    // Add message flow animation for active links
    const animateMessageFlow = () => {
      const now = Date.now();
      linkElements.each(function(d) {
        const element = d3.select(this);
        if (d.lastMessage && (now - d.lastMessage) < 3000) { // 3 seconds
          element.classed('message-flow', true);
        } else {
          element.classed('message-flow', false);
        }
      });
    };
    
    // Run animation check every second
    const animationInterval = setInterval(animateMessageFlow, 1000);
    
    simulationRef.current.on('tick', () => {
      linkElements
        .attr('x1', d => {
          const source = typeof d.source === 'string' ? nodes.find(n => n.id === d.source) : d.source;
          return source?.x || 0;
        })
        .attr('y1', d => {
          const source = typeof d.source === 'string' ? nodes.find(n => n.id === d.source) : d.source;
          return source?.y || 0;
        })
        .attr('x2', d => {
          const target = typeof d.target === 'string' ? nodes.find(n => n.id === d.target) : d.target;
          return target?.x || 0;
        })
        .attr('y2', d => {
          const target = typeof d.target === 'string' ? nodes.find(n => n.id === d.target) : d.target;
          return target?.y || 0;
        });

      nodeElements
        .attr('transform', d => `translate(${d.x},${d.y})`);

      linkLabels
        .attr('x', d => {
          const source = typeof d.source === 'string' ? nodes.find(n => n.id === d.source) : d.source;
          const target = typeof d.target === 'string' ? nodes.find(n => n.id === d.target) : d.target;
          return ((source?.x || 0) + (target?.x || 0)) / 2;
        })
        .attr('y', d => {
          const source = typeof d.source === 'string' ? nodes.find(n => n.id === d.source) : d.source;
          const target = typeof d.target === 'string' ? nodes.find(n => n.id === d.target) : d.target;
          return ((source?.y || 0) + (target?.y || 0)) / 2;
        });
    });

    return () => {
      simulationRef.current?.stop();
      clearInterval(animationInterval);
    };
  }, [servers, messages, dimensions]);

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className || ''}`}>
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <span className="mr-2">🌐</span>
        Network Visualization
      </h3>
      
      <div ref={containerRef} className="relative w-full">
        <svg
          ref={svgRef}
          className="border rounded w-full"
          style={{ background: '#f9fafb', minHeight: '400px' }}
          viewBox="0 0 600 400"
          preserveAspectRatio="xMidYMid meet"
        />
        
        <div className="absolute bottom-2 left-2 text-xs text-gray-500">
          <div className="bg-white bg-opacity-90 p-3 rounded shadow">
            <div className="space-y-2">
              <div className="font-medium text-gray-700">Legend</div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-blue-500 mr-1" style={{strokeDasharray: '8,4'}}></div>
                  <span>Request</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-green-500 mr-1"></div>
                  <span>Response</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-0.5 bg-red-500 mr-1" style={{strokeDasharray: '4,4'}}></div>
                  <span>Error</span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
                  <span>Connected</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
                  <span>Disconnected</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-2 space-y-1">
        <p className="text-sm text-gray-500">
          Drag nodes to rearrange. Lines show message flow between client and servers.
        </p>
        <p className="text-xs text-gray-400">
          {activeConnections} active connections • {messages.length} total messages
        </p>
      </div>
    </div>
  );
};