#!/usr/bin/env python

import csv, json, re, requests

def getTwitchUsernames():
  """
  Returns: List of usernames.
  """
  with open('./streamers.csv', 'r') as f:
    return [(line.split(',')[0], line.split(',')[1]) for line in f.read().split('\n') if len(line) > 0]


def getScrapeData(username):
  head = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0'
  }
  r=requests.get(f'https://sullygnome.com/channel/{username}/14/activitystats', headers=head)
  a=r.text
  try:
    for line in a.split('\n'):
      if 'var PageInfo = ' in line:
        uid = json.loads(line[line.index(' = ') + 3:-1].rstrip(';'))['id']
        timecode = json.loads(line[line.index(' = ') + 3:-1].rstrip(';'))['timecode']
        break
  except Exception as e:
    print(line[line.index(' = ') + 3:-1])
    print(e)
  return uid,username,timecode


def querySullyGnomeActivityStats(uid, username, timecode):
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
  return total


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


def createMarkdown(username, extraData):
  md = ""
  exists = False
  with open("./index.md", 'r') as f:
    for line in f.readlines():
      if ' | `' + username.lower() in line.lower():
        exists = True
        md += createLine(username, extraData, line)

    if not exists:
      md += createLine(username, extraData, line)
  return md


#activityData=[('0xa_lilkelly', 0.0, ''), ('0xBufu', 0.0, ''), ('aywang', 0.0, ''), ('codingo_', 0.0, 'https://www.youtube.com/channel/UCUfO02gdMDXgOJWdv_jiLMg'), ('crumbswastaken', 0.0, ''), ('ctrlbyte', 0.0, ''), ('cybeardsec', 0.0, ''), ('CyberWarriorStudios', 0.0, 'https://www.youtube.com/channel/UC1BeplJcC5YGHjcF8QyRD7g'), ('data_disciple', 0.0, ''), ('dccybersec', 0.0, 'https://www.youtube.com/channel/UC3sccPO4v8YqCTn8sezZGTw'), ('djax', 0.0, 'https://www.youtube.com/channel/UCJVQ4X0olUFq0nrxS8Xvijg'), ('dmll606', 0.0, ''), ('dowright', 0.0, ''), ('echozach', 0.0, ''), ('fearless0523', 0.0, ''), ('foxcap_', 0.0, ''), ('hattondog', 0.0, ''), ('infinitelogins', 0.0, 'https://www.youtube.com/channel/UC_nKukFaGysjMzqMVHEIgxQ'), ('JohnHammond010', 0.0, 'https://www.youtube.com/channel/UCVeW9qkBjo3zosnqUbG7CFw'), ('jrozner', 0.0, ''), ('magneticpenguin', 0.0, ''), ('majksec', 0.0, ''), ('mell0wx', 0.0, ''), ('nidensec', 0.0, ''), ('officialwillip', 0.0, 'https://www.youtube.com/channel/UCaOOGHgwrcyf527o838yLyg'), ('saucysec', 0.0, ''), ('sawyerone', 0.0, ''), ('Th3lazykid', 0.0, ''), ('blindpentester', 1.0, ''), ('dayzerosec', 1.0, 'https://www.youtube.com/channel/UCXFC76FDHZRVes6_lZqwLBA'), ('desyncryan', 1.0, 'https://www.youtube.com/channel/UCQWQlNq07_Rumy2i69dpqBw'), ('footpics4sale', 1.0, ''), ('hey_its_lgg', 1.0, ''), ('lminzarl', 1.0, ''), ('ryskill', 1.0, ''), ('thecybermentor', 1.0, 'https://www.youtube.com/channel/UC0ArlFuFYMpEewyRBzdLHiw'), ('0reobyte', 2.0, ''), ('0xtib3rius', 2.0, ''), ('alexchaveriat', 2.0, 'https://www.youtube.com/c/AlexChaveriat/videos'), ('anyascii', 2.0, ''), ('cybervno', 2.0, ''), ('hackingesports_eng', 2.0, ''), ('kokencyber', 2.0, ''), ('ltn_bob', 2.0, ''), ('softexploit', 2.0, ''), ('55keez', 3.0, ''), ('alh4zr3d', 3.0, 'https://www.youtube.com/channel/UCz-Z-d2VPQXHGkch0-_KovA'), ('ash_f0x', 3.0, ''), ('biueaider', 3.0, ''), ('chrissean', 3.0, ''), ('cyber_v1s3rion', 3.0, ''), ('digitenchou', 3.0, ''), ('hackingesports', 3.0, ''), ('nahamsec', 3.0, ''), ('securityfwd', 3.0, 'https://www.youtube.com/channel/UCgTNupxATBfWmfehv21ym-g'), ('sharghaas', 3.0, ''), ('slyborgsinner', 3.0, ''), ('sup3rhero1', 3.0, ''), ('dal3ksec', 4.0, ''), ('smash8tap', 4.0, ''), ('thegwar', 4.0, ''), ('themayor11', 4.0, 'https://www.youtube.com/channel/UC5J6JvH5F29FllbLjwmA5ZA'), ('xthe_developer', 4.0, ''), ('mbcrump', 5.0, 'https://www.youtube.com/channel/UCCjHMUEzoCauYet8NG4sCog'), ('xangrychairx', 5.0, 'https://www.youtube.com/channel/UCS1KHdnVAV1-Qx0jquAiBLA'), ('stellargb', 6.0, ''), ('goproslowyo', 7.0, ''), ('mttaggart', 7.0, ''), ('xesquirmy', 7.0, ''), ('alomancy', 8.0, 'https://www.youtube.com/channel/UCe2i94acge3Bv2Tmjla0h_g'), ('endingwithali', 8.0, ''), ('dasrealbert', 9.0, ''), ('chadb_n00b', 12.0, ''), ('cyber_insecurity', 17.0, 'https://www.youtube.com/channel/UCL4JGzitDkX5TOwzs9A02Kg')]
activityData = list(sorted([(username, querySullyGnomeActivityStats(*getScrapeData(username)),extraData) for username,extraData in getTwitchUsernames()], key=lambda x: x[1], reverse=True))
sortedMd = ''
for username, _, extraData in activityData:
  sortedMd += createMarkdown(username, extraData)
sortedMd = "--: | ---: | --- | :---\n" + sortedMd.strip('\n')

with open('./index.tmpl.md', 'r') as f:
  contents = f.read()
  contents = contents.replace('--: | ---: | --- | :---', sortedMd)
with open('./index.md', 'w') as f:
  f.write(contents)
