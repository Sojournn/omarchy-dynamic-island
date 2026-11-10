import QtQuick
import Quickshell
import Quickshell.Io
import "../IslandModel.js" as Model

// Omarchy's reminders. `omarchy reminder` keeps each one as a transient
// systemd timer, so there is nothing to subscribe to; instead the directory
// systemd writes transient units into is watched, and a reminder timer
// appearing or going is the cue to ask `omarchy-reminder show --json` again.
Item {
  id: root

  property bool active: true
  // How long before a reminder is due it joins the compact island, in
  // minutes. 0 keeps reminders to their page until they go off.
  property int leadMinutes: 10

  // Pending reminders, soonest first: { unit, label, at }.
  property var items: []
  property double now: Date.now()

  readonly property var next: items.length > 0 ? items[0] : null
  readonly property double nextInMs: next ? Math.max(0, next.at - now) : 0
  readonly property bool live: active && next !== null && leadMinutes > 0 && next.at - now <= leadMinutes * 60000

  signal fired(string label)

  function tick() {
    now = Date.now()
  }

  // ------------------------------------------------------------- listing

  property bool again: false

  function refresh() {
    if (!active) return
    if (listProc.running) {
      again = true
      return
    }
    listProc.running = true
  }

  function apply(text) {
    var listed = Model.parseReminders(text)
    var time = Date.now()
    var gone = Model.remindersFired(items, listed, time)
    items = listed
    now = time
    for (var i = 0; i < gone.length; i++) fired(gone[i].label)
    if (next) {
      // Look again just after the next one is due, to see it go.
      dueTimer.interval = Math.max(500, Math.min(next.at - time + 1500, 2000000000))
      dueTimer.restart()
    } else {
      dueTimer.stop()
    }
  }

  onActiveChanged: {
    if (active) refresh()
    else items = []
  }

  Component.onCompleted: refresh()

  Process {
    id: listProc
    command: ["omarchy-reminder", "show", "--json"]
    stdout: StdioCollector {
      id: listOut
      waitForEnd: true
    }
    onExited: function(exitCode) {
      if (exitCode === 0) root.apply(listOut.text)
      if (root.again) {
        root.again = false
        Qt.callLater(root.refresh)
      }
    }
  }

  Timer {
    id: dueTimer
    onTriggered: root.refresh()
  }

  // The countdown moves by the second once a reminder is close, and only
  // every so often before that.
  Timer {
    interval: root.live ? 1000 : 20000
    repeat: true
    running: root.items.length > 0
    onTriggered: root.tick()
  }

  // ------------------------------------------------------------- watching

  readonly property string transientDir: (Quickshell.env("XDG_RUNTIME_DIR") || "/run/user/0") + "/systemd/transient"

  // setpriv ends the watcher with the shell: Quickshell does not take its
  // child processes with it when it is killed.
  Process {
    id: watcher
    running: root.active
    command: ["setpriv", "--pdeathsig", "TERM", "inotifywait", "-m", "-q",
      "-e", "create,delete,moved_to,moved_from", "--format", "%f", root.transientDir]
    stdout: SplitParser {
      onRead: function(name) {
        if (String(name).indexOf("omarchy-reminder-") === 0) settle.restart()
      }
    }
  }

  Timer {
    id: settle
    interval: 400
    onTriggered: root.refresh()
  }

  // Without the watcher (no inotify-tools, no transient directory yet) the
  // list is still read now and then, so it is late rather than wrong.
  Timer {
    interval: 45000
    repeat: true
    running: root.active && !watcher.running
    onTriggered: root.refresh()
  }

  Component.onDestruction: watcher.running = false

  // -------------------------------------------------------------- actions

  function add(minutes) {
    var value = Math.round(Number(minutes))
    if (!(value >= 1 && value <= 24 * 60)) return
    Quickshell.execDetached(["omarchy-reminder", String(value)])
    settle.restart()
  }

  function clear() {
    Quickshell.execDetached(["omarchy-reminder", "clear"])
    settle.restart()
  }

  // Omarchy's own flow, for a reminder with a message.
  function compose() {
    Quickshell.execDetached(["omarchy-reminder", "--interactive"])
  }
}
