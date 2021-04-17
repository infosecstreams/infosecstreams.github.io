#!/usr/bin/env python

from python_twitch import *

"""
pip install twitch-python
wget https://raw.githubusercontent.com/infosecstreams/infosecstreams.github.io/main/index.md -O index.md
streamers=$(grep "^\`" index.md | sed 's/` |.*//g' | sed 's/`|.*//g' | sed 's/`//g' | awk NF)
python3 script.py $1 $2 $streamers
"""

API_KEY = sys.argv[1]
API_SECRET = sys.argv[2]
 
def main():
  global API_KEY
  global API_SECRET
  getOnlineStatus()


def getOnlineStatus():
  helix = twitch.Helix(API_KEY, API_SECRET)
  for user in sys.argv[3:]:
    if helix.user(user).is_live:
      print(f'🟢 {user} is live!', user)
    else:
      print(f'❌ {user} is offline', user)
    
 
if __name__ == '__main__':
  main()

