Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)

shell.CurrentDirectory = scriptDir
exitCode = shell.Run("cmd.exe /c npm install && npm run parent:install && npm run launcher", 0, True)

If exitCode = 0 Then
  MsgBox "AGENTS.md Doctor launcher is ready.", 64, "AGENTS.md Doctor"
Else
  MsgBox "Setup failed. Run npm install in the desktop-ui-preview folder to see details.", 16, "AGENTS.md Doctor"
End If
