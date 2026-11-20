// What the hero terminal plays when nobody is pointing at the rack: the kind
// of work these streams show, with each tool's real syntax and output format.
// The targets are a lab: an HTB-style private range (10.10.11.x) and a
// lab.local domain. Hashes and the password are fake and cut short.
// Each step: [command, output lines]. Lines are plain text.

export type Step = [string, string[]];

export const SESSIONS: Step[][] = [
  [
    ['nmap -sCV -p- --min-rate 5000 10.10.11.42', [
      'Starting Nmap 7.95 ( https://nmap.org )',
      'PORT     STATE SERVICE      VERSION',
      '53/tcp   open  domain       Simple DNS Plus',
      '88/tcp   open  kerberos-sec Microsoft Windows Kerberos',
      '389/tcp  open  ldap         Microsoft Windows AD LDAP (Domain: lab.local)',
      '445/tcp  open  microsoft-ds?',
      '5985/tcp open  http         Microsoft HTTPAPI httpd 2.0',
      'Nmap done: 1 IP address (1 host up) scanned in 41.27 seconds',
    ]],
    ["nxc smb 10.10.11.42 -u guest -p '' --shares", [
      'SMB  10.10.11.42  445  DC01  [*] Windows Server 2022 Build 20348 x64 (name:DC01) (domain:lab.local) (signing:True) (SMBv1:False)',
      'SMB  10.10.11.42  445  DC01  [+] lab.local\\guest:',
      'SMB  10.10.11.42  445  DC01  [*] Enumerated shares',
      'SMB  10.10.11.42  445  DC01  Share      Permissions  Remark',
      'SMB  10.10.11.42  445  DC01  IPC$       READ         Remote IPC',
      'SMB  10.10.11.42  445  DC01  Public     READ',
    ]],
    ["GetUserSPNs.py lab.local/svc_web:'Winter2025!' -dc-ip 10.10.11.42 -request", [
      'ServicePrincipalName   Name     MemberOf  PasswordLastSet',
      'HTTP/web01.lab.local   svc_sql            2025-03-14 09:12:44',
      '$krb5tgs$23$*svc_sql$LAB.LOCAL$lab.local/svc_sql*$5d9c0e…',
    ]],
    ['hashcat -m 13100 svc_sql.hash /usr/share/wordlists/rockyou.txt', [
      'Session..........: hashcat',
      'Status...........: Cracked',
      'Hash.Mode........: 13100 (Kerberos 5, etype 23, TGS-REP)',
      'Recovered........: 1/1 (100.00%) Digests',
    ]],
  ],
  [
    ['ffuf -u http://10.10.11.57/FUZZ -w raft-small-words.txt -mc 200,301,403', [
      ':: Method           : GET',
      ':: URL              : http://10.10.11.57/FUZZ',
      'admin    [Status: 301, Size: 178, Words: 6, Lines: 8, Duration: 31ms]',
      'uploads  [Status: 403, Size: 162, Words: 4, Lines: 8, Duration: 29ms]',
      'api      [Status: 200, Size: 41, Words: 3, Lines: 1, Duration: 44ms]',
    ]],
    ['curl -s http://10.10.11.57/api/v1/status | jq .', [
      '{',
      '  "service": "inventory",',
      '  "version": "2.3.1",',
      '  "debug": true',
      '}',
    ]],
  ],
  [
    ['vol -f mem.raw windows.pslist | grep -i rundll32', [
      '4412  2280  rundll32.exe  0xd38a6c1e3080  4  -  1  False  2025-11-18 22:41:07',
    ]],
    ['vol -f mem.raw windows.netscan | grep 4412', [
      '0xd38a6d0c9a20  TCPv4  10.0.2.15  49733  185.220.101.4  443  ESTABLISHED  4412  rundll32.exe',
    ]],
    ['yara -r rules/stealers.yar samples/', [
      'Lumma_Stealer samples/invoice_8812.exe',
    ]],
    ["tshark -r case.pcapng -Y dns -T fields -e dns.qry.name | sort | uniq -c | sort -rn | head -3", [
      '    412 update-check.example-cdn.net',
      '     38 time.windows.com',
      '     11 settings-win.data.microsoft.com',
    ]],
  ],
];
