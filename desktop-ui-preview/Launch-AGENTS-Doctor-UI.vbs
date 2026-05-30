Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)

shell.CurrentDirectory = scriptDir
shell.Run "cmd.exe /c npm run dev", 0, False
