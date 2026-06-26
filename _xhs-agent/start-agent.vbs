Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\agent.js""", 0, False
