import QtQuick
import Quickshell
import Quickshell.Io
import "../IslandModel.js" as Model

// One countdown timer. Its state is a plain value moved along by the functions
// in IslandModel.js, and it is saved on every change so a shell restart or a
// plugin reload neither loses a running timer nor skips its ring.
Item {
  id: root

  property var timer: Model.timerIdle()
  // Epoch milliseconds, so a double: an int would overflow.
  property double now: Date.now()

  readonly property string status: timer.status
  readonly property bool live: status !== "idle"
  readonly property double remainingMs: Model.timerRemaining(timer, now)
  // What is left of the timer, 1 down to 0.
  readonly property real fraction: Model.timerFraction(timer, now)
  readonly property string label: timer.label

  // The length the timer page is set to start, in minutes.
  property int draftMinutes: 5

  signal finished(string label)

  function apply(next) {
    if (!next || next === timer) return
    var before = timer.status
    timer = next
    now = Date.now()
    save()
    if (next.status === "done") {
      doneTimer.restart()
      if (before !== "done") finished(next.label)
    } else {
      doneTimer.stop()
    }
  }

  function start(durationMs, label) {
    var next = Model.timerStart(durationMs, label, Date.now())
    if (next.status !== "running") return false
    apply(next)
    return true
  }

  function startDraft() {
    return start(draftMinutes * 60000, "")
  }

  function nudgeDraft(direction) {
    var step = direction > 0 ? (draftMinutes >= 10 ? 5 : 1) : (draftMinutes > 10 ? 5 : 1)
    draftMinutes = Math.max(1, Math.min(600, draftMinutes + (direction > 0 ? step : -step)))
  }

  function pause() { apply(Model.timerPause(timer, Date.now())) }
  function resume() { apply(Model.timerResume(timer, Date.now())) }
  function add(deltaMs) { apply(Model.timerAdd(timer, deltaMs, Date.now())) }
  function cancel() { if (status !== "idle") apply(Model.timerIdle()) }
  function dismiss() { if (status === "done") apply(Model.timerIdle()) }

  function toggle() {
    if (status === "running") pause()
    else if (status === "paused") resume()
  }

  function again() {
    if (timer.durationMs >= 1000) start(timer.durationMs, timer.label)
  }

  Timer {
    interval: 200
    repeat: true
    running: root.status === "running"
    onTriggered: {
      root.now = Date.now()
      root.apply(Model.timerTick(root.timer, root.now))
    }
  }

  // A finished timer that nobody dismisses clears itself.
  Timer {
    id: doneTimer
    interval: 90000
    onTriggered: root.dismiss()
  }

  // ------------------------------------------------------------ persistence

  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")) + "/omarchy-dynamic-island"
  property bool restored: false

  function save() {
    if (restored) stateFile.setText(JSON.stringify(timer))
  }

  function restore(text) {
    if (restored) return
    restored = true
    var saved = Model.timerRestore(text, Date.now())
    // A timer started in the instant before the file was read wins.
    if (timer.status === "idle" && saved.status !== "idle") apply(saved)
    else save()
  }

  Process {
    command: ["mkdir", "-p", "--", root.stateDir]
    running: true
  }

  FileView {
    id: stateFile
    path: root.stateDir + "/timer.json"
    printErrors: false
    onLoaded: root.restore(text())
    onLoadFailed: root.restore("")
  }
}
