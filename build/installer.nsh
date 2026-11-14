!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ZionCast Remote"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="ZionCast Remote App"'
  nsExec::ExecToLog 'netsh advfirewall firewall set rule name="ZionCast" new action=allow profile=any enable=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="ZionCast Remote" dir=in action=allow protocol=TCP localport=3000-3020 profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="ZionCast Remote App" dir=in action=allow program="$INSTDIR\ZionCast.exe" profile=any'
!macroend

