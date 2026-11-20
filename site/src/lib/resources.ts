// Resource links; descriptions and group names are translated in src/i18n/*.json.
export const GROUPS = ['education', 'handsOn', 'reference', 'ctf', 'shell', 'resources'] as const;

export const RESOURCES: { key: string; name: string; url: string; group: (typeof GROUPS)[number]; extra?: [string, string][] }[] = [
  { key: 'taggart', name: 'The Taggart Institute', url: 'https://taggartinstitute.org/', group: 'education' },
  { key: 'tryhackme', name: 'TryHackMe', url: 'https://tryhackme.com', group: 'handsOn' },
  { key: 'bandit', name: 'Over the Wire: The Bandit', url: 'https://overthewire.org/wargames/bandit', group: 'handsOn' },
  { key: 'hackthebox', name: 'HackTheBox', url: 'https://www.hackthebox.com', group: 'handsOn' },
  { key: 'gtfobins', name: 'GTFOBins', url: 'https://gtfobins.github.io', group: 'reference' },
  { key: 'hacktricks', name: 'HackTricks', url: 'https://book.hacktricks.wiki/', group: 'reference' },
  { key: 'awesomectf', name: 'Awesome CTF', url: 'https://apsdehal.in/awesome-ctf', group: 'ctf' },
  { key: 'crackstation', name: 'CrackStation', url: 'https://crackstation.net', group: 'ctf' },
  { key: 'cyberchef', name: 'CyberChef', url: 'https://gchq.github.io/CyberChef', group: 'ctf' },
  { key: 'dcode', name: 'dCode', url: 'https://www.dcode.fr/en', group: 'ctf' },
  { key: 'hackvertor', name: 'Hackvertor', url: 'https://hackvertor.co.uk/', group: 'ctf' },
  { key: 'explainshell', name: 'ExplainShell', url: 'https://explainshell.com', group: 'shell' },
  {
    key: 'hacktools', name: 'Hack-Tools', url: 'https://github.com/LasCC/Hack-Tools', group: 'shell',
    extra: [
      ['Chrome', 'https://chrome.google.com/webstore/detail/hack-tools/cmbndhnoonmghfofefkcccljbkdpamhi'],
      ['Firefox', 'https://addons.mozilla.org/en-US/firefox/addon/hacktools/'],
    ],
  },
  { key: 'pentestws', name: 'PenTest.WS', url: 'https://pentest.ws', group: 'shell' },
  { key: 'revshells', name: 'RevShells', url: 'https://www.revshells.com', group: 'shell' },
  { key: 'ss64', name: 'SS64', url: 'https://ss64.com', group: 'shell' },
  { key: 'infosechouse', name: 'Infosec House', url: 'https://infosec.house', group: 'resources' },
  { key: 'rawsec', name: 'RawSec', url: 'https://inventory.raw.pm/overview.html', group: 'resources' },
];
