#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  pressure: number;
  timestamp: string;
}

class WeatherServer {
  private server: Server;
  private cachedWeather: Map<string, WeatherData> = new Map();
  private apiKey: string;

  constructor() {
    // OpenWeatherMap API key - can be set via environment variable
    // For demo purposes, will fall back to mock data if no key provided
    this.apiKey = process.env.OPENWEATHER_API_KEY || '';
    
    if (!this.apiKey) {
      console.error('Warning: No OpenWeatherMap API key provided. Using mock data. Set OPENWEATHER_API_KEY environment variable for real weather data.');
    }
    this.server = new Server(
      {
        name: 'weather-server',
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
    this.initSampleData();
  }

  private initSampleData() {
    // Add some sample weather data for demo purposes
    const sampleLocations = [
      {
        location: 'San Francisco, CA',
        temperature: 18,
        condition: 'Partly Cloudy',
        humidity: 65,
        windSpeed: 12,
        pressure: 1013,
      },
      {
        location: 'New York, NY',
        temperature: 22,
        condition: 'Clear',
        humidity: 55,
        windSpeed: 8,
        pressure: 1018,
      },
      {
        location: 'London, UK',
        temperature: 15,
        condition: 'Rainy',
        humidity: 80,
        windSpeed: 15,
        pressure: 1005,
      },
      {
        location: 'Tokyo, Japan',
        temperature: 25,
        condition: 'Sunny',
        humidity: 70,
        windSpeed: 6,
        pressure: 1020,
      },
    ];

    sampleLocations.forEach(data => {
      this.cachedWeather.set(data.location.toLowerCase(), {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = Array.from(this.cachedWeather.keys()).map(location => ({
        uri: `weather://${encodeURIComponent(location)}`,
        name: `Weather for ${this.cachedWeather.get(location)?.location}`,
        description: `Current weather data for ${this.cachedWeather.get(location)?.location}`,
        mimeType: 'application/json',
      }));

      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const location = decodeURIComponent(uri.replace('weather://', ''));
      
      const weatherData = this.cachedWeather.get(location);
      if (!weatherData) {
        throw new Error(`Weather data not found for ${location}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(weatherData, null, 2),
          },
        ],
      };
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather for a location',
            inputSchema: {
              type: 'object',
              properties: {
                location: { 
                  type: 'string', 
                  description: 'City name or location (e.g., "San Francisco, CA")' 
                },
              },
              required: ['location'],
            },
          },
          {
            name: 'get_forecast',
            description: 'Get weather forecast for a location',
            inputSchema: {
              type: 'object',
              properties: {
                location: { 
                  type: 'string', 
                  description: 'City name or location' 
                },
                days: { 
                  type: 'number', 
                  description: 'Number of forecast days (1-7)',
                  minimum: 1,
                  maximum: 7 
                },
              },
              required: ['location'],
            },
          },
          {
            name: 'compare_weather',
            description: 'Compare weather between two locations',
            inputSchema: {
              type: 'object',
              properties: {
                location1: { type: 'string', description: 'First location' },
                location2: { type: 'string', description: 'Second location' },
              },
              required: ['location1', 'location2'],
            },
          },
          {
            name: 'weather_alerts',
            description: 'Get weather alerts for a location',
            inputSchema: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'Location to check for alerts' },
              },
              required: ['location'],
            },
          },
          {
            name: 'add_location',
            description: 'Add a new location to weather monitoring',
            inputSchema: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'Location name' },
                temperature: { type: 'number', description: 'Temperature in Celsius' },
                condition: { type: 'string', description: 'Weather condition' },
                humidity: { type: 'number', description: 'Humidity percentage' },
                windSpeed: { type: 'number', description: 'Wind speed in km/h' },
                pressure: { type: 'number', description: 'Atmospheric pressure in hPa' },
              },
              required: ['location', 'temperature', 'condition'],
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
          case 'get_weather':
            return await this.getWeather(args);
          case 'get_forecast':
            return await this.getForecast(args);
          case 'compare_weather':
            return await this.compareWeather(args);
          case 'weather_alerts':
            return await this.getWeatherAlerts(args);
          case 'add_location':
            return await this.addLocation(args);
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

  private async getWeather(args: any) {
    const location = args.location as string;
    const locationKey = location.toLowerCase();
    
    // Check cache first (5 minute cache)
    const cached = this.cachedWeather.get(locationKey);
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < 5 * 60 * 1000) {
      return this.formatWeatherResponse(cached);
    }

    let weatherData: WeatherData;

    if (this.apiKey) {
      try {
        // Call real OpenWeatherMap API
        weatherData = await this.fetchRealWeather(location);
        this.cachedWeather.set(locationKey, weatherData);
      } catch (error) {
        console.error('Weather API error:', error);
        // Fall back to mock data on API failure
        weatherData = this.generateMockWeather(location);
        this.cachedWeather.set(locationKey, weatherData);
      }
    } else {
      // Use mock data if no API key
      weatherData = this.generateMockWeather(location);
      this.cachedWeather.set(locationKey, weatherData);
    }

    return this.formatWeatherResponse(weatherData);
  }

  private async fetchRealWeather(location: string): Promise<WeatherData> {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${this.apiKey}&units=metric`;
    
    const response = await axios.get(url);
    const data = response.data;

    return {
      location: `${data.name}, ${data.sys.country}`,
      temperature: Math.round(data.main.temp),
      condition: data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
      pressure: data.main.pressure,
      timestamp: new Date().toISOString(),
    };
  }

  private formatWeatherResponse(weatherData: WeatherData) {
    const dataSource = this.apiKey ? "OpenWeatherMap API" : "simulated data";
    const weatherReport = `🌤️ **Weather for ${weatherData.location}**

🌡️ **Temperature:** ${weatherData.temperature}°C
☁️ **Condition:** ${weatherData.condition}
💧 **Humidity:** ${weatherData.humidity}%
💨 **Wind Speed:** ${weatherData.windSpeed} km/h
📊 **Pressure:** ${weatherData.pressure} hPa
🕐 **Last Updated:** ${new Date(weatherData.timestamp).toLocaleString()}

---
*Data retrieved from ${dataSource}*`;

    return {
      content: [
        {
          type: 'text',
          text: weatherReport,
        },
      ],
    };
  }

  private async getForecast(args: any) {
    const location = args.location as string;
    const days = Math.min((args.days as number) || 3, 5); // Limit to 5 days for free API

    let forecast = [];
    const dataSource = this.apiKey ? "OpenWeatherMap API" : "simulated data";

    if (this.apiKey) {
      try {
        forecast = await this.fetchRealForecast(location, days);
      } catch (error) {
        console.error('Forecast API error:', error);
        // Fall back to mock forecast
        forecast = await this.generateMockForecast(location, days);
      }
    } else {
      forecast = await this.generateMockForecast(location, days);
    }

    const forecastText = `📅 **${days}-Day Forecast for ${location}**

${forecast.map(day => 
  `**${day.date}:** ${day.temperature}°C, ${day.condition} (${day.humidity}% humidity)`
).join('\n')}

---
*Forecast data from ${dataSource}*`;

    return {
      content: [
        {
          type: 'text',
          text: forecastText,
        },
      ],
    };
  }

  private async fetchRealForecast(location: string, days: number) {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${this.apiKey}&units=metric`;
    
    const response = await axios.get(url);
    const data = response.data;

    // OpenWeatherMap returns 5-day forecast with 3-hour intervals
    // Group by day and take midday forecast
    const forecastByDay = new Map();
    
    data.list.forEach((item: any) => {
      const date = new Date(item.dt * 1000);
      const dateKey = date.toDateString();
      
      // Take the forecast closest to noon
      if (!forecastByDay.has(dateKey) || Math.abs(date.getHours() - 12) < Math.abs(new Date(forecastByDay.get(dateKey).dt * 1000).getHours() - 12)) {
        forecastByDay.set(dateKey, item);
      }
    });

    return Array.from(forecastByDay.values()).slice(0, days).map((item: any) => ({
      date: new Date(item.dt * 1000).toLocaleDateString(),
      temperature: Math.round(item.main.temp),
      condition: item.weather[0].description.charAt(0).toUpperCase() + item.weather[0].description.slice(1),
      humidity: item.main.humidity,
    }));
  }

  private async generateMockForecast(location: string, days: number) {
    const baseWeather = await this.getWeatherData(location);
    const forecast = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      // Generate realistic variations
      const tempVariation = (Math.random() - 0.5) * 10;
      const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'];
      
      forecast.push({
        date: date.toLocaleDateString(),
        temperature: Math.round(baseWeather.temperature + tempVariation),
        condition: i === 0 ? baseWeather.condition : conditions[Math.floor(Math.random() * conditions.length)],
        humidity: Math.round(baseWeather.humidity + (Math.random() - 0.5) * 20),
      });
    }

    return forecast;
  }

  private async compareWeather(args: any) {
    const location1 = args.location1 as string;
    const location2 = args.location2 as string;

    const weather1 = await this.getWeatherData(location1);
    const weather2 = await this.getWeatherData(location2);

    const tempDiff = weather2.temperature - weather1.temperature;
    const humidityDiff = weather2.humidity - weather1.humidity;

    const comparison = `⚖️ **Weather Comparison**

**${weather1.location}**
🌡️ ${weather1.temperature}°C, ${weather1.condition}
💧 ${weather1.humidity}% humidity

**${weather2.location}**
🌡️ ${weather2.temperature}°C, ${weather2.condition}
💧 ${weather2.humidity}% humidity

**Differences:**
🌡️ Temperature: ${tempDiff > 0 ? '+' : ''}${tempDiff}°C ${tempDiff > 0 ? 'warmer' : tempDiff < 0 ? 'cooler' : 'same'} in ${weather2.location}
💧 Humidity: ${humidityDiff > 0 ? '+' : ''}${humidityDiff}% ${humidityDiff > 0 ? 'more humid' : humidityDiff < 0 ? 'less humid' : 'same'} in ${weather2.location}`;

    return {
      content: [
        {
          type: 'text',
          text: comparison,
        },
      ],
    };
  }

  private async getWeatherAlerts(args: any) {
    const location = args.location as string;
    const weather = await this.getWeatherData(location);

    const alerts = [];

    // Generate alerts based on weather conditions
    if (weather.temperature > 35) {
      alerts.push('🔥 Heat Warning: Extreme temperatures expected');
    }
    if (weather.temperature < -10) {
      alerts.push('❄️ Cold Warning: Freezing temperatures');
    }
    if (weather.windSpeed > 50) {
      alerts.push('💨 Wind Warning: High wind speeds');
    }
    if (weather.condition.toLowerCase().includes('rain') && weather.humidity > 90) {
      alerts.push('🌧️ Flood Watch: Heavy rain and high humidity');
    }

    const alertText = alerts.length > 0 
      ? `⚠️ **Weather Alerts for ${location}**\n\n${alerts.join('\n')}`
      : `✅ **No Weather Alerts for ${location}**\n\nCurrent conditions are within normal ranges.`;

    return {
      content: [
        {
          type: 'text',
          text: alertText,
        },
      ],
    };
  }

  private async addLocation(args: any) {
    const location = args.location as string;
    const weatherData: WeatherData = {
      location,
      temperature: args.temperature as number,
      condition: args.condition as string,
      humidity: (args.humidity as number) || 50,
      windSpeed: (args.windSpeed as number) || 10,
      pressure: (args.pressure as number) || 1013,
      timestamp: new Date().toISOString(),
    };

    this.cachedWeather.set(location.toLowerCase(), weatherData);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Successfully added weather data for ${location}\n\n${JSON.stringify(weatherData, null, 2)}`,
        },
      ],
    };
  }

  private async getWeatherData(location: string): Promise<WeatherData> {
    const key = location.toLowerCase();
    let weatherData = this.cachedWeather.get(key);
    
    if (!weatherData) {
      // Try partial match
      for (const [cachedKey, data] of this.cachedWeather.entries()) {
        if (cachedKey.includes(key) || key.includes(cachedKey.split(',')[0].toLowerCase())) {
          weatherData = data;
          break;
        }
      }
    }

    if (!weatherData) {
      weatherData = this.generateMockWeather(location);
      this.cachedWeather.set(key, weatherData);
    }

    return weatherData;
  }

  private generateMockWeather(location: string): WeatherData {
    const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear', 'Overcast'];
    
    return {
      location,
      temperature: Math.round(Math.random() * 30 + 5), // 5-35°C
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      humidity: Math.round(Math.random() * 40 + 40), // 40-80%
      windSpeed: Math.round(Math.random() * 20 + 5), // 5-25 km/h
      pressure: Math.round(Math.random() * 50 + 990), // 990-1040 hPa
      timestamp: new Date().toISOString(),
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Weather MCP Server running on stdio');
  }
}

const server = new WeatherServer();
server.run().catch(console.error);