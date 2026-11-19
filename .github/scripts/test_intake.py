"""Offline tests for intake.py against a fake Twitch Helix server.

Run: python3 -m unittest discover -s .github/scripts -p 'test_*.py'
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import intake  # noqa: E402
import needs_full_regen  # noqa: E402

TOKEN = "fake-app-token"


class FakeHelix:
    """Serves /oauth2/token and /helix/{users,channels,streams,videos}."""

    def __init__(self, users, channels=None, streams=None, videos=None):
        self.users = users  # [{"id","login","display_name"}]
        self.channels, self.streams, self.videos = channels or {}, streams or {}, videos or {}
        self.requests = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def send_json(self, code, body):
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                form = urllib.parse.parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
                fake.requests.append(("POST", self.path, form))
                if form.get("client_secret") != ["secret"] or form.get("grant_type") != ["client_credentials"]:
                    return self.send_json(403, {"message": "invalid client secret"})
                self.send_json(200, {"access_token": TOKEN, "expires_in": 5000000, "token_type": "bearer"})

            def do_GET(self):
                u = urllib.parse.urlparse(self.path)
                q = urllib.parse.parse_qs(u.query)
                fake.requests.append(("GET", u.path, q))
                if self.headers.get("Authorization") != f"Bearer {TOKEN}" or self.headers.get("Client-Id") != "cid":
                    return self.send_json(401, {"message": "unauthorized"})
                if u.path == "/helix/users":
                    if len(q.get("login", [])) + len(q.get("id", [])) > 100:
                        return self.send_json(400, {"message": "too many"})
                    logins = {l.lower() for l in q.get("login", [])}
                    ids = set(q.get("id", []))
                    data = [x for x in fake.users if x["login"] in logins or x["id"] in ids]
                elif u.path == "/helix/channels":
                    data = fake.channels.get(q["broadcaster_id"][0], [])
                elif u.path == "/helix/streams":
                    data = fake.streams.get(q["user_id"][0], [])
                elif u.path == "/helix/videos":
                    data = fake.videos.get(q["user_id"][0], [])
                else:
                    return self.send_json(404, {})
                self.send_json(200, {"data": data})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *a):
        self.server.shutdown()
        self.server.server_close()

    def helix(self, secret="secret"):
        return intake.Helix("cid", secret, api=f"{self.base}/helix", auth=f"{self.base}/oauth2/token")

    def user_lookups(self):
        return [r for r in self.requests if r[1] == "/helix/users"]


def user(uid, login, display=None):
    return {"id": uid, "login": login.lower(), "display_name": display or login}


def form(login="newbie", youtube="", languages="English", what="CTFs", confirm=True):
    return (
        f"### Twitch login or channel URL\n\n{login or '_No response_'}\n\n"
        f"### YouTube channel URL\n\n{youtube or '_No response_'}\n\n"
        f"### Main languages\n\n{languages or '_No response_'}\n\n"
        f"### What do they stream?\n\n{what or '_No response_'}\n\n"
        f"### Infosec content\n\n- [{'X' if confirm else ' '}] They stream infosec content\n"
    )


class Repo:
    """A temp copy of a tiny site checkout; chdir into it."""

    INDEX = (
        "# InfoSec Streams\n\n"
        "&nbsp; | <i class=\"fas fa-headset\"></i> | x | y\n"
        "---: | --- | :--- | :---\n"
        + intake.index_row("Alpha", "https://www.youtube.com/@alpha") + "\n"
        + "&nbsp; | `zeta_z` | [<i class=\"fab fa-twitch\" style=\"color:#9146FF\"></i>](https://www.twitch.tv/zeta_z) &nbsp;"
        "\n\n### Credits\n\nthanks\n"
    )
    INACTIVE = "## Inactive\n\n--: | ---\n`OldTimer` | [<i class=\"fab fa-twitch\"></i>](https://www.twitch.tv/OldTimer) &nbsp;\n\n### Credits\n"

    def __init__(self, active="Alpha,https://www.youtube.com/@alpha\nzeta_z,", inactive="OldTimer,"):
        self.dir = tempfile.mkdtemp()
        self.files = {"streamers.csv": active, "inactive_streamers.csv": inactive,
                      "index.md": self.INDEX, "inactive.md": self.INACTIVE}

    def __enter__(self):
        for name, content in self.files.items():
            with open(os.path.join(self.dir, name), "w", encoding="utf-8", newline="") as f:
                f.write(content)
        self.cwd = os.getcwd()
        os.chdir(self.dir)
        return self

    def __exit__(self, *a):
        os.chdir(self.cwd)
        shutil.rmtree(self.dir)

    def read(self, name):
        with open(name, encoding="utf-8", newline="") as f:
            return f.read()


ROSTER_USERS = [user("1", "alpha", "Alpha"), user("26", "zeta_z"), user("9", "oldtimer", "OldTimer")]


class NormaliseTest(unittest.TestCase):
    def test_login_forms(self):
        for raw in ["Foo_Bar", " foo_bar ", "@Foo_Bar", "twitch.tv/Foo_Bar", "https://www.twitch.tv/Foo_Bar",
                    "http://m.twitch.tv/Foo_Bar/videos?filter=archives", "<https://twitch.tv/Foo_Bar>",
                    "https://www.twitch.tv/Foo_Bar#x"]:
            login, err = intake.normalise_login(raw)
            self.assertIsNone(err, raw)
            self.assertEqual(login.lower(), "foo_bar", raw)

    def test_login_rejects(self):
        for raw in ["", "   ", "a" * 26, "foo bar", "foo;rm -rf /", "$(id)", "foo`id`", "evil.com/foo",
                    "https://youtube.com/foo", "twitch.tv/", "föö", "foo\nbar", "${{ github.token }}"]:
            login, err = intake.normalise_login(raw)
            self.assertIsNone(login, raw)
            self.assertTrue(err, raw)

    def test_youtube_accepts(self):
        cases = {
            "": "",
            "https://www.youtube.com/@Hackavis": "https://www.youtube.com/@Hackavis",
            "youtube.com/@hack.er-1/videos": "https://www.youtube.com/@hack.er-1",
            "http://m.youtube.com/@x_y_z?si=abc": "https://www.youtube.com/@x_y_z",
            "https://www.youtube.com/channel/UCkFKiCm7dD0gsB4jqIdCuRQ/": "https://www.youtube.com/channel/UCkFKiCm7dD0gsB4jqIdCuRQ",
            "https://www.youtube.com/c/BDSPodcast": "https://www.youtube.com/c/BDSPodcast",
            "https://www.youtube.com/user/someone/featured": "https://www.youtube.com/user/someone",
            "https://www.youtube.com/chiefgyk3d": "https://www.youtube.com/chiefgyk3d",
        }
        for raw, want in cases.items():
            self.assertEqual(intake.normalise_youtube(raw), (want, None), raw)

    def test_youtube_rejects(self):
        for raw in ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "https://www.youtube.com/shorts/abc", "https://www.youtube.com/", "https://www.youtube.com/channel/",
                    "https://www.youtube.com/channel/UCshort", "https://evil.com/@x", "https://youtube.com.evil.com/@x",
                    "https://www.youtube.com/@x),[y](https://evil", "https://www.youtube.com/@a,b",
                    "https://www.youtube.com/@a b", "javascript:alert(1)", "https://www.youtube.com/@a|b"]:
            url, err = intake.normalise_youtube(raw)
            self.assertIsNone(url, raw)
            self.assertTrue(err, raw)

    def test_parse_form_first_heading_wins(self):
        body = form(login="good_one", what="nice\n### Twitch login or channel URL\n\nevil_one")
        self.assertEqual(intake.parse_form(body)["Twitch login or channel URL"], "good_one")
        self.assertEqual(intake.parse_form(form(youtube=""))["YouTube channel URL"], "")
        self.assertEqual(intake.parse_form(body.replace("\n", "\r\n"))["Main languages"], "English")

    def test_md_escape(self):
        out = intake.md_escape("hi @everyone see #1 [x](https://e) <img src=x> `c` " + "a" * 300)
        for bad in ["@everyone", "#1", "[x](", "<img", "`c`"]:
            self.assertNotIn(bad, out)
        self.assertLessEqual(len(out), 260)
        self.assertNotIn("\n", intake.md_escape("a\nb"))

    def test_md_date(self):
        self.assertEqual(intake.md_date("2026-11-19T20:12:00Z"), "2026-11-19 20:12")
        self.assertEqual(intake.md_date("[click](x)"), "unknown")


class HelixTest(unittest.TestCase):
    def test_batches_of_100_and_token_reuse(self):
        users = [user(str(i), f"user{i}") for i in range(250)]
        with FakeHelix(users) as fake:
            h = fake.helix()
            found = h.users_by_login([f"User{i}" for i in range(250)] + ["bad login!"])
            self.assertEqual(len(found), 250)
            self.assertEqual([len(r[2]["login"]) for r in fake.user_lookups()], [100, 100, 50])
            self.assertEqual(len([r for r in fake.requests if r[0] == "POST"]), 1)
            self.assertEqual(set(h.users_by_id(["3", "nope"])), {"3"})

    def test_bad_secret_is_error_without_leaking(self):
        with FakeHelix([]) as fake:
            with self.assertRaises(intake.IntakeError) as ctx:
                fake.helix(secret="wrong-secret-value").users_by_login(["x"])
            self.assertIn("403", str(ctx.exception))
            self.assertNotIn("wrong-secret-value", str(ctx.exception))

    def test_missing_secrets(self):
        with self.assertRaises(intake.IntakeError):
            intake.Helix("", "")

    def test_unreachable(self):
        h = intake.Helix("cid", "secret", api="http://127.0.0.1:9/helix", auth="http://127.0.0.1:9/token", timeout=2)
        with self.assertRaises(intake.IntakeError):
            h.users_by_login(["x"])


class IdCacheTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "sub", "ids.json")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_resolves_once_then_reuses(self):
        with FakeHelix(ROSTER_USERS) as fake:
            c = intake.IdCache(self.path, now=1000)
            c.refresh(fake.helix(), ["Alpha", "zeta_z", "gone"])
            c.save()
            self.assertEqual(c.id_for("ALPHA"), "1")
            self.assertIsNone(c.id_for("gone"))
            n = len(fake.user_lookups())
            c2 = intake.IdCache(self.path, now=2000)
            c2.refresh(fake.helix(), ["Alpha", "zeta_z"])
            self.assertEqual(len(fake.user_lookups()), n)  # all fresh, no calls
            self.assertEqual(c2.id_for("zeta_z"), "26")

    def test_keeps_id_after_rename_and_refreshes_stale(self):
        with FakeHelix([user("1", "alpha")]) as fake:
            c = intake.IdCache(self.path, now=0)
            c.refresh(fake.helix(), ["alpha"])
            c.save()
        with FakeHelix([user("1", "alpha_new")]) as fake:  # renamed
            c = intake.IdCache(self.path, now=intake.CACHE_TTL + 10)
            c.refresh(fake.helix(), ["alpha"])
            self.assertEqual(len(fake.user_lookups()), 1)  # stale -> re-queried
            self.assertEqual(c.id_for("alpha"), "1")       # but the old ID is kept

    def test_corrupt_or_old_cache_is_ignored(self):
        os.makedirs(os.path.dirname(self.path))
        for content in ["not json", json.dumps({"version": 0, "logins": {"a": {"id": "1"}}}),
                        json.dumps({"version": 1, "logins": {"a": {"id": "1; rm"}}}), "[]"]:
            with open(self.path, "w") as f:
                f.write(content)
            self.assertEqual(intake.IdCache(self.path).entries, {}, content)


class CheckTest(unittest.TestCase):
    def run_check(self, body, users, cache_path="", **fake_kw):
        with FakeHelix(users, **fake_kw) as fake:
            return intake.check(body, fake.helix(), intake.IdCache(cache_path))

    def test_valid_new_streamer(self):
        users = ROSTER_USERS + [user("77", "newbie", "NewBie")]
        with Repo():
            r = self.run_check(form(login="https://twitch.tv/newbie", youtube="youtube.com/@newbie"), users,
                               channels={"77": [{"game_name": "Science & Technology", "title": "pwn [x](y) @all"}]},
                               videos={"77": [{"created_at": "2026-11-18T19:00:00Z"}]})
        self.assertTrue(r["valid"], r["problems"])
        self.assertEqual((r["login"], r["user_id"], r["youtube"]), ("NewBie", "77", "https://www.youtube.com/@newbie"))
        self.assertEqual(r["notes"], [])
        c = intake.render_comment(r)
        self.assertTrue(c.startswith(intake.MARKER))
        self.assertIn("ID `77`", c)
        self.assertIn("2026-11-18 19:00", c)
        self.assertIn("approved", c)
        self.assertNotIn("[x](y)", c)
        self.assertNotIn("@all", c)

    def test_localised_display_name_falls_back_to_login(self):
        with Repo():
            r = self.run_check(form(), ROSTER_USERS + [user("77", "newbie", "新人")])
        self.assertEqual(r["login"], "newbie")

    def test_unknown_account(self):
        with Repo():
            r = self.run_check(form(login="ghost"), ROSTER_USERS)
        self.assertFalse(r["valid"])
        self.assertIn("no Twitch account", " ".join(r["problems"]))
        self.assertIn("edit the issue", intake.render_comment(r))

    def test_duplicate_by_login_active_and_inactive(self):
        with Repo():
            r = self.run_check(form(login="ALPHA"), ROSTER_USERS)
            self.assertIn("main list", " ".join(r["problems"]))
            r = self.run_check(form(login="twitch.tv/oldtimer"), ROSTER_USERS)
            self.assertIn("inactive list", " ".join(r["problems"]))
            r = self.run_check(form(login="oldtimer"), [])  # listed but gone from Twitch
            self.assertIn("inactive list", " ".join(r["problems"]))

    def test_duplicate_by_id_reports_rename(self):
        d = tempfile.mkdtemp()
        cache = os.path.join(d, "ids.json")
        try:
            with Repo():
                with FakeHelix(ROSTER_USERS) as fake:  # earlier run learns alpha = 1
                    c = intake.IdCache(cache)
                    c.refresh(fake.helix(), ["Alpha", "zeta_z", "OldTimer"])
                    c.save()
                renamed = [user("1", "alpha_reborn", "Alpha_Reborn"), user("26", "zeta_z"), user("9", "oldtimer")]
                r = self.run_check(form(login="alpha_reborn"), renamed, cache_path=cache)
        finally:
            shutil.rmtree(d)
        self.assertFalse(r["valid"])
        self.assertEqual(r["rename_from"], "Alpha")
        self.assertIn("old name `Alpha`", " ".join(r["problems"]))

    def test_name_reused_by_other_account_noted(self):
        d = tempfile.mkdtemp()
        cache = os.path.join(d, "ids.json")
        try:
            with Repo():
                with FakeHelix(ROSTER_USERS) as fake:
                    c = intake.IdCache(cache)
                    c.refresh(fake.helix(), ["Alpha"])
                    c.save()
                r = self.run_check(form(login="alpha"), [user("500", "alpha")], cache_path=cache)
        finally:
            shutil.rmtree(d)
        self.assertFalse(r["valid"])
        self.assertIn("now belongs to user 500", " ".join(r["notes"]))

    def test_bad_youtube_and_unticked_box(self):
        with Repo():
            r = self.run_check(form(youtube="https://youtu.be/abc", confirm=False),
                               ROSTER_USERS + [user("77", "newbie")])
        self.assertFalse(r["valid"])
        text = " ".join(r["problems"])
        self.assertIn("video link", text)
        self.assertIn("tick the box", text)

    def test_category_note_and_live(self):
        with Repo():
            r = self.run_check(form(), ROSTER_USERS + [user("77", "newbie")],
                               channels={"77": [{"game_name": "Fortnite", "title": "t"}]},
                               streams={"77": [{"game_name": "Fortnite", "started_at": "2026-11-19T20:00:00Z"}]})
        self.assertTrue(r["valid"])
        self.assertIn("Fortnite", " ".join(r["notes"]))
        self.assertIn("live right now", intake.render_comment(r))

    def test_empty_body(self):
        with Repo():
            r = self.run_check("", ROSTER_USERS)
        self.assertFalse(r["valid"])

    def test_outputs_are_validated(self):
        out = tempfile.NamedTemporaryFile(delete=False)
        out.close()
        try:
            os.environ["GITHUB_OUTPUT"] = out.name
            vals = intake.write_outputs({"valid": True, "login": "a\nevil=1", "user_id": "12",
                                         "youtube": "https://www.youtube.com/@x\nvalid=true"})
            self.assertEqual(vals["login"], "")
            self.assertEqual(vals["youtube"], "")
            with open(out.name) as f:
                lines = f.read().splitlines()
            self.assertEqual(len(lines), 4)
            self.assertIn("valid=true", lines)
        finally:
            del os.environ["GITHUB_OUTPUT"]
            os.unlink(out.name)


class ApplyTest(unittest.TestCase):
    def consistent(self):
        return needs_full_regen.csv_names("streamers.csv") == needs_full_regen.page_names(
            "index.md", intake.INDEX_SEPARATOR)

    def test_adds_sorted_without_trailing_newline(self):
        with Repo() as repo:
            self.assertTrue(self.consistent())
            intake.apply("MidName", "https://www.youtube.com/@mid")
            csv = repo.read("streamers.csv")
            self.assertEqual(csv, "Alpha,https://www.youtube.com/@alpha\nMidName,https://www.youtube.com/@mid\nzeta_z,")
            idx = repo.read("index.md")
            self.assertIn("&nbsp; [<i class=\"fab fa-youtube\" style=\"color:#C00\"></i>](https://www.youtube.com/@mid) |\n\n### Credits", idx)
            self.assertTrue(idx.endswith("thanks\n"))
            self.assertTrue(self.consistent())

    def test_keeps_trailing_newline_and_no_youtube(self):
        with Repo(active="b,\nc,\n") as repo:
            intake.apply("A_first", "")
            self.assertEqual(repo.read("streamers.csv"), "A_first,\nb,\nc,\n")
            self.assertIn(intake.index_row("A_first", ""), repo.read("index.md"))

    def test_underscore_sorts_like_existing_file(self):
        with Repo(active="Cyber_Insecurity,\nCyberTechVibes,") as repo:
            intake.apply("Cyber_A", "")
            self.assertEqual(repo.read("streamers.csv"), "Cyber_A,\nCyber_Insecurity,\nCyberTechVibes,")

    def test_refuses_duplicates_and_bad_values(self):
        with Repo():
            for login, yt in [("alpha", ""), ("OLDTIMER", ""), ("bad name", ""), ("ok", "https://www.youtube.com/@a,b"),
                              ("ok", "https://youtube.com/@a")]:
                with self.assertRaises(intake.IntakeError, msg=(login, yt)):
                    intake.apply(login, yt)

    def test_real_repo_files_stay_consistent(self):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        with Repo() as repo:
            for name in ["streamers.csv", "inactive_streamers.csv", "index.md", "inactive.md"]:
                shutil.copy(os.path.join(root, name), os.path.join(repo.dir, name))
            before = repo.read("streamers.csv")
            intake.apply("zz_intake_test", "https://www.youtube.com/@zzz")
            after = repo.read("streamers.csv")
            self.assertEqual(after.count("\n"), before.count("\n") + 1)
            self.assertEqual(before.endswith("\n"), after.endswith("\n"))
            names = [l.split(",")[0] for l in after.split("\n") if l]
            self.assertEqual(names, sorted(names, key=str.lower))
            with contextlib.redirect_stdout(io.StringIO()) as out:
                needs_full_regen.main()
            self.assertEqual(out.getvalue().strip(), "false")


class CliTest(unittest.TestCase):
    def test_check_end_to_end(self):
        with Repo() as repo, FakeHelix(ROSTER_USERS + [user("77", "newbie")]) as fake:
            body, comment, outputs = (os.path.join(repo.dir, n) for n in ("body.md", "comment.md", "out.txt"))
            with open(body, "w") as f:
                f.write(form())
            env = {"TW_CLIENT_ID": "cid", "TW_CLIENT_SECRET": "secret", "GITHUB_OUTPUT": outputs,
                   "HELIX_API": f"{fake.base}/helix", "HELIX_AUTH": f"{fake.base}/oauth2/token"}
            old = {k: os.environ.get(k) for k in env}
            os.environ.update(env)
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    rc = intake.main(["check", "--body-file", body, "--cache", os.path.join(repo.dir, "c", "ids.json"),
                                      "--comment-out", comment])
            finally:
                for k, v in old.items():
                    os.environ.pop(k) if v is None else os.environ.__setitem__(k, v)
            self.assertEqual(rc, 0)
            self.assertIn("valid=true\nlogin=newbie\nuser_id=77\nyoutube=\n", repo.read(outputs))
            self.assertIn("newbie", repo.read(comment))
            self.assertTrue(os.path.exists(os.path.join(repo.dir, "c", "ids.json")))

    def test_check_fails_loudly_on_bad_secret(self):
        with Repo() as repo:
            body = os.path.join(repo.dir, "body.md")
            with open(body, "w") as f:
                f.write(form())
            os.environ.pop("TW_CLIENT_ID", None)
            with contextlib.redirect_stderr(io.StringIO()) as err:
                rc = intake.main(["check", "--body-file", body, "--comment-out", os.path.join(repo.dir, "c.md")])
            self.assertEqual(rc, 1)
            self.assertIn("::error::", err.getvalue())


if __name__ == "__main__":
    unittest.main()
