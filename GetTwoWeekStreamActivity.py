#!/usr/bin/env python

import csv, json, re, requests

# getTwitchUsernames reads a list of streamers in a CSV file and returns
# the streamers and their "extraData" (if they have any).
def getTwitchUsernames():
  """
  Returns: List of usernames.
  """
  with open('./streamers.csv', 'r') as f:
    return [(line.split(',')[0], line.split(',')[1]) for line in f.read().split('\n') if len(line) > 0]

# getScrapeData takes a username a returns a uid,username,timecode for
# scraping data.
def getScrapeData(username):
  head = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0'
  }
  r=requests.get(f'https://sullygnome.com/channel/{username}/14/activitystats', headers=head)
  a=r.text
  if username not in a: return None,username,''
  try:
    for line in a.split('\n'):
      if 'var PageInfo = ' in line:
        username = json.loads(line[line.index(' = ')+3:-1].rstrip(';'))['name']
        uid = json.loads(line[line.index(' = ') + 3:-1].rstrip(';'))['id']
        timecode = json.loads(line[line.index(' = ') + 3:-1].rstrip(';'))['timecode']
        break
  except Exception as e:
    print(line[line.index(' = ') + 3:-1])
    print(e)
  return uid,username,timecode

# querySullyGnomeActivityStats takes a uid,username,timecode
# (see getScrapeData() above) and returns a username and their
# two-week activity total.
def querySullyGnomeActivityStats(uid, username, timecode):
  if uid == None: return (username, 0.0)
  url = f'https://sullygnome.com/api/charts/barcharts/getconfig/channelhourstreams/14/{uid}/{username}/%20/%20/0/0/%20/0/0/'
  print(url)
  headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.5',
    'Content-Type': 'application/json; charset=utf-8',
    'Timecode': timecode,
    'X-Requested-With': 'XMLHttpRequest',
  }

  activitiyRequest = requests.get(url, headers=headers)
  total=0
  if activitiyRequest.status_code == 200:
    j=activitiyRequest.json()
    for i,streams in enumerate(j['data']['datasets'][0]['data']):
      total += (i+1) * streams
  return username, total

# createLine takes a username,"extraData," and a line in a
# file and returns a new line to be added to the markdown.
def createLine(username, extraData, line, inactive=False):
  nl = ''
  if not inactive:
    if '🟢' in line:
      if extraData:
        nl += f'🟢 | `{username}` | [{username}](https://www.twitch.tv/{username}) | [YouTube]({extraData})\n'
      else:
        nl += f'🟢 | `{username}` | [{username}](https://www.twitch.tv/{username}) | \n'
    else:
      if extraData:
        nl += f'&nbsp; | `{username}` | [{username}](https://www.twitch.tv/{username}) | [YouTube]({extraData})\n'
      else:
        nl += f'&nbsp; | `{username}` | [{username}](https://www.twitch.tv/{username}) | \n'
  else:
    if extraData:
      nl += f'`{username}` | [{username}](https://www.twitch.tv/{username}) | [YouTube]({extraData})\n'
    else:
      nl += f'`{username}` | [{username}](https://www.twitch.tv/{username}) | \n'
  return nl

# createMarkdown takes a username and "extraData" and
# returns an entire markdown document for the hacklist.
def createMarkdown(username, extraData, inactive=False):
  if not inactive:
    md = ""
    exists = False
    with open("./index.md", 'r') as f:
      for line in f.readlines():
        if re.match(re.compile(f'^🟢\s\|\s`{username.lower()}`'), line.lower()):
          exists = True
          md += createLine(username, extraData, line)

      if not exists:
        md += createLine(username, extraData, line)
  else:
    md = ""
    exists = False
    with open("./index.md", 'r') as f:
      for line in f.readlines():
        if re.match(re.compile(f'^🟢\s\|\s`{username.lower()}`'), line.lower()):
          exists = True
          md += createLine(username, extraData, line, True)

      if not exists:
        md += createLine(username, extraData, line, True)
  return md


# The dirty business that calls all the other dirty bits.
# activityData=[('Security_Live', 126.0, 'https://www.youtube.com/channel/UCMDy1HAPNcpl8zVTK1NfMqw'), ('irasakai', 46.0, ''), ('S4vitaar', 40.0, 'https://www.youtube.com/channel/UCNHWpNqiM8yOQcHXtsluD7Q'), ('GoProSlowYo', 35.0, ''), ('SecurityWeekly', 35.0, 'https://www.youtube.com/channel/UCg--XBjJ50a9tUhTKXVPiqg'), ('optionalctf', 27.0, 'https://www.youtube.com/channel/UCK1rytKRQPJh-78RS4jt9eA'), ('Defcon201Live', 26.0, ''), ('c04tl', 24.0, ''), ('Technology_Interpreteres', 24.0, 'https://www.youtube.com/user/TechInterpreterInc'), ('endingwithali', 19.0, ''), ('ShellDredd', 19.0, ''), ('Westar', 19.0, ''), ('AyWang', 17.0, ''), ('Cyber_Insecurity', 17.0, 'https://www.youtube.com/channel/UCL4JGzitDkX5TOwzs9A02Kg'), ('ch3fez', 16.0, ''), ('gamozo', 15.0, 'https://www.youtube.com/channel/UC17ewSS9f2EnkCyMztCdoKA'), ('maikroservice', 14.0, ''), ('Alh4zr3d', 13.0, 'https://www.youtube.com/channel/UCz-Z-d2VPQXHGkch0-_KovA'), ('dayzerosec', 13.0, 'https://www.youtube.com/channel/UCXFC76FDHZRVes6_lZqwLBA'), ('zerobandwidth', 13.0, ''), ('ZKuaker', 13.0, ''), ('B7H30', 11.0, ''), ('ChadB_n00b', 11.0, ''), ('jrozner', 11.0, ''), ('xychelsea87', 10.0, ''), ('Anyascii', 9.0, ''), ('BanjoCrashland', 9.0, ''), ('blvkhakr', 9.0, ''), ('EightBitOni', 9.0, ''), ('mttaggart', 9.0, ''), ('TheHackerMaker', 9.0, ''), ('Thegwar', 8.0, ''), ('MVLWVR3', 7.0, ''), ('Nirloy', 7.0, ''), ('TheGoodHackerTV', 7.0, ''), ('xThe_Developer', 7.0, ''), ('0reoByte', 6.0, ''), ('CyberTechVibes', 6.0, ''), ('thecybermentor', 6.0, 'https://www.youtube.com/channel/UC0ArlFuFYMpEewyRBzdLHiw'), ('FroMastr', 5.0, ''), ('InfosecHouse', 5.0, ''), ('Libereau', 5.0, ''), ('OffSecOfficial', 5.0, ''), ('securityfwd', 5.0, 'https://www.youtube.com/channel/UCgTNupxATBfWmfehv21ym-g'), ('ChrisSean', 4.0, ''), ('DasRealBert', 4.0, ''), ('Flangvik', 4.0, ''), ('hackingesports', 4.0, ''), ('sup3rhero1', 4.0, 'https://www.youtube.com/superhero1'), ('PwnSchool', 3.0, 'https://www.youtube.com/c/ThePwnSchoolProject'), ('0xSaihat', 2.0, ''), ('2ocstream', 2.0, ''), ('AlexChaveriat', 2.0, 'https://www.youtube.com/c/AlexChaveriat/videos'), ('cyber_v1s3rion', 2.0, ''), ('CyberWarriorStudios', 2.0, 'https://www.youtube.com/channel/UC1BeplJcC5YGHjcF8QyRD7g'), ('footpics4sale', 2.0, ''), ('GrumpyHackers', 2.0, ''), ('LiveOverflow', 2.0, 'https://www.youtube.com/c/LiveOverflowCTF'), ('SawyerOne', 2.0, ''), ('streambytes_', 2.0, ''), ('0xCardinal', 1.0, ''), ('DCCyberSec', 1.0, 'https://www.youtube.com/channel/UC3sccPO4v8YqCTn8sezZGTw'), ('mbcrump', 1.0, 'https://www.youtube.com/channel/UCCjHMUEzoCauYet8NG4sCog'), ('SpiceySec', 1.0, ''), ('0xa_LilKelly', 0.0, ''), ('0xBufu', 0.0, ''), ('0xChance', 0.0, ''), ('0xTib3rius', 0.0, ''), ('55keez', 0.0, ''), ('aHaquer', 0.0, ''), ('Alomancy', 0.0, 'https://www.youtube.com/channel/UCe2i94acge3Bv2Tmjla0h_g'), ('Ash_F0x', 0.0, ''), ('blindpentester', 0.0, ''), ('CMNatic', 0.0, ''), ('codingo_', 0.0, 'https://www.youtube.com/channel/UCUfO02gdMDXgOJWdv_jiLMg'), ('creminer', 0.0, ''), ('ctrlbyte', 0.0, ''), ('CybeardSec', 0.0, ''), ('CyberReport', 0.0, ''), ('cyberVNO', 0.0, ''), ('d0nutptr', 0.0, 'https://www.youtube.com/d0nutptr'), ('dal3ksec', 0.0, ''), ('DarkStar7471', 0.0, ''), ('DevNullZen', 0.0, ''), ('dicecreation', 0.0, ''), ('digitenchou', 0.0, ''), ('dimineko', 0.0, ''), ('Djax120', 0.0, 'https://www.youtube.com/channel/UCJVQ4X0olUFq0nrxS8Xvijg'), ('dmll606', 0.0, ''), ('DOWRIGHT', 0.0, ''), ('EchoZach', 0.0, ''), ('esdn_tv', 0.0, ''), ('fearless0523', 0.0, ''), ('foxcap_', 0.0, ''), ('Goldwave__', 0.0, ''), ('hackbacc', 0.0, ''), ('HackingEsports_eng', 0.0, ''), ('HackTheBox', 0.0, ''), ('hattondog', 0.0, ''), ('hey_its_LGG', 0.0, 'https://www.youtube.com/channel/UCFzslRuETaviEruPQ_HQP1A'), ('heyJ4X0N', 0.0, ''), ('infinitelogins', 0.0, 'https://www.youtube.com/channel/UC_nKukFaGysjMzqMVHEIgxQ'), ('InsiderPhD', 0.0, ''), ('JohnHammond010', 0.0, 'https://www.youtube.com/channel/UCVeW9qkBjo3zosnqUbG7CFw'), ('kegnsec', 0.0, ''), ('KOkencyber', 0.0, ''), ('lMinzarl', 0.0, ''), ('ltn_bob', 0.0, ''), ('MagneticPenguin', 0.0, ''), ('magnologanxp', 0.0, ''), ('majksec', 0.0, ''), ('mell0wx', 0.0, ''), ('MrCrumbs_', 0.0, ''), ('NahamSec', 0.0, ''), ('nidensec', 0.0, ''), ('OfficialWilliP', 0.0, 'https://www.youtube.com/channel/UCaOOGHgwrcyf527o838yLyg'), ('poocha_police', 0.0, ''), ('primalMK', 0.0, ''), ('pwncollege', 0.0, 'https://www.youtube.com/channel/UCBaWwFw7KmCN8YlfX4ERYKg'), ('quercusvirginiana', 0.0, ''), ('RedFox0x20', 0.0, ''), ('RedTeamMedic', 0.0, ''), ('Ryskill', 0.0, ''), ('s1zzurpmane', 0.0, ''), ('saucysec', 0.0, ''), ('Sharghaas', 0.0, ''), ('SherlockSec', 0.0, ''), ('smash8tap', 0.0, ''), ('softexploit', 0.0, ''), ('Th3lazykid', 0.0, ''), ('TheManyHatsClub', 0.0, ''), ('TheMayor11', 0.0, 'https://www.youtube.com/channel/UC5J6JvH5F29FllbLjwmA5ZA'), ('TryHackMe', 0.0, ''), ('UnPentester', 0.0, ''), ('VandalTheGrey', 0.0, ''), ('XeSquirmy', 0.0, '')]
activityData = list(
    sorted([(*querySullyGnomeActivityStats(*getScrapeData(username)), extraData)
            for username, extraData in getTwitchUsernames()
            ], key=lambda x: x[1], reverse=True))
inactivityData=[]
for tuplet in activityData:
  if None in tuplet: activityData.remove(tuplet)
  if 0.0 in tuplet:
    inactivityData.append(tuplet)
    activityData.remove(tuplet)
print(inactivityData)
print(activityData)

# Generate index.md
sortedMd = ''
for username, _, extraData in activityData:
  sortedMd += createMarkdown(username, extraData)
sortedMd = "--: | --: | --- | :-- | --- | :--\n" + sortedMd.strip('\n')

with open('./index.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('--: | --: | --- | :-- | --- | :--', sortedMd)
with open('./index.md', 'w') as f:
  f.write(contents)

# Generate inactive.md
sortedMd = ''
for username, _, extraData in inactivityData:
  sortedMd += createMarkdown(username, extraData, True)
sortedMd = "--: | --- | :-- | --- | :--\n" + sortedMd.strip('\n')

with open('./inactive.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('--: | --- | :-- | --- | :--', sortedMd)
with open('./inactive.md', 'w') as f:
  f.write(contents)
