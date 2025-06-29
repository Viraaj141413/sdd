import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Loader2, Send, Sparkles, Zap, Code, Cpu, Database, Globe, Smartphone, GamepadIcon, Calculator, ChevronDown, ChevronUp, Settings, Play, Square, RotateCcw, Download, ExternalLink, Trash2, Copy, Check, AlertCircle, X } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../hooks/useAuth';

// Types and interfaces
interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  timestamp: Date;
  type?: 'system' | 'code' | 'normal';
  metadata?: {
    filesGenerated?: string[];
    technologies?: string[];
    estimatedLines?: number;
  };
}

interface LiveCodingState {
  fileName: string;
  content: string;
  isActive: boolean;
  language: string;
  progress: number;
  complexity: string;
  patterns: string[];
}

interface ChatInterfaceProps {
  project?: any;
  onConsoleLog?: (message: string, type: 'info' | 'error' | 'success') => void;
  onAppUpdate?: (files: any[]) => void;
  onFileGenerated?: (fileName: string, content: string, language: string) => void;
}

interface CancelToken {
  cancelled: boolean;
  cancel: () => void;
}

// Generation stages and progress tracking
const GENERATION_STAGES = [
  { key: 'analysis', name: 'Analyzing Requirements', duration: 15 },
  { key: 'architecture', name: 'Designing Architecture', duration: 25 },
  { key: 'structure', name: 'Creating File Structure', duration: 20 },
  { key: 'implementation', name: 'Implementing Features', duration: 30 },
  { key: 'optimization', name: 'Optimizing Performance', duration: 10 }
];

// Custom hooks
const useProgress = (stages: typeof GENERATION_STAGES, currentStage: string) => {
  return useMemo(() => {
    const stageIndex = stages.findIndex(stage => stage.key === currentStage);
    if (stageIndex === -1) return 0;

    const completedDuration = stages.slice(0, stageIndex).reduce((sum, stage) => sum + stage.duration, 0);
    const totalDuration = stages.reduce((sum, stage) => sum + stage.duration, 0);

    return Math.round((completedDuration / totalDuration) * 100);
  }, [stages, currentStage]);
};

const useRetry = (maxRetries: number) => {
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    if (retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      return true;
    }
    return false;
  }, [retryCount, maxRetries]);

  const reset = useCallback(() => setRetryCount(0), []);

  return { retry, retryCount, reset, canRetry: retryCount < maxRetries };
};

// Main component
function ChatInterface({ project, onConsoleLog, onAppUpdate, onFileGenerated }: ChatInterfaceProps) {
  const { createProject } = useProjects();
  const { user } = useAuth();
  const { retry, retryCount } = useRetry(3);

  // State Management
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'ai',
      content: 'Hey! 👋 What do you want to make today?\n\nI can help you build websites, apps, games, calculators, todo lists, and more! Just tell me your idea and I\'ll create the code for you.\n\nEverything works locally now - no external APIs needed! What would you like to build?',
      timestamp: new Date(),
      type: 'system'
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [liveCoding, setLiveCoding] = useState<LiveCodingState>({
    fileName: '',
    content: '',
    isActive: false,
    language: '',
    progress: 0,
    complexity: '',
    patterns: []
  });
  const [isGenerationMode, setIsGenerationMode] = useState(true);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [errorAlerts, setErrorAlerts] = useState<string[]>([]);
  const [cancelToken, setCancelToken] = useState<CancelToken | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Effects
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleAutoStart = (event: CustomEvent) => {
      if (event.detail?.prompt) {
        handleSubmit(event.detail.prompt);
      }
    };

    // Check for auto-start message from landing page
    const autoStartMessage = localStorage.getItem('autoStartMessage');
    if (autoStartMessage) {
      localStorage.removeItem('autoStartMessage'); // Clear it so it doesn't auto-send again
      setTimeout(() => {
        handleSubmit(autoStartMessage);
      }, 500); // Small delay to let component fully load
    }

    window.addEventListener('autoStartGeneration' as any, handleAutoStart);
    return () => {
      window.removeEventListener('autoStartGeneration' as any, handleAutoStart);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Progress calculation
  const currentProgress = useProgress(GENERATION_STAGES, currentStage);

  // Character count for input
  const characterCount = inputValue.length;
  const maxCharacters = 2000;

  // Utility functions
  const createCancelToken = useCallback((): CancelToken => {
    const token = { cancelled: false, cancel: () => {} };
    token.cancel = () => { token.cancelled = true; };
    return token;
  }, []);

  const isCodeGenerationRequest = useCallback((input: string): boolean => {
    const lowerInput = input.toLowerCase().trim();

    // Code generation keywords - anything that involves building/creating
    const codeKeywords = [
      'create', 'build', 'make', 'generate', 'develop', 'write', 'code', 'app', 'application',
      'website', 'web', 'function', 'component', 'class', 'module', 'script', 'program',
      'todo', 'calculator', 'game', 'dashboard', 'form', 'login', 'signup', 'api', 'database',
      'add', 'implement', 'design', 'setup', 'configure'
    ];

    // Check for code generation patterns
    for (const keyword of codeKeywords) {
      if (lowerInput.includes(keyword)) {
        return true; // Code generation mode
      }
    }

    // Default to chat mode for questions and explanations
    return false;
  }, []);

  const generateFileName = useCallback((content: string, language: string, index: number): string => {
    // Use language to determine file extension
    let extension = 'txt';
    let baseName = 'file';

    switch (language.toLowerCase()) {
      case 'html':
        extension = 'html';
        baseName = 'index';
        break;
      case 'css':
        extension = 'css';
        baseName = 'styles';
        break;
      case 'javascript':
      case 'js':
        extension = 'js';
        baseName = 'script';
        break;
      case 'typescript':
      case 'ts':
        extension = 'ts';
        baseName = 'app';
        break;
      case 'python':
      case 'py':
        extension = 'py';
        baseName = 'main';
        break;
      case 'json':
        extension = 'json';
        baseName = 'package';
        break;
      default:
        // Try to detect from content
        if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
          extension = 'html';
          baseName = 'index';
        } else if (content.includes('body {') || content.includes('@media')) {
          extension = 'css';
          baseName = 'styles';
        } else if (content.includes('function') || content.includes('const ') || content.includes('let ')) {
          extension = 'js';
          baseName = 'script';
        }
    }

    // Return filename, use index only if there are multiple files of same type
    return index === 0 ? `${baseName}.${extension}` : `${baseName}${index + 1}.${extension}`;
  }, []);

  const generateLocalCode = useCallback((prompt: string): string => {
    const responses = [
      `I'll create a modern application for you! Here's the implementation:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Application</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
            width: 90%;
        }
        h1 { color: #333; margin-bottom: 1rem; }
        .button {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 10px;
            cursor: pointer;
            font-size: 1rem;
            margin: 0.5rem;
            transition: transform 0.2s;
        }
        .button:hover { transform: translateY(-2px); }
        .result { margin-top: 1rem; padding: 1rem; background: #f0f0f0; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Your Application</h1>
        <p>Built with modern web technologies!</p>
        <button class="button" onclick="showDemo()">Try Demo</button>
        <div id="result" class="result" style="display:none;">
            <h3>Success! 🎉</h3>
            <p>Your application is working perfectly!</p>
        </div>
    </div>
    <script>
        function showDemo() {
            document.getElementById('result').style.display = 'block';
            console.log('Demo activated!');
        }
    </script>
</body>
</html>
\`\`\`

This creates a beautiful, responsive application with modern design principles. The app includes interactive elements and smooth animations.`,

      `Here's your complete application with advanced features:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Advanced App</title>
    <style>
        :root {
            --primary: #6366f1;
            --secondary: #8b5cf6;
            --accent: #06b6d4;
            --background: #f8fafc;
            --text: #1e293b;
            --card: #ffffff;
            --border: #e2e8f0;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--background);
            color: var(--text);
            line-height: 1.6;
            min-height: 100vh;
        }
        .app {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
            padding: 2rem;
            background: var(--card);
            border-radius: 20px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .title {
            font-size: 3rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }
        .feature-card {
            background: var(--card);
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
        }
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }
        .btn {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 10px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.3s ease;
            margin: 0.5rem;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
        }
        .demo-area {
            background: var(--card);
            padding: 2rem;
            border-radius: 15px;
            margin-top: 2rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .status {
            padding: 1rem;
            border-radius: 10px;
            margin-top: 1rem;
            text-align: center;
            font-weight: 600;
        }
        .success { background: #dcfce7; color: #166534; }
        .info { background: #dbeafe; color: #1e40af; }
        @media (max-width: 768px) {
            .title { font-size: 2rem; }
            .features { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="app">
        <header class="header">
            <h1 class="title">🎯 Advanced Application</h1>
            <p>Modern, responsive, and feature-rich web application</p>
        </header>

        <div class="features">
            <div class="feature-card">
                <div class="feature-icon">⚡</div>
                <h3>Lightning Fast</h3>
                <p>Optimized for performance with modern web standards</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">📱</div>
                <h3>Responsive Design</h3>
                <p>Works perfectly on all devices and screen sizes</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🔧</div>
                <h3>Interactive Features</h3>
                <p>Rich user interactions and smooth animations</p>
            </div>
        </div>

        <div class="demo-area">
            <h2>Interactive Demo</h2>
            <button class="btn" onclick="runDemo()">🚀 Start Demo</button>
            <button class="btn" onclick="showInfo()">ℹ️ Show Info</button>
            <button class="btn" onclick="resetDemo()">🔄 Reset</button>

            <div id="status" class="status info" style="display:none;">
                Ready to demonstrate advanced features!
            </div>
        </div>
    </div>

    <script>
        let demoActive = false;

        function runDemo() {
            const status = document.getElementById('status');
            status.style.display = 'block';
            status.className = 'status success';
            status.innerHTML = '✅ Demo running successfully! All features working.';
            demoActive = true;

            // Simulate some processing
            setTimeout(() => {
                if (demoActive) {
                    status.innerHTML += '<br>📊 Processing data... Analytics updated!';
                }
            }, 2000);
        }

        function showInfo() {
            const status = document.getElementById('status');
            status.style.display = 'block';
            status.className = 'status info';
            status.innerHTML = '📋 Application Info:<br>• Built with HTML5, CSS3, JavaScript<br>• Responsive design principles<br>• Modern UI/UX patterns';
        }

        function resetDemo() {
            const status = document.getElementById('status');
            status.style.display = 'none';
            demoActive = false;
            console.log('Demo reset');
        }

        // Initialize app
        document.addEventListener('DOMContentLoaded', () => {
            console.log('🎉 Application loaded successfully!');
        });
    </script>
</body>
</html>
\`\`\`

This application features modern design, responsive layout, interactive elements, and professional styling. Perfect for any web project!`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }, []);

  const simulateTyping = useCallback(async (code: string, fileName: string, language: string) => {
    const lines = code.split('\n');
    const complexity = lines.length > 50 ? 'complex' : lines.length > 25 ? 'medium' : 'simple';

    setLiveCoding(prev => ({
      ...prev,
      fileName,
      language,
      complexity,
      patterns: ['AI-Powered Generation', 'Production Ready', 'Modern Architecture'],
      isActive: true
    }));

    let currentContent = '';
    // Professional typing speed - realistic coding simulation
    const typingSpeed = Math.max(50, Math.min(150, 2000 / lines.length));

    for (let i = 0; i < lines.length; i++) {
      currentContent += lines[i] + '\n';
      const progress = Math.round((i / lines.length) * 100);

      setLiveCoding(prev => ({
        ...prev,
        content: currentContent,
        progress
      }));

      // Simulate realistic AI coding with occasional thinking pauses
      if (i % 8 === 0) {
        await new Promise(resolve => setTimeout(resolve, typingSpeed * 3)); // AI thinking pause
      } else {
        await new Promise(resolve => setTimeout(resolve, typingSpeed));
      }
    }

    setLiveCoding(prev => ({ ...prev, content: code, progress: 100, isActive: false }));
  }, []);

  const saveProject = useCallback(async (prompt: string, filesCreated: string[], codeBlocks: string[]) => {
    try {
      if (createProject) {
        const projectData = {
          name: `AI Generated - ${prompt.slice(0, 30)}...`,
          description: `Created from prompt: ${prompt}`,
          prompt: prompt,
          language: 'html',
          framework: 'vanilla',
          files: filesCreated.map((fileName, index) => ({
            name: fileName,
            content: codeBlocks[index] || '',
            language: fileName.endsWith('.html') ? 'html' : 
                     fileName.endsWith('.js') ? 'javascript' : 
                     fileName.endsWith('.css') ? 'css' : 'text'
          }))
        };

        await createProject.mutateAsync(projectData);
        onConsoleLog?.('✅ Project saved successfully!', 'success');
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      onConsoleLog?.('❌ Failed to save project', 'error');
    }
  }, [createProject, onConsoleLog]);

  // Gradual file generation like Replit Agent
  const generateProjectFiles = useCallback(async (userInput: string) => {
    try {
      setIsLoading(true);
      setIsGenerationMode(true);
      setCurrentStage('🤖 Analyzing your request...');

      // Start AI response
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userInput }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const aiResponse = data.response;

      setCurrentStage('📝 Planning project structure...');
      await new Promise(resolve => setTimeout(resolve, 2500));

      setCurrentStage('🏗️ Setting up architecture...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      setCurrentStage('📋 Analyzing requirements...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract code blocks
      const codeBlocks = aiResponse.match(/```[\w+]?\n([\s\S]*?)```/g) || [];
      const filesCreated: string[] = [];

      if (codeBlocks.length > 0) {
        setCurrentStage('🔨 Creating files...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        for (let i = 0; i < codeBlocks.length; i++) {
          const block = codeBlocks[i];
          const languageMatch = block.match(/```(\w+)/);
          const language = languageMatch ? languageMatch[1] : 'text';
          const code = block.replace(/```\w*\n/, '').replace(/```$/, '');

          if (code.trim()) {
            const fileName = generateFileName(code, i);

            // Show file being created
            setLiveCoding({
              fileName,
              content: '',
              isActive: true,
              language,
              progress: 0,
              complexity: 'building',
              patterns: []
            });

            // Show file being created with realistic timing
            setCurrentStage(`📄 Creating ${fileName}...`);
            await new Promise(resolve => setTimeout(resolve, 800));

            // Simulate typing the code
            await simulateTyping(code, fileName, language);
            if (onFileGenerated) {
               onFileGenerated(fileName, code, language);
            }
            filesCreated.push(fileName);

            setLiveCoding(prev => ({ ...prev, isActive: false }));
            setCurrentStage(`✅ ${fileName} created successfully`);
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        }
      }

      setCurrentStage('✅ Project ready!');
      setIsGenerationMode(false);
      setGenerationComplete(true);

      // Add minimal response to chat (no code visible)
      const responseMessage: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ai',
        content: `✅ I've created your project with ${filesCreated.length} files. Check the file explorer to see what I built!\n\n${filesCreated.map(file => `📄 ${file}`).join('\n')}`,
        timestamp: new Date(),
        type: 'system',
        metadata: {
            filesGenerated: filesCreated
        }
      };

      setMessages(prev => [...prev, responseMessage]);
      onConsoleLog?.(`✅ Generated ${filesCreated.length} files`, 'success');

    } catch (error) {
      console.error('Error:', error);
      setCurrentStage('❌ Generation failed');
      onConsoleLog?.('❌ Failed to generate project', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onConsoleLog, generateFileName, simulateTyping, onFileGenerated]);

  // Main handler functions
  const sendChatMessage = useCallback(async (userInput: string) => {
    // Check if this is a code generation request
    const isCodeRequest = /make|create|build|generate|write|code|app|website|calculator|game|todo|project/i.test(userInput);

    if (isCodeRequest) {
      await generateProjectFiles(userInput);
    } else {
      // Handle normal chat
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: userInput }),
        });

        if (!response.ok) {
          throw new Error('Failed to get AI response');
        }

        const data = await response.json();

        // Extract any code blocks and create files instead of showing in chat
        const codeBlocks = data.response.match(/```[\w+]?\n([\s\S]*?)```/g) || [];
        let cleanResponse = data.response;

        if (codeBlocks.length > 0) {
          // Remove code blocks from chat response
          cleanResponse = data.response.replace(/```[\w+]?\n([\s\S]*?)```/g, '').trim();

          // Create files from code blocks
          for (let i = 0; i < codeBlocks.length; i++) {
            const block = codeBlocks[i];
            const languageMatch = block.match(/```(\w+)/);
            const language = languageMatch ? languageMatch[1] : 'text';
            const code = block.replace(/```\w*\n/, '').replace(/```$/, '').trim();

            if (code) {
              const fileName = generateFileName(code, language, i);

              // Professional file creation with animation
              try {
                // Show typing animation
                await simulateTyping(code, fileName, language);

                // Create the actual file
                const response = await fetch('/api/files/create', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    fileName,
                    content: code,
                    language
                  })
                });

                if (response.ok) {
                  console.log(`✅ File created: ${fileName}`);
                  if (onFileGenerated) {
                    onFileGenerated(fileName, code, language);
                  }
                } else {
                  console.error(`❌ Failed to create file: ${fileName}`);
                }
              } catch (error) {
                console.error('Error creating file:', error);
              }
            }
          }

          cleanResponse += `\n\n📁 Created ${codeBlocks.length} files for you!`;
        }

        const responseMessage: ChatMessage = {
          id: Date.now().toString(),
          sender: 'ai',
          content: cleanResponse,
          timestamp: new Date(),
          type: 'response'
        };

        setMessages(prev => [...prev, responseMessage]);
      } catch (error) {
        console.error('Error:', error);
        onConsoleLog?.('❌ Failed to get response', 'error');
      }
    }
  }, [generateProjectFiles, onConsoleLog]);

  const handleFileGeneration = useCallback(async (userInput: string, token: CancelToken) => {
    setCurrentStage('analysis');
    setLiveCoding(prev => ({ ...prev, isActive: true, fileName: 'Loading...', content: '' }));

    // Simulate AI analysis and setup
    await new Promise(resolve => setTimeout(resolve, 500));
    if (token.cancelled) return;

    setCurrentStage('architecture');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (token.cancelled) return;

    setCurrentStage('structure');
    await new Promise(resolve => setTimeout(resolve, 750));
    if (token.cancelled) return;

    // Call the API to get AI response with file generation
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: userInput }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const aiResponse = data.response;

      // Extract code blocks from AI response
      const codeBlocks = aiResponse.match(/```[\w+]?\n([\s\S]*?)```/g) || [];
      const filesCreated: string[] = [];

      if (codeBlocks.length > 0) {
        for (let i = 0; i < codeBlocks.length; i++) {
          if (token.cancelled) break;

          const block = codeBlocks[i];
          const languageMatch = block.match(/```(\w+)/);
          const language = languageMatch ? languageMatch[1] : 'text';
          const code = block.replace(/```\w*\n/, '').replace(/```$/, '');
          const fileName = generateFileName(code, i);

          // Create file in the project
          if (onFileGenerated) {
            onFileGenerated(fileName, code, language);
          }
          filesCreated.push(fileName);
          await simulateTyping(code, fileName, language);

          onConsoleLog(`📄 Created file: ${fileName}`, 'success');
        }
      }

      // Save project if files were created
      if (filesCreated.length > 0) {
        await saveProject(userInput, filesCreated, codeBlocks);
      }

      // Show the response
      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        type: codeBlocks.length > 0 ? 'code' : 'normal',
        metadata: filesCreated.length > 0 ? {
          filesGenerated: filesCreated,
          technologies: ['HTML', 'CSS', 'JavaScript'],
          estimatedLines: codeBlocks.reduce((acc, block) => acc + block.split('\n').length, 0)
        } : undefined
      };

      setMessages(prev => [...prev, aiMessage]);

      if (filesCreated.length > 0) {
        setGenerationComplete(true);
        setIsGenerationMode(false);
        onConsoleLog(`✅ Generated ${filesCreated.length} files successfully!`, 'success');
      }

    } catch (error) {
      console.error('Error generating files:', error);
      onConsoleLog('❌ Failed to generate files', 'error');

      // Fallback to local generation
      const aiResponse = generateLocalCode(userInput);
      const codeBlocks = aiResponse.match(/```[\w+]?\n([\s\S]*?)```/g) || [];
      const filesCreated: string[] = [];

      if (codeBlocks.length > 0) {
        for (let i = 0; i < codeBlocks.length; i++) {
          if (token.cancelled) break;

          const block = codeBlocks[i];
          const languageMatch = block.match(/```(\w+)/);
          const language = languageMatch ? languageMatch[1] : 'text';
          const code = block.replace(/```\w*\n/, '').replace(/```$/, '');
          const fileName = generateFileName(code, i);

          if (onFileGenerated) {
            onFileGenerated(fileName, code, language);
          }
          filesCreated.push(fileName);
          await simulateTyping(code, fileName, language);
        }
      }

      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        sender: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        type: codeBlocks.length > 0 ? 'code' : 'normal',
        metadata: filesCreated.length > 0 ? {
          filesGenerated: filesCreated,
          technologies: ['HTML', 'CSS', 'JavaScript'],
          estimatedLines: codeBlocks.reduce((acc, block) => acc + block.split('\n').length, 0)
        } : undefined
      };

      setMessages(prev => [...prev, aiMessage]);
    }

    setCurrentStage('complete');
  }, [onFileGenerated, simulateTyping, saveProject, generateFileName, onConsoleLog]);

  const handleAIResponse = useCallback(async (userInput: string) => {
    setIsLoading(true);
    setCurrentStage('');
    setLiveCoding(prev => ({ ...prev, isActive: false }));

    // Check if this is a Replit Agent session
    const isAgentMode = userInput.toLowerCase().includes('agent') || 
                       userInput.toLowerCase().includes('build') ||
                       userInput.toLowerCase().includes('create') ||
                       userInput.toLowerCase().includes('make');

    // Create cancel token
    const token = createCancelToken();
    setCancelToken(token);

    try {
      const shouldGenerateCode = isCodeGenerationRequest(userInput);

      if (shouldGenerateCode && isGenerationMode) {
        await handleFileGeneration(userInput, token);
      } else {
        // Use Agent endpoint if in Agent mode
        const endpoint = isAgentMode ? '/api/agent/generate' : '/api/ask';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: userInput,
            projectId: project?.id,
            sessionId: `session_${Date.now()}`,
            agentMode: isAgentMode
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get AI response');
        }

        const data = await response.json();

        // Handle Replit Agent checkpoints
        if (data.checkpoint) {
          console.log(`🎯 Checkpoint reached: ${data.checkpoint}`);
          onConsoleLog?.(`🎯 Replit Agent Checkpoint: ${new Date().toLocaleTimeString()}`, 'success');
        }
      }
    } catch (error) {
      console.error('Error in handleAIResponse:', error);
      onConsoleLog?.('❌ Failed to process request', 'error');
      setErrorAlerts(prev => [...prev, 'Failed to process your request. Please try again.']);
    } finally {
      setIsLoading(false);
      setCurrentStage('');
      setLiveCoding(prev => ({ ...prev, isActive: false }));
      setCancelToken(null);
    }
  }, [isCodeGenerationRequest, isGenerationMode, createCancelToken, handleFileGeneration, sendChatMessage, onConsoleLog, project]);

  const handleSubmit = useCallback(async (inputText?: string) => {
    const messageText = inputText || inputValue.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: messageText,
      timestamp: new Date(),
      type: 'normal'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    await handleAIResponse(messageText);
  }, [inputValue, isLoading, handleAIResponse]);

  const handleCancel = useCallback(() => {
    if (cancelToken) {
      cancelToken.cancel();
      setCancelToken(null);
    }
    setIsLoading(false);
    setCurrentStage('');
    setLiveCoding(prev => ({ ...prev, isActive: false }));
    onConsoleLog?.('⏹️ Generation cancelled', 'info');
  }, [cancelToken, onConsoleLog]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    handleSubmit(suggestion);
  }, [handleSubmit]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Suggestions
  const suggestions = [
    '🌐 Create a modern website',
    '📱 Build a mobile app interface', 
    '🎮 Make a simple game',
    '📊 Design a dashboard',
    '🧮 Build a calculator',
    '📝 Create a todo app'
  ];

  const currentStageName = GENERATION_STAGES.find(stage => stage.key === currentStage)?.name || '';

  return (
    <div className="flex flex-col h-full bg-[var(--replit-bg)]">
      {/* Header */}
      <div className="border-b border-[var(--replit-border)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-[var(--replit-accent)]" />
              <span className="font-semibold text-[var(--replit-text)]">AI Assistant</span>
            </div>
            {isGenerationMode && (
              <Badge variant="secondary" className="bg-[var(--replit-accent)]/10 text-[var(--replit-accent)]">
                Generation Mode
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-2' : 'order-1'}`}>
              <Card className={`p-4 ${
                message.sender === 'user' 
                  ? 'bg-[var(--replit-accent)] text-white ml-4' 
                  : 'bg-[var(--replit-panel)] border-[var(--replit-border)] mr-4'
              }`}>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                {message.metadata && (
                  <div className="mt-3 pt-3 border-t border-[var(--replit-border)] space-y-2">
                    {message.metadata.filesGenerated && (
                      <div>
                        <span className="text-xs font-medium text-[var(--replit-text-dim)]">Files Generated:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {message.metadata.filesGenerated.map(file => (
                            <Badge key={file} variant="secondary" className="text-xs">
                              {file}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {message.metadata.technologies && (
                      <div>
                        <span className="text-xs font-medium text-[var(--replit-text-dim)]">Technologies:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {message.metadata.technologies.map(tech => (
                            <Badge key={tech} variant="outline" className="text-xs">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="text-xs text-[var(--replit-text-dim)] mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </Card>
            </div>
          </div>
        ))}

        {/* Live Coding Display */}
        {liveCoding.isActive && (
          <div className="bg-[var(--replit-panel)] border border-[var(--replit-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Code className="h-4 w-4 text-[var(--replit-accent)]" />
                <span className="text-sm font-medium">Live Coding: {liveCoding.fileName}</span>
                {liveCoding.language && (
                  <Badge variant="secondary" className="text-xs">
                    {liveCoding.language}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-[var(--replit-text-dim)]">
                {liveCoding.progress}% complete
              </div>
            </div>

            {liveCoding.complexity && (
              <div className="flex items-center space-x-4 mb-3 text-xs text-[var(--replit-text-dim)]">
                <span>Complexity: {liveCoding.complexity}</span>
                {liveCoding.patterns.length > 0 && (
                  <span>Patterns: {liveCoding.patterns.join(', ')}</span>
                )}
              </div>
            )}

            <div className="bg-[var(--replit-bg)] rounded-md p-3 font-mono text-sm max-h-32 overflow-y-auto">
              <div className="whitespace-pre-wrap text-[var(--replit-text)]">
                {liveCoding.content}
                <span className="animate-pulse">|</span>
              </div>
            </div>

            <div className="mt-3 bg-[var(--replit-border)] rounded-full h-2 overflow-hidden">
              <div 
                className="bg-[var(--replit-accent)] h-full transition-all duration-300 ease-out"
                style={{ width: `${liveCoding.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Generation Progress */}
        {isLoading && currentStage && (
          <div className="bg-[var(--replit-panel)] border border-[var(--replit-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--replit-accent)]" />
                <span className="text-sm font-medium">Generating Code</span>
              </div>
              <div className="text-sm text-[var(--replit-text-dim)]">
                {currentProgress}%
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-[var(--replit-text-dim)]">{currentStageName}</div>
              <div className="bg-[var(--replit-border)] rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-[var(--replit-accent)] h-full transition-all duration-500 ease-out"
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              className="mt-3 text-xs"
            >
              Cancel Generation
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && !isLoading && (
        <div className="px-4 pb-2">
          <div className="text-xs text-[var(--replit-text-dim)] mb-2">Try these suggestions:</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="suggestion-chip text-xs h-8"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-[var(--replit-border)] p-4">
        <div className="flex items-end space-x-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Describe what you want to build..."
              disabled={isLoading}
              className="min-h-[40px] pr-16 resize-none bg-[var(--replit-panel)] border-[var(--replit-border)]"
              maxLength={maxCharacters}
            />
            <div className="absolute bottom-2 right-2 text-xs text-[var(--replit-text-dim)]">
              {characterCount}/{maxCharacters}
            </div>
          </div>
          <Button
            onClick={() => handleSubmit()}
            disabled={!inputValue.trim() || isLoading || characterCount > maxCharacters}
            size="sm"
            className="px-3 bg-[var(--replit-accent)] hover:bg-[var(--replit-accent)]/80"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;