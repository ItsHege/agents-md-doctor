const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentsDoctor", {
  selectProject: () => ipcRenderer.invoke("project:select"),
  validateProject: (path) => ipcRenderer.invoke("project:validate", path),
  runCheck: (payload) => ipcRenderer.invoke("doctor:run", payload),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  loadPreferences: () => ipcRenderer.invoke("preferences:load"),
  savePreferences: (preferences) => ipcRenderer.invoke("preferences:save", preferences),
  saveReviewedFindings: (payload) => ipcRenderer.invoke("reviewed-findings:save", payload),
  removeReviewedFindings: (payload) => ipcRenderer.invoke("reviewed-findings:remove", payload),
  openFile: (payload) => ipcRenderer.invoke("file:open", payload),
  saveReport: (payload) => ipcRenderer.invoke("report:save", payload),
  notify: (payload) => ipcRenderer.invoke("app:notify", payload),
  onAppCommand: (callback) => {
    ipcRenderer.on("app:command", (_event, command) => callback(command));
  }
});
