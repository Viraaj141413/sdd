import type { Express } from "express";
import { createServer, type Server } from "http";
import { viraajData, requireViraajAuth } from "../VIRAAJDATA.controller";

// Global project files storage
declare global {
  var projectFiles: Record<string, any> | undefined;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize VIRAAJDATA system (handles all auth)
  await viraajData.initialize(app);

  // User info endpoint using VIRAAJDATA
  app.get('/api/auth/user', requireViraajAuth, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const user = await viraajData.getUserById(userId);
      if (user) {
        res.json({
          id: user.id,
          name: user.name,
          email: user.email
        });
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Main chat/AI endpoint
  app.post('/api/ask', async (req, res) => {
    const { prompt, requestType = 'chat' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('Processing AI request with local generation...');

    try {
      // Enhanced local generation system
      console.log('Using enhanced local generation system...');

      let response = '';
      const timestamp = Date.now();
      const seed = timestamp + Math.random() * 1000000;

      // Generate response based on prompt
      if (prompt.toLowerCase().includes('calculator')) {
        response = "I'll create a modern calculator app with a sleek design and full functionality.";

        if (requestType === 'build') {
          // Generate calculator files and save them
          const files = {
            'index.html': {
              content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calculator App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="calculator">
        <div class="display">
            <input type="text" id="result" readonly>
        </div>
        <div class="buttons">
            <button onclick="clearDisplay()">C</button>
            <button onclick="deleteLast()">⌫</button>
            <button onclick="appendToDisplay('/')">/</button>
            <button onclick="appendToDisplay('*')">×</button>

            <button onclick="appendToDisplay('7')">7</button>
            <button onclick="appendToDisplay('8')">8</button>
            <button onclick="appendToDisplay('9')">9</button>
            <button onclick="appendToDisplay('-')">-</button>

            <button onclick="appendToDisplay('4')">4</button>
            <button onclick="appendToDisplay('5')">5</button>
            <button onclick="appendToDisplay('6')">6</button>
            <button onclick="appendToDisplay('+')">+</button>

            <button onclick="appendToDisplay('1')">1</button>
            <button onclick="appendToDisplay('2')">2</button>
            <button onclick="appendToDisplay('3')">3</button>
            <button onclick="calculate()" rowspan="2">=</button>

            <button onclick="appendToDisplay('0')" colspan="2">0</button>
            <button onclick="appendToDisplay('.')">.</button>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`,
              language: 'html'
            },
            'style.css': {
              content: `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.calculator {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 20px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
    border: 1px solid rgba(255, 255, 255, 0.18);
}

.display {
    margin-bottom: 20px;
}

#result {
    width: 100%;
    height: 80px;
    background: rgba(0, 0, 0, 0.3);
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 2em;
    text-align: right;
    padding: 0 20px;
    outline: none;
}

.buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
}

button {
    height: 60px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-size: 1.2em;
    cursor: pointer;
    transition: all 0.3s ease;
}

button:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
}

button:active {
    transform: translateY(0);
}`,
              language: 'css'
            },
            'script.js': {
              content: `let display = document.getElementById('result');
let currentInput = '';

function appendToDisplay(value) {
    currentInput += value;
    display.value = currentInput;
}

function clearDisplay() {
    currentInput = '';
    display.value = '';
}

function deleteLast() {
    currentInput = currentInput.slice(0, -1);
    display.value = currentInput;
}

function calculate() {
    try {
        let result = eval(currentInput.replace('×', '*'));
        display.value = result;
        currentInput = result.toString();
    } catch (error) {
        display.value = 'Error';
        currentInput = '';
    }
}

// Keyboard support
document.addEventListener('keydown', function(event) {
    const key = event.key;

    if ('0123456789+-*/.'.includes(key)) {
        appendToDisplay(key === '*' ? '×' : key);
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
        clearDisplay();
    } else if (key === 'Backspace') {
        deleteLast();
    }
});`,
              language: 'javascript'
            }
          };

          // Save files to ai-generated directory for preview
          const fs = require('fs');
          const path = require('path');
          const aiGenDir = path.join(process.cwd(), 'ai-generated');
          
          if (!fs.existsSync(aiGenDir)) {
            fs.mkdirSync(aiGenDir, { recursive: true });
          }

          Object.entries(files).forEach(([filename, file]) => {
            const filePath = path.join(aiGenDir, filename);
            fs.writeFileSync(filePath, file.content, 'utf8');
            console.log(`📄 Created file: ${filename}`);
          });

          global.projectFiles = files;
          response = "✅ Calculator app created! Your modern calculator includes:\n\n🔢 Full arithmetic operations\n🎨 Beautiful glass-morphism design\n⌨️ Keyboard support\n📱 Responsive layout\n\nCheck the preview to see your calculator in action!";
        }
      } else if (prompt.toLowerCase().includes('todo')) {
        response = "I'll build a feature-rich todo list app with modern design and local storage.";

        if (requestType === 'build') {
          // Generate todo app files
          global.projectFiles = {
            'index.html': {
              content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo List App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>My Todo List</h1>
        <div class="input-container">
            <input type="text" id="todoInput" placeholder="Add a new task...">
            <button onclick="addTodo()">Add</button>
        </div>
        <div class="filters">
            <button class="filter-btn active" onclick="filterTodos('all')">All</button>
            <button class="filter-btn" onclick="filterTodos('active')">Active</button>
            <button class="filter-btn" onclick="filterTodos('completed')">Completed</button>
        </div>
        <ul id="todoList"></ul>
        <div class="stats">
            <span id="totalTasks">0 tasks</span>
            <button onclick="clearCompleted()">Clear Completed</button>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>`,
              language: 'html'
            },
            'style.css': {
              content: `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 600px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    padding: 30px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
    font-size: 2.5em;
}

.input-container {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

#todoInput {
    flex: 1;
    padding: 15px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 16px;
    outline: none;
}

#todoInput:focus {
    border-color: #667eea;
}

button {
    padding: 15px 20px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.3s ease;
}

button:hover {
    background: #5a6fd8;
    transform: translateY(-2px);
}

.filters {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    justify-content: center;
}

.filter-btn {
    padding: 8px 16px;
    background: transparent;
    color: #667eea;
    border: 2px solid #667eea;
    font-size: 14px;
}

.filter-btn.active {
    background: #667eea;
    color: white;
}

#todoList {
    list-style: none;
    margin-bottom: 20px;
}

.todo-item {
    display: flex;
    align-items: center;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 10px;
    transition: all 0.3s ease;
}

.todo-item:hover {
    transform: translateX(5px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.todo-item.completed {
    opacity: 0.6;
    text-decoration: line-through;
}

.todo-item input[type="checkbox"] {
    margin-right: 15px;
    transform: scale(1.2);
}

.todo-text {
    flex: 1;
    font-size: 16px;
}

.delete-btn {
    background: #ff4757;
    padding: 5px 10px;
    font-size: 12px;
}

.delete-btn:hover {
    background: #ff3838;
}

.stats {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
}

.stats button {
    background: #ff4757;
    padding: 8px 16px;
    font-size: 14px;
}`,
              language: 'css'
            },
            'script.js': {
              content: `let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all';

function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();

    if (text === '') return;

    const todo = {
        id: Date.now(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString()
    };

    todos.push(todo);
    input.value = '';
    saveTodos();
    renderTodos();
}

function toggleTodo(id) {
    todos = todos.map(todo => 
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    saveTodos();
    renderTodos();
}

function deleteTodo(id) {
    todos = todos.filter(todo => todo.id !== id);
    saveTodos();
    renderTodos();
}

function filterTodos(filter) {
    currentFilter = filter;

    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    renderTodos();
}

function clearCompleted() {
    todos = todos.filter(todo => !todo.completed);
    saveTodos();
    renderTodos();
}

function renderTodos() {
    const todoList = document.getElementById('todoList');
    const totalTasks = document.getElementById('totalTasks');

    let filteredTodos = todos;

    if (currentFilter === 'active') {
        filteredTodos = todos.filter(todo => !todo.completed);
    } else if (currentFilter === 'completed') {
        filteredTodos = todos.filter(todo => todo.completed);
    }

    todoList.innerHTML = filteredTodos.map(todo => \`
        <li class="todo-item \${todo.completed ? 'completed' : ''}">
            <input type="checkbox" \${todo.completed ? 'checked' : ''} 
                   onchange="toggleTodo(\${todo.id})">
            <span class="todo-text">\${todo.text}</span>
            <button class="delete-btn" onclick="deleteTodo(\${todo.id})">Delete</button>
        </li>
    \`).join('');

    const activeCount = todos.filter(todo => !todo.completed).length;
    totalTasks.textContent = \`\${activeCount} active task\${activeCount !== 1 ? 's' : ''}\`;
}

// Enter key support
document.getElementById('todoInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addTodo();
    }
});

// Initial render
renderTodos();`,
              language: 'javascript'
            }
          };

          // Save files to ai-generated directory for preview
          const fs = require('fs');
          const path = require('path');
          const aiGenDir = path.join(process.cwd(), 'ai-generated');
          
          if (!fs.existsSync(aiGenDir)) {
            fs.mkdirSync(aiGenDir, { recursive: true });
          }

          Object.entries(files).forEach(([filename, file]) => {
            const filePath = path.join(aiGenDir, filename);
            fs.writeFileSync(filePath, file.content, 'utf8');
            console.log(`📄 Created file: ${filename}`);
          });

          global.projectFiles = files;
          response = "✅ Todo List app created! Your productivity app includes:\n\n📝 Add/edit/delete tasks\n✅ Mark tasks as complete\n🔍 Filter by status (All/Active/Completed)\n💾 Local storage persistence\n📊 Task statistics\n🎨 Modern, responsive design\n\nStart organizing your tasks now!";
        }
      } else {
        // General response for other prompts
        response = "I can help you build that! Let me know if you'd like me to create the complete application with all files and functionality.";
      }

      if (!response) {
        response = "I'm here to help you build amazing applications! What would you like to create?";
      }

      // Handle different request types
      let finalResponse = response;
      let showBuildButton = false;
      let appPlan = null;

      if (requestType === 'plan') {
        showBuildButton = true;
        appPlan = {
          title: prompt.toLowerCase().includes('todo') ? 'Todo List App' : 
                 prompt.toLowerCase().includes('calculator') ? 'Calculator App' :
                 'Custom App',
          description: `Build a ${prompt.toLowerCase().includes('todo') ? 'todo list' : 
                               prompt.toLowerCase().includes('calculator') ? 'calculator' : 
                               'custom'} application`,
          features: prompt.toLowerCase().includes('todo') ? 
            ['Add/remove tasks', 'Mark complete', 'Filter tasks', 'Local storage'] :
            prompt.toLowerCase().includes('calculator') ? 
            ['Basic arithmetic', 'Keyboard support', 'Modern design', 'Error handling'] :
            ['Custom functionality', 'Modern design', 'Responsive layout']
        };
      }

      console.log('AI response ready, length:', finalResponse.length);
      res.json({ 
        response: finalResponse, 
        success: true,
        apiUsed: 'local',
        showBuildButton,
        appPlan,
        files: global.projectFiles || {},
        projectSaved: Object.keys(global.projectFiles || {}).length > 0
      });
    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({ error: 'Internal server error', success: false });
    }
  });

  // Replit Agent compatible endpoints
  app.post('/api/agent/generate', async (req: any, res) => {
    try {
      const { prompt, sessionId } = req.body;

       // Mock the generateReplitResponse function
      const generateReplitResponse = (prompt: string) => {
          const response = "I am an AI and I have generated a response for you based on the prompt:" + prompt;
          const files = {
              'index.html': {
                  content: '<h1>Hello World</h1>',
                  language: 'html'
              }
          };
          return { response: response, files: files };
      }

      const response = generateReplitResponse(prompt);

      res.json({
        success: true,
        checkpoint: Date.now(),
        sessionId: sessionId || `session_${Date.now()}`,
        response: response.response,
        files: response.files,
        agentMode: true
      });
    } catch (error) {
      console.error("Error in agent generation:", error);
      res.status(500).json({ message: "Agent generation failed" });
    }
  });

  // Project routes (Agent enhanced)
  app.post('/api/projects', async (req: any, res) => {
    try {
      const userId = req.user?.id || 'dev-user-123'; // Support both auth modes
      const { name, description, prompt, language, framework, files, agentSession } = req.body;

      const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const project = await storage.createProject({
        id: projectId,
        userId,
        name,
        description,
        prompt,
        language,
        framework,
        files,
        agentSession,
        replitAgent: true
      });

      // Log checkpoint for Replit Agent billing
      console.log(`🎯 CHECKPOINT: Project ${projectId} created via Replit Agent`);

      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  const server = createServer(app);
  console.log('Advanced project auto-save system active');
  return server;
}