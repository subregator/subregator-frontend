"""Check the shipped image without external providers or host source mounts."""

import json
import subprocess
import sys
import time
import uuid


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


image = sys.argv[1]
name = "subregator-frontend-smoke-" + uuid.uuid4().hex[:12]
volume = name + "-checks"
docker("volume", "create", volume)
try:
    docker(
        "run",
        "-d",
        "--name",
        name,
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--pids-limit=128",
        "--memory=256m",
        "--network=none",
        "-v",
        volume + ":/var/lib/subregator-checks",
        image,
    )
    for _ in range(60):
        state = json.loads(docker("inspect", name))[0]["State"]
        if not state["Running"]:
            raise AssertionError(docker("logs", name))
        if state["Health"]["Status"] == "healthy":
            break
        time.sleep(1)
    else:
        raise AssertionError("Container did not become healthy")
    probe = """
import os, sqlite3, urllib.error, urllib.request
assert os.getuid() == 65532
assert b"subregator" in urllib.request.urlopen("http://127.0.0.1:8080/").read()
for path in ("/serve.py", "/verification.py", "/var/checks.sqlite", "/.env"):
    try:
        urllib.request.urlopen("http://127.0.0.1:8080" + path)
    except urllib.error.HTTPError as error:
        assert error.code == 404
    else:
        raise AssertionError(path)
with sqlite3.connect("/var/lib/subregator-checks/checks.sqlite") as db:
    db.execute("CREATE TABLE smoke (value TEXT)")
    db.execute("INSERT INTO smoke VALUES ('retained')")
try:
    open("/app/unexpected", "w")
except OSError:
    pass
else:
    raise AssertionError("Application root is writable")
"""
    docker("exec", name, "python3", "-c", probe)
    docker("restart", name)
    retained = docker(
        "exec",
        name,
        "python3",
        "-c",
        'import sqlite3; print(sqlite3.connect("/var/lib/subregator-checks/checks.sqlite").execute("SELECT value FROM smoke").fetchone()[0])',
    )
    assert retained == "retained"
    print(
        "Container health, non-root read-only runtime, private paths and durable cache: passed"
    )
finally:
    subprocess.run(["docker", "rm", "-f", name], check=False, stdout=subprocess.DEVNULL)
    subprocess.run(
        ["docker", "volume", "rm", volume], check=False, stdout=subprocess.DEVNULL
    )
