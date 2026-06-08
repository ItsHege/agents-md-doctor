Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
parentDir = fso.GetParentFolderName(scriptDir)
electronExe = fso.BuildPath(scriptDir, "node_modules\electron\dist\electron.exe")
distCli = fso.BuildPath(parentDir, "dist\cli.js")

shell.CurrentDirectory = scriptDir

If Not fso.FileExists(electronExe) Or Not fso.FileExists(distCli) Then
  setupCommand = "cmd.exe /c npm install && npm run parent:install && npm --prefix .. run build"
  setupExitCode = shell.Run(setupCommand, 0, True)

  If setupExitCode <> 0 Then
    MsgBox "AGENTS.md Doctor setup failed. Open desktop-ui-preview in a terminal and run npm install, then npm run dev to see details.", 16, "AGENTS.md Doctor"
    WScript.Quit setupExitCode
  End If
End If

shell.Run """" & electronExe & """ .", 1, False
