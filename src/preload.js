const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quizAPI', {
  getQuestionCount: () => ipcRenderer.invoke('questions:get-count'),
  getQuestionByIndex: (index) => ipcRenderer.invoke('questions:get-by-index', index)
});
