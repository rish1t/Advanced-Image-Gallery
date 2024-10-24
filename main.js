const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const axios = require('axios');
const io = require('socket.io-client');
const SERVER_URL = 'http://localhost:5000';

let mainWindow;
let socket;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  createMenu();
  connectWebSocket();
}

function connectWebSocket() {
  socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    withCredentials: true
  });
  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
  });

  socket.on('image_processing_progress', (data) => {
    mainWindow.webContents.send('image_processing_progress', data);
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          click: selectFolder
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Process',
      submenu: [
        {
          label: 'Generate Captions and OCR',
          click: () => mainWindow.webContents.send('process-images')
        }
      ]
    },
    {
      label: 'Search',
      submenu: [
        {
          label: 'Search Images',
          click: () => mainWindow.webContents.send('open-search')
        }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function selectFolder() {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      mainWindow.webContents.send('folder-selected', result.filePaths[0]);
    }
  } catch (error) {
    console.error('Error selecting folder:', error);
    mainWindow.webContents.send('error', 'Failed to select folder');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-images', async (event, folderPath) => {
  try {
    const response = await axios.post(`${SERVER_URL}/get_images`, { folderPath });
    return response.data;
  } catch (error) {
    console.error('Error getting images:', error);
    throw error;
  }
});

ipcMain.handle('open-in-default-app', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
});

ipcMain.handle('edit-image', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error('Error editing file:', error);
    throw error;
  }
});

ipcMain.handle('process-images', async (event, folderPath) => {
  try {
    const response = await axios.post(`${SERVER_URL}/process_images`, { folderPath });
    return response.data;
  } catch (error) {
    console.error('Error processing images:', error);
    throw error;
  }
});

ipcMain.handle('search-images', async (event, folderPath, query) => {
  try {
    const response = await axios.post(`${SERVER_URL}/search_images`, { folderPath, query });
    return response.data;
  } catch (error) {
    console.error('Error searching images:', error);
    throw error;
  }
});

ipcMain.handle('select-folder', selectFolder);