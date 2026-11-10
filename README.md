# Dynamic Island

An Omarchy shell plugin that turns the display notch into a place for what is
going on right now. The island is a black shape hung from the top edge over
the notch, so it reads as one piece with the camera housing:

- **Idle** it sits inside the notch and draws nothing.
- **Compact**, while something is live, it widens and shows that activity on
  either side of the camera.
- **An event**, something that just happened, takes the compact island for a
  moment and then hands it back.
- **Expanded** it grows downward into a page of controls.

> **Needs a MacBook with a notch.** The island lives on the camera cutout of
> an Apple Silicon MacBook running Omarchy: the 14- and 16-inch MacBook Pro
> (2021 and later) and the 13- and 15-inch MacBook Air (M2 and later). On any
> other screen, including an external monitor plugged into one of those, it
> installs cleanly and shows nothing. There is no floating mode.

It tucks away under a fullscreen window or the screensaver. Scripts, hooks and
other plugins can put their own events and activities on it: see
[INTEGRATION.md](INTEGRATION.md).

## Requirements

- **A display with a notch.** The island appears on a screen whose panel is
  listed in `/usr/share/omarchy-platform/display-cutouts.json`, which is how
  Omarchy itself knows where the notch is. Today that is the MacBooks named
  above. To check yours:

  ```bash
  jq -r '.panels[] | "\(.width)x\(.height)"' /usr/share/omarchy-platform/display-cutouts.json
  hyprctl monitors -j | jq -r '.[] | "\(.name) \(.width)x\(.height)"'
  ```

  If your built-in display's size is not in the first list, the island will
  not appear.
- **Omarchy 4.5 or later**, with its Quickshell shell and Hyprland.
- **Nothing else to install.** The plugin uses `jq`, `inotifywait`
  (inotify-tools) and `setpriv` (util-linux), which Omarchy already has, and
  Omarchy's own commands: `omarchy-shell`, `omarchy-reminder`,
  `omarchy-capture-screenrecording` and `omarchy-notification-send`.
- **Optional:** [Superwhisper](https://superwhisper.com) for the dictation
  indicator, and a coding agent with hooks (Claude Code, Codex) for agent
  notices.

## Install

```bash
omarchy plugin add https://github.com/Sojournn/omarchy-dynamic-island.git --enable
omarchy restart shell
omarchy-shell island calibrate
```

The last command lines the island up with your notch (see
[Lining it up with the notch](#lining-it-up-with-the-notch)). Omarchy puts the
plugin in `~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/`.

Music, the timer, screen recording, reminders, battery, Bluetooth and
Superwhisper work from there. Two things need a step of their own, because
they live outside the plugin: [volume and brightness](#volume-and-brightness)
and [agents](#agents).

To update later:

```bash
omarchy plugin update io.github.sojournn.dynamic-island
omarchy restart shell
```

To remove it, see [Uninstall](#uninstall).

## Activities

Live for as long as they last, most important first:

| Activity | Compact | Expanded page |
|---|---|---|
| Dictation (Superwhisper) | a red microphone and moving bars while it listens; then, quietly, a small spinner while it transcribes and a small check as it leaves | none |
| Screen recording | a beating red dot and the elapsed time | start a region or display recording, with or without sound; Stop |
| Agents | a red, beating robot and "Input", while an agent is waiting on you | each agent that is waiting or recently finished; click one to go to its terminal, or Clear |
| Other programs' activities | their icon, in a ring when they report a progress, and that progress, their text, or the time they have run | each one with its progress; click one to go to its window |
| Timer | a ring that empties and the time left | set and start a timer; pause, +1m, cancel; "Time's up" when it ends |
| Reminders | a bell and the time left, once the next reminder is within ten minutes | the next three Omarchy reminders; add one, clear them |
| Music (MPRIS) | cover and an equalizer; the title and artist peek out when the track changes | cover, title, artist, a seekable progress line, previous / play-pause / next |

The compact island keeps showing what it is showing. Something that goes live
takes it over only if it matters at least as much: a timer starting takes the
island from music, but music starting does not take it from a recording.
Scroll on the compact island to pick another.

## Events

Shown for a few seconds, one at a time:

| Event | Looks like |
|---|---|
| Volume, brightness, keyboard backlight | the glyph, the level, and a bar |
| Charger in, charger out, charge complete | "Charging 54%", "On battery 54%", "Charged 100%" |
| Bluetooth device connects or disconnects | its name, and its battery level when it reports one |
| A reminder goes off | its message and "Now" |
| An agent finishes or needs input | "Claude", "Finished" or "Needs input". A finished agent is only ever this: a few seconds, then the island goes back to what was live |
| Another program's notice | whatever icon, title and text it sent |

`omarchy-shell island demo <name>` previews one: `volume`, `brightness`,
`plugged`, `unplugged`, `charged`, `bluetooth`, `disconnected`, `reminder`,
`agent`, `agentdone`, `dictation`, `notify`, `activity`.

## Using it

- Rest the pointer on the notch, or click the compact island, to open it. Move
  away to close it.
- The tabs either side of the notch switch pages; a dot marks a live activity.
- Scroll on the open island to change page, or on the compact island to change
  which live activity it shows.

## Commands

```bash
omarchy-shell island toggle                 # open or close, staying open until toggled again
omarchy-shell island show timer             # open on a page: media, timer, recording, reminders, agents, activities
omarchy-shell island collapse

omarchy-shell island timer 25m              # 25 (minutes), 90s, 1h30m, 5:00
omarchy-shell island timerLabeled 4m Tea
omarchy-shell island timerAdd 1m            # or -30s
omarchy-shell island timerToggle            # pause / resume
omarchy-shell island timerCancel

omarchy-shell island agentsClear
omarchy-shell island activitiesClear
omarchy-shell island status                 # JSON
omarchy-shell island demo volume
omarchy-shell island calibrate
```

A keybinding (pick a free key), in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + CTRL + I", "Dynamic Island", "omarchy-shell island toggle")
```

`bin/island` is the command for showing things on the island from a script;
[INTEGRATION.md](INTEGRATION.md) covers it.

## Setting up what lives outside the plugin

### Volume and brightness

Omarchy's volume and brightness keys summon its on-screen display,
`omarchy.osd`. To have the island answer them instead, clone that plugin and
make the clone ask the island first.

1. `omarchy plugin clone omarchy.osd`. This makes
   `~/.config/omarchy/plugins/<you>.osd/` and switches Omarchy over to it.
2. In that folder's `Osd.qml`, find `function open(payloadJson) {` and put this
   in front of it, then add the `if` as the first thing inside it:

   ```qml
   function takenByIsland(payloadJson) {
     var answer = IpcRegistry.call("island", "osd", [String(payloadJson || "{}")])
     return answer.ran === true && answer.output === "shown"
   }

   function open(payloadJson) {
     if (takenByIsland(payloadJson)) {
       hideTimer.stop()
       opened = false
       return
     }
     // ... the rest of open() as it was
   ```
3. `omarchy restart shell`

The island takes a level, or a message of up to 28 characters, whose icon it
has a glyph for. Everything else still gets the usual card at the bottom of
the screen: another monitor having the focus, a fullscreen window, the island
open on a page, a longer message, or the island being switched off or
uninstalled.

A clone does not follow later changes to Omarchy's own display. To go back to
the stock one: `omarchy plugin disable <you>.osd`.

### Agents

Agents say for themselves when they finish or need input, by running
`bin/island agent <name> <input|done|working|end>` from their hooks. It works
out which terminal window the agent is in, and an agent whose window already
has the focus is not announced at all.

An agent that needs input holds the compact island until you focus its
terminal (or it gets going again). One that finished is announced for a few
seconds and then only listed on the agents page, for half an hour or until its
terminal is focused; Clear on that page, or `omarchy-shell island
agentsClear`, empties the list.

**Claude Code**, in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification":     [{ "hooks": [{ "type": "command", "async": true, "command": "~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island agent claude input" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "async": true, "command": "~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island agent claude done" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "async": true, "command": "~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island agent claude working" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "async": true, "command": "~/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island agent claude end" }] }]
  }
}
```

Merge these into any hooks already there. They apply to sessions started
afterwards.

**Codex**, at the top of `~/.codex/config.toml`, before any `[section]`, with
the path written out in full (Codex does not expand `~`):

```toml
notify = ["/home/you/.config/omarchy/plugins/io.github.sojournn.dynamic-island/bin/island", "agent", "codex", "notify"]
```

Codex reports a finished turn this way; it has no hook for needing input.

**Anything else**: run `island agent <name> done` (or `input`) from whatever
hook it offers. `bin/island-agent <name> <state>` is the same command under an
older name.

## Uninstall

The plugin itself changes two things on your machine: its own entry in
`~/.config/omarchy/shell.json`, and one small state file. Everything else was
added by hand from the setup section above, so removing it means taking those
back out first.

These steps are written to be handed to a coding agent as they stand. Each is
safe to run twice, a step for something you never set up does nothing, and the
last one checks the result.

1. **Agent hooks.** For Claude Code, this removes only the hooks that run the
   island's command, leaves every other hook and setting alone, and keeps the
   previous file as `settings.json.bak`:

   ```bash
   f=~/.claude/settings.json
   [ -f "$f" ] && cp -p "$f" "$f.bak" && jq 'if (.hooks|type)=="object" then .hooks |= with_entries(.value |= (map(.hooks |= map(select((.command // "") | test("dynamic-island/bin/island") | not))) | map(select((.hooks|length) > 0))) | select((.value|length) > 0)) | if (.hooks|length)==0 then del(.hooks) else . end else . end' "$f.bak" > "$f"
   ```

   For Codex, this removes the `notify` line that points at the island:

   ```bash
   [ -f ~/.codex/config.toml ] && sed -i '/dynamic-island\/bin\/island/d' ~/.codex/config.toml
   ```

   For any other agent, take the `island agent` command out of its hook.

2. **Volume and brightness.** If you cloned the on-screen display for the
   island, go back to Omarchy's own. `omarchy plugin list | grep osd` shows
   the clone's id; put it in place of `<you>.osd`:

   ```bash
   omarchy plugin disable <you>.osd
   omarchy plugin remove <you>.osd --yes
   ```

   Disabling the clone switches Omarchy's own display back on, and removing it
   moves the folder aside as a backup. This step is optional: a clone left in
   place draws every level itself once the island is gone.

3. **Anything of your own.** A keybinding that runs `omarchy-shell island …`
   in `~/.config/hypr/bindings.lua`, a link to `bin/island` on your `PATH`,
   and scripts that call it. Scripts keep working either way: `island` exits 1
   when there is no island.

4. **The plugin and its state.**

   ```bash
   omarchy plugin remove io.github.sojournn.dynamic-island --yes
   rm -rf ~/.local/state/omarchy-dynamic-island
   omarchy restart shell
   ```

5. **Check.** The first and third commands print nothing, and the second
   prints `Target not found.`:

   ```bash
   omarchy plugin list | grep -i 'dynamic-island'
   omarchy-shell island ping
   grep -rs 'dynamic-island' ~/.claude/settings.json ~/.codex/config.toml ~/.config/hypr ~/.config/omarchy/shell.json
   ```

To switch it off without removing it, `omarchy plugin disable
io.github.sojournn.dynamic-island`. Omarchy forgets a plugin's settings when
it is disabled, so note your `notchWidth` first.

## What it reads and runs

- **Music** comes from MPRIS over D-Bus. Titles and artists are drawn as plain
  text and bounded in length. The cover is loaded from the URL the player
  advertises, only if it is a local file or HTTPS; that is the one network
  request the plugin can cause, and `albumArt: false` turns it off.
- **Recording** is Omarchy's own `omarchy-capture-screenrecording`. The island
  watches its pid file to know when one is running and starts or stops it with
  that command.
- **The timer** is kept in `~/.local/state/omarchy-dynamic-island/timer.json`,
  so it survives a shell restart. A finished timer sends a notification through
  `omarchy-notification-send`; its label is passed as its own argument and can
  never be read as an option or as markup.
- **Reminders** are Omarchy's (`omarchy reminder`), which keeps each as a
  transient systemd timer. The island watches the directory systemd writes
  those into with `inotifywait`, and reads the list with
  `omarchy-reminder show --json` when one comes or goes.
- **Dictation** follows the status item Superwhisper keeps in the tray. The
  island asks the daemon nothing and never sees what was said.
- **Battery** is UPower and **Bluetooth** is BlueZ, both through Quickshell.
  What they were doing when the shell started is not announced.
- **Other programs** reach it over the shell's own socket, which only your
  user can open. What they send is checked, cut to length and drawn as plain
  text; none of it is run.

Nothing is run through a shell, and nothing downloaded is executed.

## Settings

Inline on the plugin's entry in `~/.config/omarchy/shell.json`:

```json
"plugins": [
  { "id": "io.github.sojournn.dynamic-island", "notchWidth": 178, "bluetooth": false, "reminderLead": 5 }
]
```

| Key | Default | |
|---|---|---|
| `notchWidth` | `0` | Notch width in logical px; `0` derives it from the notch height. |
| `notchHeight` | `0` | Notch height in logical px; `0` reads it from the platform. |
| `expandedWidth` | `420` | Width of the open island. |
| `expandOnHover` | `true` | Open when the pointer rests on the island. |
| `hoverDelay` | `90` | Milliseconds the pointer must rest before it opens. |
| `collapseDelay` | `320` | Milliseconds after the pointer leaves before it closes. |
| `hideInFullscreen` | `true` | Hide under a fullscreen window. |
| `mediaLinger` | `20` | Seconds a paused player stays in the compact island. |
| `peekOnTrackChange` | `true` | Show the title beside the notch when the track changes. |
| `albumArt` | `true` | Load the cover the player advertises. |
| `timerPresets` | `[1, 5, 10, 25]` | Minutes offered on the timer page (up to five). |
| `timerNotify` | `true` | Also send a desktop notification when a timer ends. |
| `osd` | `true` | Show volume and brightness in the island. |
| `battery` | `true` | Announce the charger and a finished charge. |
| `bluetooth` | `true` | Announce devices connecting and disconnecting. |
| `dictation` | `true` | Show Superwhisper recording and transcribing. |
| `reminders` | `true` | Show Omarchy reminders. |
| `reminderLead` | `10` | Minutes before a reminder that it joins the compact island; `0` for never. |
| `reminderPresets` | `[5, 15, 30, 60]` | Minutes offered on the reminders page (the first four). |
| `agents` | `true` | Show agents that finished or need input. |
| `integrations` | `true` | Let other programs show events and activities. |

### Lining it up with the notch

The platform knows how tall a notch is, not how wide, so the width starts as
an estimate. To set it:

```bash
omarchy-shell island calibrate
```

Two markers appear, one just outside each edge of where the island believes
the notch is. Scroll on the island until both sit flush against the camera
housing, then click it; the width is saved as `notchWidth`.

## Working on it

```bash
node --test tests/                                   # logic, text safety, the commands, the docs, catalog, manifest
omarchy plugin validate ~/.config/omarchy/plugins/io.github.sojournn.dynamic-island
omarchy restart shell                                # load edits
```

On Omarchy 4.5 saving a file re-creates the plugin but from the shell's cached
copy of its code, so an edit shows only after `omarchy restart shell`.

`IslandModel.js` holds every decision that does not need a compositor;
`sources/` the activities and what feeds the events; `views/` their compact
and expanded faces; `IslandWindow.qml` the shape and its motion; `bin/island`
what scripts and agents' hooks run.
