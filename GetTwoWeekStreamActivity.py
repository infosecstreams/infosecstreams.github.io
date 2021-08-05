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
  if uid == None: return (username, 0)
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
def createLine(username, extraData, line):
  nl = ''
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
  return nl

# createMarkdown takes a username and "extraData" and
# returns an entire markdown document for the hacklist.
def createMarkdown(username, extraData):
  md = ""
  exists = False
  with open("./index.md", 'r') as f:
    for line in f.readlines():
      if re.match(re.compile(f'^🟢\s\|\s`{username.lower()}`'), line.lower()):
        exists = True
        md += createLine(username, extraData, line)

    if not exists:
      md += createLine(username, extraData, line)
  return md


# The dirty business that calls all the other dirty bits.
#activityData=[('Security_Live', 64.0, 'https://www.youtube.com/channel/UCMDy1HAPNcpl8zVTK1NfMqw'), ('gamozo', 54.0, 'https://www.youtube.com/channel/UC17ewSS9f2EnkCyMztCdoKA'), ('optionalctf', 40.0, 'https://www.youtube.com/channel/UCK1rytKRQPJh-78RS4jt9eA'), ('S4vitaar', 40.0, 'https://www.youtube.com/channel/UCNHWpNqiM8yOQcHXtsluD7Q'), ('GoProSlowYo', 36.0, ''), ('AyWang', 34.0, ''), ('SecurityWeekly', 30.0, 'https://www.youtube.com/channel/UCg--XBjJ50a9tUhTKXVPiqg'), ('c04tl', 21.0, ''), ('ShellDredd', 19.0, ''), ('EightBitOni', 17.0, ''), ('Westar', 17.0, ''), ('Anyascii', 16.0, ''), ('DEFCON_DCTV_One', 16.0, ''), ('Alh4zr3d', 15.0, 'https://www.youtube.com/channel/UCz-Z-d2VPQXHGkch0-_KovA'), ('ch3fez', 14.0, ''), ('mttaggart', 14.0, ''), ('Cyber_Insecurity', 12.0, 'https://www.youtube.com/channel/UCL4JGzitDkX5TOwzs9A02Kg'), ('blvkhakr', 11.0, ''), ('kegnsec', 11.0, ''), ('0xChance', 10.0, ''), ('B7H30', 10.0, ''), ('endingwithali', 10.0, ''), ('Thegwar', 9.0, ''), ('streambytes_', 8.0, ''), ('ChrisSean', 7.0, ''), ('dal3ksec', 7.0, ''), ('InfosecHouse', 7.0, ''), ('Libereau', 7.0, ''), ('d0nutptr', 6.0, 'https://www.youtube.com/d0nutptr'), ('LiveOverflow', 6.0, 'https://www.youtube.com/c/LiveOverflowCTF'), ('OffSecOfficial', 6.0, ''), ('TheHackerMaker', 6.0, ''), ('BanjoCrashland', 5.0, ''), ('ChadB_n00b', 5.0, ''), ('hackingesports', 5.0, ''), ('jrozner', 5.0, ''), ('NahamSec', 5.0, ''), ('SpiceySec', 5.0, ''), ('0reoByte', 4.0, ''), ('CyberTechVibes', 4.0, ''), ('Defcon201Live', 4.0, ''), ('footpics4sale', 4.0, ''), ('HackingEsports_eng', 4.0, ''), ('MVLWVR3', 4.0, ''), ('Ryskill', 4.0, ''), ('SawyerOne', 4.0, ''), ('securityfwd', 4.0, 'https://www.youtube.com/channel/UCgTNupxATBfWmfehv21ym-g'), ('sup3rhero1', 4.0, 'https://www.youtube.com/superhero1'), ('thecybermentor', 4.0, 'https://www.youtube.com/channel/UC0ArlFuFYMpEewyRBzdLHiw'), ('DEFCON_DCTV_Two', 4.0, ''), ('55keez', 3.0, ''), ('AlexChaveriat', 3.0, 'https://www.youtube.com/c/AlexChaveriat/videos'), ('cyber_v1s3rion', 3.0, ''), ('FroMastr', 3.0, ''), ('UnPentester', 3.0, ''), ('DEFCON_DCTV_Five', 3.0, ''), ('0xTib3rius', 2.0, ''), ('Alomancy', 2.0, 'https://www.youtube.com/channel/UCe2i94acge3Bv2Tmjla0h_g'), ('CyberWarriorStudios', 2.0, 'https://www.youtube.com/channel/UC1BeplJcC5YGHjcF8QyRD7g'), ('fearless0523', 2.0, ''), ('GrumpyHackers', 2.0, ''), ('mbcrump', 2.0, 'https://www.youtube.com/channel/UCCjHMUEzoCauYet8NG4sCog'), ('DEFCON_DCTV_Three', 2.0, ''), ('hackbacc', 1.0, ''), ('PwnSchool', 1.0, 'https://www.youtube.com/c/ThePwnSchoolProject'), ('xThe_Developer', 1.0, ''), ('redteamvillage', 1.0, ''), ('0xa_LilKelly', 0.0, ''), ('0xBufu', 0.0, ''), ('aHaquer', 0.0, ''), ('Ash_F0x', 0.0, ''), ('blindpentester', 0.0, ''), ('codingo_', 0, 'https://www.youtube.com/channel/UCUfO02gdMDXgOJWdv_jiLMg'), ('creminer', 0.0, ''), ('ctrlbyte', 0.0, ''), ('CybeardSec', 0.0, ''), ('cyberVNO', 0.0, ''), ('DasRealBert', 0.0, ''), ('dayzerosec', 0.0, 'https://www.youtube.com/channel/UCXFC76FDHZRVes6_lZqwLBA'), ('DCCyberSec', 0.0, 'https://www.youtube.com/channel/UC3sccPO4v8YqCTn8sezZGTw'), ('DevNullZen', 0.0, ''), ('dicecreation', 0.0, ''), ('digitenchou', 0.0, ''), ('dimineko', 0.0, ''), ('Djax120', 0.0, 'https://www.youtube.com/channel/UCJVQ4X0olUFq0nrxS8Xvijg'), ('dmll606', 0.0, ''), ('DOWRIGHT', 0.0, ''), ('EchoZach', 0.0, ''), ('esdn_tv', 0.0, ''), ('Flangvik', 0.0, ''), ('foxcap_', 0.0, ''), ('Goldwave__', 0.0, ''), ('hattondog', 0.0, ''), ('hey_its_LGG', 0.0, 'https://www.youtube.com/channel/UCFzslRuETaviEruPQ_HQP1A'), ('heyJ4X0N', 0.0, ''), ('infinitelogins', 0.0, 'https://www.youtube.com/channel/UC_nKukFaGysjMzqMVHEIgxQ'), ('InsiderPhD', 0.0, ''), ('JohnHammond010', 0.0, 'https://www.youtube.com/channel/UCVeW9qkBjo3zosnqUbG7CFw'), ('KOkencyber', 0.0, ''), ('lMinzarl', 0.0, ''), ('ltn_bob', 0.0, ''), ('MagneticPenguin', 0.0, ''), ('magnologanxp', 0.0, ''), ('maikroservice', 0.0, ''), ('majksec', 0.0, ''), ('mell0wx', 0.0, ''), ('MrCrumbs_', 0.0, ''), ('nidensec', 0.0, ''), ('Nirloy', 0.0, ''), ('OfficialWilliP', 0.0, 'https://www.youtube.com/channel/UCaOOGHgwrcyf527o838yLyg'), ('poocha_police', 0.0, ''), ('primalMK', 0.0, ''), ('pwncollege', 0.0, 'https://www.youtube.com/channel/UCBaWwFw7KmCN8YlfX4ERYKg'), ('quercusvirginiana', 0.0, ''), ('RedTeamMedic', 0.0, ''), ('s1zzurpmane', 0.0, ''), ('saucysec', 0, ''), ('Sharghaas', 0.0, ''), ('slyborgSinner', 0.0, ''), ('smash8tap', 0.0, ''), ('softexploit', 0.0, ''), ('Th3lazykid', 0.0, ''), ('TheMayor11', 0.0, 'https://www.youtube.com/channel/UC5J6JvH5F29FllbLjwmA5ZA'), ('VandalTheGrey', 0.0, ''), ('XeSquirmy', 0.0, ''), ('aerospacevillage', 0, ''), ('AIVillage', 0.0, ''), ('biohackingvillage', 0, ''), ('BlueTeamVillage', 0.0, ''), ('bypassvillage', 0, ''), ('careerhackingvillage', 0, ''), ('chv101', 0, ''), ('chvtrack001', 0, ''), ('chvtrack002', 0, ''), ('cpxsatamericas', 0, ''), ('cryptovillage', 0, ''), ('dchhv', 0, ''), ('dcpolicy', 0, ''), ('defcon_dctv_four', 0, ''), ('DEFCONorg', 0.0, ''), ('ethicsvillage', 0, ''), ('hackthesea', 0, ''), ('hamradiovillage', 0, ''), ('HamRadioVillage', 0, ''), ('ics_village', 0, ''), ('iotvillage', 0.0, ''), ('monerovillage', 0, ''), ('passwordvillage', 0, ''), ('paymentvillage', 0, ''), ('reconvillage', 0, ''), ('roguesvillage', 0, ''), ('toool_us', 0.0, ''), ('votingvillagedc', 0, ''), ('wallofsheep', 0, ''), ('2ocstream', 0.0, ''), ('hackergameshows', 0, ''), ('TheManyHatsClub', 0.0, ''), ('ZephrPhish', 0.0, '')]
activityData = list(
    sorted([(*querySullyGnomeActivityStats(*getScrapeData(username)), extraData)
            for username, extraData in getTwitchUsernames()
            ], key=lambda x: x[1], reverse=True))
for tuplet in activityData:
  if None in tuplet: activityData.remove(tuplet)
print(activityData)
sortedMd = ''
for username, _, extraData in activityData:
  sortedMd += createMarkdown(username, extraData)
sortedMd = "--: | ---: | --- | :---\n" + sortedMd.strip('\n')

with open('./index.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('--: | ---: | --- | :---', sortedMd)
with open('./index.md', 'w') as f:
  f.write(contents)
