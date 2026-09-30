# Jarvis local connector

Jarvis serves its local UI on `http://127.0.0.1:3002` and connects to the existing BharatShop `personal-ai.mjs` workers. It needs Node.js and the project checkout on the user's Windows machine.

From the BharatShop root in Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\jarvis\install-persistent.ps1 -ProjectRoot (Get-Location).Path
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\jarvis\show-pairing-key.ps1
```

Paste the copied key into the Jarvis UI. The scheduled task starts at sign-in and restarts after a crash. The same key survives restarts, encrypted for the current Windows user by DPAPI. To inspect the task: `Get-ScheduledTask -TaskName 'BharatShop Jarvis'`. To remove autostart: `Unregister-ScheduledTask -TaskName 'BharatShop Jarvis' -Confirm:$false`.

The laptop must be on, signed in, and connected for this local connector to work. A hosted Jarvis page by itself cannot run local workers while the laptop is offline. This installation does not certify store catalog, payments, ads, supplier connections, or production database parity; those need separate live checks before production use.
