#!/usr/bin/env python3
"""Streamer intake: validate an "Add a streamer" issue form, and add the
streamer to the roster once a maintainer approves it.

    intake.py check  --body-file F --cache F --comment-out F [--ids F]
        Parse the issue body, validate the login against Twitch Helix and the
        roster (by user ID and by login), validate the YouTube URL and write a
        friendly Markdown comment. Writes valid/login/user_id/youtube to
        $GITHUB_OUTPUT. Exits 0 whether or not the submission is valid; a
        non-zero exit means the check itself broke (Twitch down, bad secrets).

    intake.py apply  --login L [--youtube URL] [--user-id N]
        Add the streamer to streamers.csv (sorted case-insensitively, file's
        trailing-newline state kept) and append the matching row to the
        index.md table, so needs_full_regen.py stays "false". With --user-id,
        also record login,id in streamer_ids.csv.

    intake.py seed  [--ids F] [--subscriptions]
        Resolve every listed login's Twitch user ID into streamer_ids.csv,
        keeping IDs already known (so renamed logins keep theirs) and
        reporting logins that no longer exist on Twitch.

Everything the issue author typed is untrusted: values only leave this script
after matching strict patterns, and free text is escaped before it is echoed
into Markdown. Stdlib only.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

LOGIN_RE = re.compile(r"^[A-Za-z0-9_]{1,25}$")
USER_ID_RE = re.compile(r"^[0-9]{1,20}$")

ACTIVE_CSV = "streamers.csv"
INACTIVE_CSV = "inactive_streamers.csv"
INDEX_MD = "index.md"
INDEX_SEPARATOR = "---: | --- | :--- | :---"

# Issue form labels, as rendered into "### <label>" headings in the body.
FIELD_LOGIN = "Twitch login or channel URL"
FIELD_YOUTUBE = "YouTube channel URL"
FIELD_LANGUAGES = "Main languages"
FIELD_DESCRIPTION = "What do they stream?"
FIELD_CONFIRM = "Infosec content"
NO_RESPONSE = "_No response_"

# Categories StreamStatus treats as infosec streams (VALID_GAMES).
INFOSEC_CATEGORIES = {
    "just chatting",
    "science & technology",
    "software and game development",
    "talk shows & podcasts",
}

CACHE_VERSION = 2
IDS_CSV = "streamer_ids.csv"  # committed login,user-id map for the roster


class IntakeError(Exception):
    """The check itself failed (not the submission)."""


# ---------------------------------------------------------------- parsing


def parse_form(body):
    """Return {heading: value} for an issue-form body. The first occurrence of
    a heading wins, so text typed into a later field can't override an
    earlier one."""
    fields, current, lines = {}, None, []

    def flush():
        if current is not None and current not in fields:
            value = "\n".join(lines).strip()
            fields[current] = "" if value == NO_RESPONSE else value

    for line in (body or "").replace("\r\n", "\n").split("\n"):
        if line.startswith("### "):
            flush()
            current, lines = line[4:].strip(), []
        elif current is not None:
            lines.append(line)
    flush()
    return fields


_TWITCH_URL_RE = re.compile(
    r"^(?:https?://)?(?:(?:www|m|go)\.)?twitch\.tv/([^/?#\s]+)", re.IGNORECASE
)


def normalise_login(raw):
    """Turn "twitch.tv/Foo", "https://www.twitch.tv/foo/videos", "@foo" or
    "foo" into a login. Returns (login, error)."""
    value = (raw or "").strip().strip("<>").strip()
    if not value:
        return None, "the Twitch login is empty"
    m = _TWITCH_URL_RE.match(value)
    if m:
        value = m.group(1)
    elif "/" in value or "." in value:
        return None, "that doesn't look like a Twitch login or a `twitch.tv/<login>` link"
    value = value.lstrip("@")
    if not LOGIN_RE.match(value):
        return None, "a Twitch login is 1-25 letters, digits or underscores"
    return value, None


_YT_PATH_RE = re.compile(
    r"^(?:@[A-Za-z0-9._-]{3,30}"
    r"|channel/UC[A-Za-z0-9_-]{22}"
    r"|(?:c|user)/[A-Za-z0-9._-]{1,100}"
    r"|[A-Za-z0-9._-]{1,100})$"
)
_YT_NOT_CHANNEL = {
    "watch", "shorts", "playlist", "results", "feed", "live", "embed",
    "redirect", "hashtag", "post", "account", "premium", "gaming",
}


def normalise_youtube(raw):
    """Return (url, error). Empty input is fine (the field is optional).
    The result is always https://www.youtube.com/<channel path>, with nothing
    in it that could break out of a CSV field or a Markdown link."""
    value = (raw or "").strip().strip("<>").strip()
    if not value:
        return "", None
    m = re.match(
        r"^(?:https?://)?(?:(?:www|m)\.)?youtube\.com/([^?#\s]*)(?:[?#]\S*)?$",
        value,
        re.IGNORECASE,
    )
    if not m:
        if re.match(r"^(?:https?://)?youtu\.be/", value, re.IGNORECASE):
            return None, "that's a video link; please give the channel's link instead"
        return None, "the YouTube link should look like `https://www.youtube.com/@handle`"
    parts = [p for p in m.group(1).split("/") if p]
    not_channel = "that's not a channel link; please give the channel's link (`https://www.youtube.com/@handle`)"
    if not parts:
        return None, not_channel
    if parts[0] in ("channel", "c", "user"):
        if len(parts) < 2:
            return None, not_channel
        path = f"{parts[0]}/{parts[1]}"
    elif parts[0].lower() in _YT_NOT_CHANNEL:
        return None, not_channel
    else:
        path = parts[0]  # drops channel tabs: /@foo/videos -> /@foo
    if not _YT_PATH_RE.match(path):
        return None, "the YouTube link should look like `https://www.youtube.com/@handle`"
    return "https://www.youtube.com/" + path, None


def md_escape(text, limit=200):
    """Make untrusted text inert in GitHub Markdown: no HTML, links, mentions,
    references or formatting, one line, bounded length."""
    text = " ".join(str(text or "").split())
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"([\\`*_{}\[\]()+!|~-])", r"\\\1", text)
    # Break @mentions and #123 references without changing how they read.
    return text.replace("@", "@​").replace("#", "#​")


# ---------------------------------------------------------------- roster


def read_roster_logins(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [l.split(",", 1)[0].strip() for l in f.read().split("\n") if l.strip()]


def roster():
    """[(login, 'active'|'inactive')] for every listed streamer."""
    return [(l, "active") for l in read_roster_logins(ACTIVE_CSV)] + [
        (l, "inactive") for l in read_roster_logins(INACTIVE_CSV)
    ]


# ---------------------------------------------------------------- helix


class Helix:
    """Tiny Twitch Helix client using an app access token."""

    def __init__(self, client_id, client_secret,
                 api="https://api.twitch.tv/helix",
                 auth="https://id.twitch.tv/oauth2/token",
                 timeout=20):
        if not client_id or not client_secret:
            raise IntakeError("TW_CLIENT_ID / TW_CLIENT_SECRET are not set")
        self.client_id, self.client_secret = client_id, client_secret
        self.api, self.auth, self.timeout = api.rstrip("/"), auth, timeout
        self.token = None

    def _request(self, req):
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            # Never echo the request (it may carry the secret); status only.
            raise IntakeError(f"Twitch returned HTTP {e.code} for {req.full_url.split('?')[0]}") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            raise IntakeError(f"could not reach Twitch: {type(e).__name__}") from None

    def login(self):
        data = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }).encode()
        body = self._request(urllib.request.Request(self.auth, data=data, method="POST"))
        token = body.get("access_token")
        if not token:
            raise IntakeError("Twitch did not return an app access token")
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::add-mask::{token}")
        self.token = token

    def get(self, path, params):
        if self.token is None:
            self.login()
        url = f"{self.api}/{path}?{urllib.parse.urlencode(params, doseq=True)}"
        req = urllib.request.Request(url, headers={
            "Client-Id": self.client_id,
            "Authorization": f"Bearer {self.token}",
        })
        return self._request(req).get("data") or []

    def get_all(self, path, params):
        """Follow Helix cursor pagination."""
        out, params = [], dict(params)
        while True:
            if self.token is None:
                self.login()
            url = f"{self.api}/{path}?{urllib.parse.urlencode(params, doseq=True)}"
            body = self._request(urllib.request.Request(url, headers={
                "Client-Id": self.client_id, "Authorization": f"Bearer {self.token}"}))
            out += body.get("data") or []
            cursor = (body.get("pagination") or {}).get("cursor")
            if not cursor or len(out) > 10000:
                return out
            params["after"] = cursor

    def users_by_login(self, logins):
        """{lowercase login: user} for the logins that exist, 100 per call."""
        found = {}
        logins = [l for l in logins if LOGIN_RE.match(l)]
        for i in range(0, len(logins), 100):
            for u in self.get("users", {"login": logins[i:i + 100]}):
                found[u["login"].lower()] = u
        return found

    def users_by_id(self, ids):
        found = {}
        ids = [i for i in ids if USER_ID_RE.match(i)]
        for i in range(0, len(ids), 100):
            for u in self.get("users", {"id": ids[i:i + 100]}):
                found[u["id"]] = u
        return found


# ---------------------------------------------------------------- id cache


def read_ids(path):
    """streamer_ids.csv -> {lowercase login: (Login, user id)}; bad lines skipped."""
    out = {}
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                login, _, uid = line.strip().partition(",")
                if LOGIN_RE.match(login) and USER_ID_RE.match(uid):
                    out[login.lower()] = (login, uid)
    return out


def write_ids(path, ids):
    rows = sorted(ids.values(), key=lambda r: r[0].lower())
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("".join(f"{login},{uid}\n" for login, uid in rows))


class IdCache:
    """Roster login -> Twitch user ID.

    Starts from the committed streamer_ids.csv (durable, reviewed) and a JSON
    cache kept between runs with actions/cache, then resolves only logins
    neither knows. Known IDs are never overwritten: Twitch IDs don't change,
    and an old login that no longer resolves (or that someone else has since
    taken) must keep pointing at the account that was listed. That is what
    lets a renamed streamer be recognised under their new name.
    """

    def __init__(self, path, seed_path=None):
        self.path = path
        self.entries = {}
        if path and os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("version") == CACHE_VERSION:
                    self.entries = {
                        k: str(v["id"]) for k, v in data.get("logins", {}).items()
                        if isinstance(v, dict) and LOGIN_RE.match(k) and USER_ID_RE.match(str(v.get("id", "")))
                    }
            except (OSError, ValueError, AttributeError, TypeError):
                self.entries = {}
        for key, (_, uid) in read_ids(seed_path).items():
            self.entries[key] = uid  # reviewed data wins

    def refresh(self, helix, logins):
        """Resolve logins we have no ID for, in batches of 100."""
        missing = list({l.lower(): l for l in logins if l.lower() not in self.entries}.values())
        if missing:
            for key, u in helix.users_by_login(missing).items():
                self.entries[key] = u["id"]

    def id_for(self, login):
        return self.entries.get(login.lower())

    def save(self):
        if not self.path:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"version": CACHE_VERSION,
                       "logins": {k: {"id": v} for k, v in self.entries.items()}}, f, sort_keys=True, indent=0)
        os.replace(tmp, self.path)


def seed(helix, path=None, subscriptions=False):
    """Bring streamer_ids.csv in line with the roster: keep known IDs, resolve
    new logins, drop logins no longer listed. Returns a report dict."""
    path = path or IDS_CSV
    known, listed = read_ids(path), {}
    for login, _ in roster():
        listed.setdefault(login.lower(), login)
    found = helix.users_by_login([l for k, l in listed.items() if k not in known])
    ids, unresolved = {}, []
    for key, login in listed.items():
        uid = known[key][1] if key in known else found.get(key, {}).get("id")
        if uid:
            ids[key] = (login, uid)
        else:
            unresolved.append(login)
    write_ids(path, ids)
    report = {"listed": len(listed), "known": len(ids), "new": sum(1 for k in ids if k not in known),
              "dropped": sorted(known[k][0] for k in known if k not in listed), "unresolved": unresolved}
    if subscriptions:
        # The bot's EventSub subscriptions are keyed by user ID and survive
        # renames, so IDs it still watches that match no listed login are
        # likely the renamed accounts behind the unresolved logins.
        watched = {s.get("condition", {}).get("broadcaster_user_id")
                   for s in helix.get_all("eventsub/subscriptions", {"first": 100})}
        orphans = sorted(watched - {uid for _, uid in ids.values()} - {None})
        now = helix.users_by_id(orphans)
        report["orphans"] = [(i, now[i]["login"] if i in now else None) for i in orphans]
    return report


# ---------------------------------------------------------------- check


def display_login(user):
    """The CSV uses the streamer's own capitalisation when Twitch has one."""
    name = user.get("display_name") or ""
    return name if name.lower() == user["login"].lower() and LOGIN_RE.match(name) else user["login"]


def channel_summary(helix, user_id):
    """Best-effort extra context; failures here never fail the check."""
    out = {}
    try:
        ch = helix.get("channels", {"broadcaster_id": user_id})
        if ch:
            out["category"] = ch[0].get("game_name") or ""
            out["title"] = ch[0].get("title") or ""
        live = helix.get("streams", {"user_id": user_id})
        if live:
            out["live_category"] = live[0].get("game_name") or ""
            out["live_since"] = live[0].get("started_at") or ""
        vods = helix.get("videos", {"user_id": user_id, "type": "archive", "first": 1})
        if vods:
            out["last_vod"] = vods[0].get("created_at") or ""
    except IntakeError:
        pass
    return out


def check(body, helix, cache):
    """Validate a submission. Returns a result dict; never raises for bad
    input, only for a broken check (IntakeError)."""
    fields = parse_form(body)
    problems, notes = [], []
    result = {"valid": False, "login": "", "user_id": "", "youtube": ""}

    login, err = normalise_login(fields.get(FIELD_LOGIN, ""))
    if err:
        problems.append(err)
    youtube, yerr = normalise_youtube(fields.get(FIELD_YOUTUBE, ""))
    if yerr:
        problems.append(yerr)
    if "[x]" not in fields.get(FIELD_CONFIRM, "").lower():
        problems.append("please tick the box confirming they stream infosec content")

    listed = roster()
    user = None
    if login:
        for name, where in listed:
            if name.lower() == login.lower():
                page = "the main list" if where == "active" else "the inactive list"
                problems.append(f"`{name}` is already on {page}")
        user = helix.users_by_login([login]).get(login.lower())
        if not user:
            problems.append(f"there's no Twitch account called `{login}` (check the spelling?)")

    if user:
        result["user_id"] = user["id"]
        result["display"] = display_login(user)
        cache.refresh(helix, [l for l, _ in listed])
        for name, where in listed:
            page = "the main list" if where == "active" else "the inactive list"
            if name.lower() == user["login"].lower():
                old_id = cache.id_for(name)
                if old_id and old_id != user["id"]:
                    notes.append(f"heads-up for maintainers: the listed `{name}` was Twitch user "
                                 f"{old_id}, but that name now belongs to user {user['id']}")
            elif cache.id_for(name) == user["id"]:
                problems.append(f"they're already on {page} under their old name `{name}` "
                                f"(same Twitch account, ID {user['id']}); a maintainer will update the name")
                result["rename_from"] = name
        result.update(channel_summary(helix, user["id"]))
        cat = result.get("live_category") or result.get("category") or ""
        if cat and cat.lower() not in INFOSEC_CATEGORIES:
            notes.append("their channel's category is "
                         f"*{md_escape(cat)}*; only streams in Science & Technology, Software and Game "
                         "Development, Talk Shows & Podcasts or Just Chatting show up as live on the site")

    result["problems"], result["notes"] = problems, notes
    result["languages"] = fields.get(FIELD_LANGUAGES, "")
    result["description"] = fields.get(FIELD_DESCRIPTION, "")
    if not problems:
        result.update(valid=True, login=result["display"], youtube=youtube)
    return result


MARKER = "<!-- streamer-intake -->"


def md_date(ts):
    """'2026-11-19T20:12:00Z' -> '2026-11-19 20:12'; anything else -> 'unknown'."""
    m = re.match(r"^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", ts or "")
    return f"{m.group(1)} {m.group(2)}" if m else "unknown"


def render_comment(r, gated=True):
    lines = [MARKER]
    if r["valid"]:
        name = r["login"]
        lines.append(f"Thanks for the suggestion! 🎉 I found **[{name}](https://www.twitch.tv/{name})** on Twitch "
                     f"(user ID `{r['user_id']}`) and they're not on the list yet.")
    else:
        lines.append("Thanks for the suggestion! I couldn't add this one yet:")
        lines.append("")
        lines += [f"- {p}" for p in r["problems"]]
        lines.append("")
        lines.append("You can **edit the issue** to fix it and I'll check again automatically.")
    facts = []
    if r.get("live_since"):
        facts.append(f"🟢 live right now in *{md_escape(r.get('live_category'))}* "
                     f"(since {md_date(r['live_since'])} UTC)")
    elif r.get("category"):
        facts.append(f"last streamed category: *{md_escape(r['category'])}*")
    if r.get("title"):
        facts.append(f"stream title: *{md_escape(r['title'])}*")
    if r.get("last_vod"):
        facts.append(f"most recent saved broadcast: {md_date(r['last_vod'])}")
    if r.get("youtube"):
        facts.append(f"YouTube: {r['youtube']}")
    if facts:
        lines.append("")
        lines += [f"- {f}" for f in facts]
    if r["notes"]:
        lines.append("")
        lines += [f"> **Note:** {n}" for n in r["notes"]]
    if r["valid"]:
        lines.append("")
        lines.append("A maintainer will take a look and add the `approved` label; I'll then open a pull request "
                     "that adds them, and this issue closes when it's merged." if gated else
                     "I'll open a pull request that adds them; this issue closes when it's merged.")
    return "\n".join(lines) + "\n"


def write_outputs(r):
    path = os.environ.get("GITHUB_OUTPUT")
    values = {
        "valid": "true" if r["valid"] else "false",
        "login": r["login"] if LOGIN_RE.match(r.get("login") or "") else "",
        "user_id": r["user_id"] if USER_ID_RE.match(r.get("user_id") or "") else "",
        "youtube": r["youtube"] if r.get("youtube") and normalise_youtube(r["youtube"]) == (r["youtube"], None) else "",
    }
    if path:
        with open(path, "a", encoding="utf-8") as f:
            for k, v in values.items():
                f.write(f"{k}={v}\n")
    return values


# ---------------------------------------------------------------- apply


def index_row(login, youtube):
    tw = f'[<i class="fab fa-twitch" style="color:#9146FF"></i>](https://www.twitch.tv/{login})'
    if youtube:
        yt = f'[<i class="fab fa-youtube" style="color:#C00"></i>]({youtube})'
        return f"&nbsp; | `{login}` | {tw} &nbsp; {yt} |"
    return f"&nbsp; | `{login}` | {tw} &nbsp; |"


def apply(login, youtube, user_id="", root="."):
    if not LOGIN_RE.match(login or ""):
        raise IntakeError("refusing to add an invalid login")
    if user_id and not USER_ID_RE.match(user_id):
        raise IntakeError("refusing to add an invalid user ID")
    if youtube and normalise_youtube(youtube) != (youtube, None):
        raise IntakeError("refusing to add an unnormalised YouTube URL")
    csv_path = os.path.join(root, ACTIVE_CSV)
    inactive = os.path.join(root, INACTIVE_CSV)
    index_path = os.path.join(root, INDEX_MD)

    existing = {l.lower() for l in read_roster_logins(csv_path) + read_roster_logins(inactive)}
    if login.lower() in existing:
        raise IntakeError(f"{login} is already listed")

    with open(csv_path, encoding="utf-8", newline="") as f:
        raw = f.read()
    trailing = raw.endswith("\n")
    lines = [l for l in raw.split("\n") if l.strip()]
    lines.append(f"{login},{youtube}")
    lines.sort(key=lambda l: l.split(",", 1)[0].lower())
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(lines) + ("\n" if trailing else ""))

    with open(index_path, encoding="utf-8", newline="") as f:
        page = f.read().split("\n")
    try:
        start = page.index(INDEX_SEPARATOR)
    except ValueError:
        raise IntakeError("index.md has no streamer table") from None
    end = start + 1
    while end < len(page) and page[end].strip() and not page[end].startswith("### "):
        end += 1
    # New streamers have no 30-day hours yet, so they go to the bottom; the
    # daily secinfo run re-sorts them.
    page.insert(end, index_row(login, youtube))
    with open(index_path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(page))

    if user_id:
        ids_path = os.path.join(root, IDS_CSV)
        ids = read_ids(ids_path)
        ids[login.lower()] = (login, user_id)
        write_ids(ids_path, ids)


# ---------------------------------------------------------------- cli


def helix_from_env():
    return Helix(os.environ.get("TW_CLIENT_ID", ""), os.environ.get("TW_CLIENT_SECRET", ""),
                 api=os.environ.get("HELIX_API", "https://api.twitch.tv/helix"),
                 auth=os.environ.get("HELIX_AUTH", "https://id.twitch.tv/oauth2/token"))


def write_github_summary(r):
    """Seed report for the Actions run page and the PR body."""
    lines = [f"{r['known']} of {r['listed']} listed logins have a Twitch user ID ({r['new']} new this run)."]
    if r["dropped"]:
        lines += ["", "No longer listed, dropped from the map: " + ", ".join(f"`{l}`" for l in r["dropped"])]
    if r["unresolved"]:
        lines += ["", "**No Twitch account found** (renamed or deleted; fix these in the roster by hand):", ""]
        lines += [f"- `{l}`" for l in r["unresolved"]]
    if r.get("orphans"):
        lines += ["", "**IDs the bot still watches that match no listed login** (likely the renamed accounts above):", ""]
        lines += [f"- `{i}`: now " + (f"[`{n}`](https://www.twitch.tv/{n})" if n else "deleted")
                  for i, n in r["orphans"]]
    text = "\n".join(lines) + "\n"
    for var in ("GITHUB_STEP_SUMMARY", "SEED_REPORT"):
        if os.environ.get(var):
            with open(os.environ[var], "a", encoding="utf-8") as f:
                f.write(text)
    return text


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--body-file", required=True)
    c.add_argument("--cache", default="")
    c.add_argument("--comment-out", required=True)
    c.add_argument("--ids", default=IDS_CSV)
    c.add_argument("--ungated", action="store_true")
    a = sub.add_parser("apply")
    a.add_argument("--login", required=True)
    a.add_argument("--youtube", default="")
    a.add_argument("--user-id", default="")
    sd = sub.add_parser("seed", help=f"resolve the roster's Twitch IDs into {IDS_CSV}")
    sd.add_argument("--ids", default=IDS_CSV)
    sd.add_argument("--subscriptions", action="store_true",
                   help="also list EventSub-watched IDs that match no listed login (needs the bot's app credentials)")
    args = p.parse_args(argv)

    try:
        if args.cmd == "check":
            with open(args.body_file, encoding="utf-8") as f:
                body = f.read()
            helix = helix_from_env()
            cache = IdCache(args.cache, seed_path=args.ids)
            r = check(body, helix, cache)
            cache.save()
            with open(args.comment_out, "w", encoding="utf-8") as f:
                f.write(render_comment(r, gated=not args.ungated))
            out = write_outputs(r)
            print(f"valid={out['valid']} login={out['login']} user_id={out['user_id']}")
        elif args.cmd == "seed":
            r = seed(helix_from_env(), args.ids, subscriptions=args.subscriptions)
            print(f"{r['known']}/{r['listed']} listed logins have a Twitch ID ({r['new']} new)")
            for login in r["dropped"]:
                print(f"dropped (no longer listed): {login}")
            for login in r["unresolved"]:
                print(f"no Twitch account (renamed or deleted?): {login}")
            for uid, now in r.get("orphans", []):
                print(f"watched by the bot but not matched to a listed login: {uid} (now {now or 'deleted'})")
            write_github_summary(r)
        else:
            apply(args.login, args.youtube, args.user_id)
            print(f"added {args.login}")
    except IntakeError as e:
        print(f"::error::{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
