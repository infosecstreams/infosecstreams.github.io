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
  r=requests.get(f'https://sullygnome.com/channel/{username}/30/activitystats', headers=head)
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
  url = f'https://sullygnome.com/api/charts/barcharts/getconfig/channelhourstreams/30/{uid}/{username}/%20/%20/0/0/%20/0/0/'
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
      if len(line.split('|')) > 3: lang = line.split('|')[3].strip('\n')
      # if len(line.split('|')) > 3: cat = line.split('|')[5].strip('\n')
      if extraData:
        nl += f'🟢 | `{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp; [<i class="fab fa-youtube" style="color:#C00"></i>]({extraData}) |{lang}\n'
      else:
        nl += f'🟢 | `{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp; |{lang}\n'
    else:
      if extraData:
        nl += f'&nbsp; | `{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp; [<i class="fab fa-youtube" style="color:#C00"></i>]({extraData}) |\n'
      else:
        nl += f'&nbsp; | `{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp; |\n'
  else:
    if extraData:
      nl += f'`{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp; [<i class="fab fa-youtube" style="color:#C00"></i>]({extraData})\n'
    else:
      nl += f'`{username}` | [<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{username}) &nbsp;\n'
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
# activityData=[('LinuxYSeguridad', 249.0, ''), ('OCEANSGIANT', 59.0, ''), ('S4vitaar', 46.0, 'https://www.youtube.com/channel/UCNHWpNqiM8yOQcHXtsluD7Q'), ('Security_Live', 46.0, 'https://www.youtube.com/channel/UCMDy1HAPNcpl8zVTK1NfMqw'), ('GoProSlowYo', 45.0, 'https://www.youtube.com/channel/UCEvTMFvV92XCBhMwQbHWzeg?sub_confirmation=1'), ('Firzen14', 41.0, ''), ('Skyfire100', 35.0, 'https://www.twitch.tv/skyfire100'), ('irasakai', 31.0, ''), ('jbeers11', 31.0, ''), ('h4ck0rman', 30.0, ''), ('BeauKnowsTech', 29.0, ''), ('Anyascii', 27.0, ''), ('AyWang', 26.0, ''), ('h8handles', 25.0, ''), ('YERTX_CO', 24.0, ''), ('Technology_Interpreters', 23.0, 'https://www.youtube.com/user/TechInterpreterInc'), ('SecurityWeekly', 21.0, 'https://www.youtube.com/channel/UCg--XBjJ50a9tUhTKXVPiqg'), ('Alh4zr3d', 19.0, 'https://www.youtube.com/channel/UCz-Z-d2VPQXHGkch0-_KovA'), ('hackorgame', 19.0, 'https://www.youtube.com/channel/UCj1GJShGx78PjZlHoRrMiwA'), ('Blades_1000', 18.0, ''), ('endingwithali', 17.0, ''), ('InfayerTS', 16.0, ''), ('JohnHammond010', 16.0, 'https://www.youtube.com/channel/UCVeW9qkBjo3zosnqUbG7CFw'), ('Libereau', 16.0, ''), ('Westar', 16.0, ''), ('Eth0ghost', 16.0, ''), ('c04tl', 15.0, ''), ('mttaggart', 15.0, 'https://www.youtube.com/taggarttech'), ('pwncollege', 15.0, 'https://www.youtube.com/channel/UCBaWwFw7KmCN8YlfX4ERYKg'), ('ShellDredd', 15.0, ''), ('ZKuaker', 15.0, ''), ('MrCrumbs_', 14.0, ''), ('optionalctf', 14.0, 'https://www.youtube.com/channel/UCK1rytKRQPJh-78RS4jt9eA'), ('Thegwar', 12.0, ''), ('blvkhakr', 11.0, ''), ('zerobandwidth', 11.0, ''), ('0xTib3rius', 9.0, 'https://www.youtube.com/Tib3rius'), ('footpics4sale', 9.0, ''), ('lea_cyber', 9.0, ''), ('HackingIsland', 9.0, 'https://www.youtube.com/channel/UCaqcHDqE0DuqoaoVwJQa7vQ'), ('dayzerosec', 8.0, 'https://www.youtube.com/channel/UCXFC76FDHZRVes6_lZqwLBA'), ('gamozo', 8.0, 'https://www.youtube.com/channel/UC17ewSS9f2EnkCyMztCdoKA'), ('maikroservice', 8.0, ''), ('0xJ3lly', 7.0, ''), ('HackerOneTV', 7.0, ''), ('MDISEC', 7.0, ''), ('Cyber_Insecurity', 6.0, 'https://www.youtube.com/channel/UCL4JGzitDkX5TOwzs9A02Kg'), ('mbcrump', 6.0, 'https://www.youtube.com/channel/UCCjHMUEzoCauYet8NG4sCog'), ('AgeOfEntropy', 6.0, 'https://www.youtube.com/channel/UCitiWg5p-R6QNLPuJPSE33g'), ('B7H30', 5.0, ''), ('BanjoCrashland', 5.0, ''), ('FroMastr', 5.0, ''), ('InfosecHouse', 5.0, ''), ('XeSquirmy', 5.0, ''), ('0xBufu', 4.0, ''), ('ChrisSean', 4.0, ''), ('DCCyberSec', 4.0, 'https://www.youtube.com/channel/UC3sccPO4v8YqCTn8sezZGTw'), ('OffSecOfficial', 4.0, ''), ('securityfwd', 4.0, 'https://www.youtube.com/channel/UCgTNupxATBfWmfehv21ym-g'), ('TheGoodHackerTV', 4.0, 'https://www.youtube.com/channel/UCeeOzvMFfd2qcUFIGN_Nzyw'), ('0reoByte', 3.0, ''), ('ChadB_n00b', 3.0, ''), ('CyberTechVibes', 3.0, ''), ('CyberWarriorStudios', 3.0, 'https://www.youtube.com/channel/UC1BeplJcC5YGHjcF8QyRD7g'), ('Flangvik', 3.0, ''), ('HackTheBox', 3.0, ''), ('NahamSec', 3.0, ''), ('UnPentester', 3.0, ''), ('AlexChaveriat', 2.0, 'https://www.youtube.com/c/AlexChaveriat/videos'), ('appsectribe', 2.0, ''), ('curi0usjack', 2.0, ''), ('d0nutptr', 2.0, 'https://www.youtube.com/d0nutptr'), ('Defcon201Live', 2.0, ''), ('Jonathandata1', 2.0, ''), ('LiveOverflow', 2.0, 'https://www.youtube.com/c/LiveOverflowCTF'), ('PwnSchool', 2.0, 'https://www.youtube.com/c/ThePwnSchoolProject'), ('SpiceySec', 2.0, ''), ('TheHackerMaker', 2.0, ''), ('RedSiegeInfoSec', 2.0, 'https://www.youtube.com/channel/UC4rR_-qnJXny4LsCfxW418g'), ('2ocstream', 1.0, ''), ('cyber_v1s3rion', 1.0, ''), ('DasRealBert', 1.0, ''), ('EightBitOni', 1.0, ''), ('fearless0523', 1.0, ''), ('mell0wx', 1.0, ''), ('MVLWVR3', 1.0, ''), ('Techryptic', 1.0, ''), ('0xCardinal', 0.0, ''), ('0xRy4nG', 0.0, 'https://www.youtube.com/channel/UCQWQlNq07_Rumy2i69dpqBw'), ('55keez', 0.0, ''), ('Alomancy', 0.0, 'https://www.youtube.com/channel/UCe2i94acge3Bv2Tmjla0h_g'), ('blindpentester', 0.0, ''), ('CMNatic', 0.0, ''), ('creminer', 0.0, ''), ('CybeardSec', 0.0, ''), ('cyberVNO', 0.0, ''), ('DarkStar7471', 0.0, ''), ('dicecreation', 0.0, ''), ('dimineko', 0.0, ''), ('dmll606', 0.0, ''), ('EchoZach', 0.0, ''), ('foxcap_', 0.0, ''), ('GrumpyHackers', 0.0, ''), ('hackingesports', 0.0, ''), ('hattondog', 0.0, ''), ('heyJ4X0N', 0.0, ''), ('InsiderPhD', 0.0, ''), ('kegnsec', 0.0, ''), ('lMinzarl', 0.0, ''), ('MagneticPenguin', 0.0, ''), ('majksec', 0.0, ''), ('OfficialWilliP', 0.0, 'https://www.youtube.com/channel/UCaOOGHgwrcyf527o838yLyg'), ('primalMK', 0.0, ''), ('RedFox0x20', 0.0, ''), ('Ryskill', 0.0, ''), ('saucysec', 0.0, ''), ('Sharghaas', 0.0, ''), ('smash8tap', 0.0, ''), ('stokfredrik', 0.0, ''), ('sup3rhero1', 0.0, 'https://www.youtube.com/superhero1'), ('thecybermentor', 0.0, 'https://www.youtube.com/channel/UC0ArlFuFYMpEewyRBzdLHiw'), ('TheMayor11', 0.0, 'https://www.youtube.com/channel/UC5J6JvH5F29FllbLjwmA5ZA'), ('VandalTheGrey', 0.0, ''), ('xychelsea87', 0.0, ''), ('0xChance', 0.0, ''), ('aHaquer', 0.0, ''), ('Ash_F0x', 0.0, ''), ('ch3fez', 0.0, ''), ('codingo_', 0.0, 'https://www.youtube.com/channel/UCUfO02gdMDXgOJWdv_jiLMg'), ('ctrlbyte', 0.0, ''), ('CyberReport', 0.0, ''), ('dal3ksec', 0.0, ''), ('DevNullZen', 0.0, ''), ('digitenchou', 0.0, ''), ('Djax120', 0.0, 'https://www.youtube.com/channel/UCJVQ4X0olUFq0nrxS8Xvijg'), ('DOWRIGHT', 0.0, ''), ('esdn_tv', 0.0, ''), ('Goldwave__', 0.0, ''), ('hackbacc', 0.0, ''), ('HackingEsports_eng', 0.0, ''), ('hey_its_LGG', 0.0, 'https://www.youtube.com/channel/UCFzslRuETaviEruPQ_HQP1A'), ('infinitelogins', 0.0, 'https://www.youtube.com/channel/UC_nKukFaGysjMzqMVHEIgxQ'), ('jrozner', 0.0, ''), ('KOkencyber', 0.0, ''), ('ltn_bob', 0.0, ''), ('magnologanxp', 0.0, ''), ('Nirloy', 0.0, ''), ('poocha_police', 0.0, ''), ('quercusvirginiana', 0.0, ''), ('RedTeamMedic', 0.0, ''), ('s1zzurpmane', 0.0, ''), ('SawyerOne', 0.0, ''), ('SherlockSec', 0.0, ''), ('softexploit', 0.0, ''), ('streambytes_', 0.0, ''), ('Th3lazykid', 0.0, ''), ('TheManyHatsClub', 0.0, ''), ('TryHackMe', 0.0, ''), ('xThe_Developer', 0.0, '')]
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
sortedMd = "---: | --- | :--- | :---\n" + sortedMd.strip('\n')

with open('./index.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('---: | --- | :--- | :---', sortedMd)
with open('./index.md', 'w') as f:
  f.write(contents)

# Generate inactive.md
sortedMd = ''
for username, _, extraData in inactivityData:
  sortedMd += createMarkdown(username, extraData, True)
sortedMd = "--: | ---\n" + sortedMd.strip('\n')

with open('./inactive.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('--: | ---', sortedMd)
with open('./inactive.md', 'w') as f:
  f.write(contents)
