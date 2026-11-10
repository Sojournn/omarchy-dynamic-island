# Integrating with the Dynamic Island

How a script, a hook, an app or another shell plugin puts something on the
island. Everything here is interface version 1.

There are two things to send:

- An **event** is something that just happened: a build finished, a file
  arrived. It shows beside the notch for a few seconds and is gone. Send it
  with `notify`.
- An **activity** is something still going on: a build, a download, a deploy.
  It stays on the island, with a progress or a running clock, until you end
  it. Send it with `activity`.

If it would make sense as a desktop notification, it is an event. If a person
would ask "is it done yet?", it is an activity, and usually wants an event at
the end as well.

## From a script

`bin/island` in the plugin's folder does the talking. Call it by its path, or
put a link to it on your `PATH`:

```bash
island=~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island

$island notify "Build finished" "2m 14s" --icon check --tone accent
```

```bash
$island activity start backup "Backing up" --icon cloud --progress 0
$island activity update backup --progress 40 --text "photos"
$island activity end backup
$island notify "Backup complete" --icon success --tone accent
```

It exits 0 when the island took what you sent and 1 when it did not, so a
script can fall back to something else and works the same on a machine with no
island at all:

```bash
$island notify "Build finished" || omarchy-notification-send "Build finished"
```

### `island notify <title> [text]`

| Option | |
|---|---|
| `--icon NAME` | An icon by name (the list is below), or a single glyph of your own. A bell when left out. |
| `--tone TONE` | `accent`, `urgent` or `muted`. Plain when left out. |
| `--progress N` | A level from 0 to 100, drawn as a bar in place of the text. |
| `--duration MS` | How long it shows: 1500 to 10000, 4000 when left out. |
| `--id ID` | Events with the same id replace each other instead of queueing. |

The title sits left of the notch and the text right of it, each on one line:
keep the title to a few words and the text to one or two.

### `island activity start <id> <title> [text]`, `update <id>`, `end <id>`

The id is yours to choose and is how you refer to the activity afterwards:
letters, digits and `. _ : -`, up to 64 characters. Prefix it with your
program's name (`backup:photos`) so it cannot collide with someone else's.

| Option | |
|---|---|
| `--icon NAME` | As for `notify`. A pulse line when left out. |
| `--tone TONE` | As for `notify`. |
| `--progress N` | 0 to 100. Draws a ring round the icon and shows the percentage. |
| `--title TEXT`, `--text TEXT` | `update` only: change them. `--text ""` clears the text. |
| `--window auto` | Tie the activity to the terminal this runs in: clicking it on the island goes to that window, and closing the window ends it. An address (`0x55d0c0ffee00`) names another window. |
| `--ttl SECONDS` | Forget the activity if this long passes without an update: 5 to 86400, 600 when left out. |

Right of the notch the island shows, in this order of preference, the
progress, your text, or how long the activity has been running. So an activity
with neither a progress nor a text is a stopwatch, which is often all a long
command needs.

`start` on an id that is already running begins it again. `update` changes
only what you name. `update` and `end` on an id the island does not know exit
1 and create nothing.

**Always set things up so the activity ends.** `end` it on every way out of
your program, and choose a `--ttl` a little longer than the gap between your
updates. The ttl is the net for a program that was killed; without one a dead
activity sits on the island for ten minutes.

### The other commands

```bash
island ping       # exits 0 if an island is running
island icons      # the icon names, one per line
island status     # the island's state, as JSON
island --help
```

## Recipes

### Show any long command

```bash
#!/bin/bash
# island-run: show a command on the island while it runs.
#   island-run cargo build --release
island=~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island
id="run:$$"

$island activity start "$id" "${1##*/}" --icon terminal --window auto --ttl 86400
trap '$island activity end "$id"' EXIT

"$@"
status=$?

if ((status == 0)); then
  $island notify "${1##*/} finished" --icon success --tone accent
else
  $island notify "${1##*/} failed" "exit $status" --icon error --tone urgent
fi
exit $status
```

The `trap` ends the activity however the script leaves, and `--window auto`
ends it if the terminal is closed underneath it.

### Report a progress

```bash
total=${#files[@]}
$island activity start "upload:$$" "Uploading" --icon upload --progress 0 --ttl 120
trap '$island activity end "upload:$$"' EXIT

for i in "${!files[@]}"; do
  upload "${files[i]}"
  $island activity update "upload:$$" --progress $(((i + 1) * 100 / total))
done
```

An update is one short-lived process. A few a second is fine; one per byte is
not.

### From Python, or anything else

Run the command; no library is needed.

```python
import subprocess
from pathlib import Path

ISLAND = Path.home() / ".config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island"

def notify(title, text="", **options):
    args = [str(ISLAND), "notify", "--", title, text]
    for name, value in options.items():
        args[2:2] = [f"--{name}", str(value)]
    try:
        return subprocess.run(args, timeout=5).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False        # no island here

notify("Tests passed", "214 in 9s", icon="test", tone="accent")
```

The `--` keeps a title that starts with a dash from being read as an option.

### A coding agent

Agents have a command of their own, which finds the terminal the agent runs
in, so that focusing it clears a waiting agent and an agent you are already
looking at is not announced:

```bash
island agent <name> <input|done|working|end>
```

| State | Means | The island |
|---|---|---|
| `input` | The agent is waiting on the user. | Announces it, then keeps a red robot beside the notch until the terminal is focused. |
| `done` | The agent finished its turn. | Announces it for a few seconds and lists it on the agents page. |
| `working` | The agent is busy again. | Clears anything it was showing for that agent. |
| `end` | The session is over. | The same. |

Run it from whatever hook the agent has. It prints nothing, returns at once
and exits 0 whatever becomes of the report, so it cannot hold an agent up or
leak into its transcript.
If the hook hands over JSON on stdin, `cwd` names the project, `message` the
reason, and `session_id` tells sessions apart. The README shows the hooks for
Claude Code and Codex.

## Without the command

`island` is a thin wrapper: it builds one JSON object and hands it to the
shell. Anything that can run a program can do the same.

```bash
omarchy-shell island notify '{"title":"Build finished","text":"2m 14s","icon":"check","tone":"accent"}'
omarchy-shell island activity '{"id":"backup","state":"start","title":"Backing up","progress":0}'
```

`omarchy-shell` prints the island's answer and exits 0 when the call ran. With
no island it prints `Target not found.` and exits 1; with an island too old to
know the method, `Function not found.` and 1.

### `notify`

| Field | Type | |
|---|---|---|
| `title` | string | Up to 48 characters. `title` or `text` is required. |
| `text` | string | Up to 40 characters. Not drawn when `progress` is given. |
| `icon` | string | A name from the list below, or one glyph. |
| `tone` | string | `accent`, `urgent`, `muted`. |
| `progress` | number | 0 to 100. |
| `duration` | number | Milliseconds, 1500 to 10000. |
| `id` | string | Letters, digits and `. _ : -`, up to 64. |

| Answer | |
|---|---|
| `shown` | On the island, or queued behind what is. |
| `declined` | No island is free to show it: it is open on a page, under a fullscreen window, or there is no screen with a notch. Say it some other way. |
| `off` | The user has turned integrations off. |
| `invalid: <why>` | The payload was not understood. |

### `activity`

| Field | Type | |
|---|---|---|
| `id` | string | Required. Letters, digits and `. _ : -`, up to 64. |
| `state` | string | `start` (the default), `update` or `end`. |
| `title` | string | Up to 40 characters. Required for `start`. |
| `text` | string | Up to 40 characters. |
| `icon`, `tone`, `progress` | | As for `notify`. `"progress": null` removes a progress. |
| `window` | string | A Hyprland window address, with or without `0x`. |
| `ttl` | number | Seconds, 5 to 86400. |

| Answer | |
|---|---|
| `ok` | Done. |
| `unknown` | `update` or `end` for an id that is not running. |
| `off` | The user has turned integrations off. |
| `invalid: <why>` | The payload was not understood. |

An activity is accepted whether or not the island can be seen at that moment;
it is there when the island comes back.

### `agent`

What `island agent` sends, for an agent that would rather not shell out twice:

```json
{"state": "input", "agent": "claude", "window": "0x55d0c0ffee00", "project": "api", "detail": "Needs permission to run tests", "session": "a1b2"}
```

`state` and `agent` are required; `agent` is lowercase letters, digits and
`. _ -`. Without a `window` the island cannot tell when the user has looked,
so a waiting agent stays until it reports `working` or `end`, or the user
clears it.

### `status`, `icons`, `ping`

`ping` answers `ok`. `icons` answers the icon names on one line. `status`
answers a JSON object; these fields are part of the interface:

```json
{
  "api": 1,
  "live": ["activities", "media"],
  "compact": "activities",
  "activities": [{"id": "backup", "title": "Backing up", "text": "photos", "progress": 40}],
  "agents": {"input": 0, "done": 1},
  "timer": {"status": "idle", "remainingMs": 0, "label": ""},
  "media": {"available": true, "player": "Spotify", "players": 1, "playing": true, "title": "…", "artist": "…"},
  "privacy": {"microphone": ["Firefox"], "camera": null}
}
```

`live` lists what is ongoing, most important first, and `compact` is the one
beside the notch. `privacy` names the programs using the microphone and the
camera, each `null` while nobody is; a program that gives no name is `""`.
Other fields are there for debugging and may change.

## From another shell plugin

A plugin runs in the same process as the island, so it can ask without
starting anything. `IpcRegistry` comes with `qs.Commons`:

```qml
import qs.Commons

function notifyIsland(title, text) {
  var answer = IpcRegistry.call("island", "notify", [JSON.stringify({ title: title, text: text, icon: "sparkles" })])
  return answer.ran === true && answer.output === "shown"
}
```

`answer.ran` is false when there is no island, or one without that method, so
a plugin that calls this keeps working where the island is not installed.
Every method above takes one argument, a JSON string, except `status`,
`icons` and `ping`, which take none.

### Standing in for the on-screen display

One more method exists for a plugin that draws levels itself. `osd` takes the
payload Omarchy's on-screen display is summoned with (`icon`, `message`,
`value`, `max`, `duration`) and answers `shown` when the island has drawn it
or `declined` when the caller should. The README's volume and brightness
section shows the dozen lines that make a clone of `omarchy.osd` ask first.

## What to expect

- **Where it shows.** Only on a screen with a notch, and not under a
  fullscreen window. An event sent then is `declined`; an activity waits.
- **What wins.** One event shows at a time and the rest queue, four deep; the
  volume keys jump the queue. Among ongoing things the island keeps showing
  what it is showing unless something at least as important starts: dictation,
  a recording, an agent waiting, then activities, then the timer, reminders
  and music. The user can scroll on the island to pick another.
- **How many.** Eight activities at once. A ninth pushes out the one heard
  from longest ago.
- **Text.** Everything is drawn as plain text on one line and cut to the
  lengths above. Markup is shown as written, never interpreted.
- **Nothing is run.** No field of any payload is executed, opened or fetched.
  The only thing a click can do is focus the window an activity named.
- **The user decides.** `"integrations": false` on the plugin's entry in
  `shell.json` turns `notify` and `activity` off; both then answer `off`.

## Icons

```
check success warning error info bell robot timer clock hourglass calendar
music download upload sync build test git github docker terminal code package
rocket bug cloud database server network wifi globe mail message phone camera
video microphone image file folder link search pencil trash printer lock key
user home star heart flag fire bolt sparkles pulse eye coffee gift cart money
truck map gamepad weather power battery bluetooth volume brightness play
pause stop record dots
```

A name the island does not know falls back to the default icon rather than
failing, so a newer name is safe to send to an older island. For anything not
on the list, pass the glyph itself: one character, such as a Nerd Font glyph
or an emoji.

## Versions

`status` reports `"api": 1`. That number goes up only if something on this
page changes meaning or goes away. Additions (a new field, a new icon, a new
answer for a new situation) do not change it, so treat an answer you do not
recognise as "not shown" and ignore fields you do not know.
