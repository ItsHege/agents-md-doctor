const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentsDoctor", {
  selectProject: () => ipcRenderer.invoke("project:select"),
  runCheck: (payload) => ipcRenderer.invoke("doctor:run", payload),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text)
});
