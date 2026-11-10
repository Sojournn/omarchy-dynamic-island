import QtQuick
import Quickshell
import Quickshell.Io

// Whether Omarchy's screen recorder is running, and for how long.
//
// omarchy-capture-screenrecording keeps its recorder's pid in a file in the
// runtime directory: written once the recording has started, removed once the
// recording has been saved. That file is the signal here. Its appearance is
// confirmed once with the command's own --status, its modification time is
// when the recording began, and the recorder's /proc entry going away is the
// recording ending, which leaves the file in place while the video is saved.
Item {
  id: root

  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR")
    || ((Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")) + "/omarchy")
  readonly property string pidPath: runtimeDir + "/omarchy-screenrecord-pid"

  // The recorder's pid as the file gives it, or "" while there is no file.
  property string pid: ""
  property bool recording: false
  // Stopped, with the video still being finalized.
  property bool saving: false
  // Stop was asked for here and the recorder has not gone yet.
  property bool stopping: false
  property double startedAt: 0
  property double now: Date.now()

  readonly property double elapsedMs: recording ? Math.max(0, now - startedAt) : 0
  readonly property bool busy: saving || stopping
  readonly property bool live: recording || saving

  // What the next recording started from the island captures alongside video.
  property bool withAudio: false
  property bool withMicrophone: false

  function start(mode) {
    var argv = ["omarchy-capture-screenrecording"]
    if (mode === "display") argv.push("--fullscreen")
    if (withAudio) argv.push("--with-desktop-audio")
    if (withMicrophone) argv.push("--with-microphone-audio")
    Quickshell.execDetached(argv)
  }

  function stop() {
    if (!recording || stopping) return
    stopping = true
    stoppingTimeout.restart()
    Quickshell.execDetached(["omarchy-capture-screenrecording", "--stop-recording"])
  }

  function pidSeen(text) {
    var value = String(text || "").trim()
    var next = /^[0-9]{1,10}$/.test(value) ? value : ""
    if (next === pid) return
    pid = next
    if (pid === "") {
      ended(false)
      return
    }
    if (!statusProc.running) statusProc.running = true
  }

  function statusSeen(active, output) {
    if (!active || pid === "") return
    var lines = String(output || "").trim().split("\n")
    var seconds = Number(lines[lines.length - 1])
    startedAt = isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now()
    now = Date.now()
    saving = false
    recording = true
  }

  function ended(finalizing) {
    recording = false
    stopping = false
    stoppingTimeout.stop()
    saving = finalizing
    if (finalizing) savingTimeout.restart()
    else savingTimeout.stop()
  }

  FileView {
    id: pidFile
    path: root.pidPath
    watchChanges: true
    printErrors: false
    onLoaded: root.pidSeen(text())
    onLoadFailed: root.pidSeen("")
    onFileChanged: reload()
  }

  // The watch covers a file that changes; this covers one that did not exist
  // when the watch was set. Re-reading a few bytes costs no process.
  Timer {
    interval: 2000
    repeat: true
    running: true
    onTriggered: pidFile.reload()
  }

  Process {
    id: statusProc
    command: ["bash", "-c", 'omarchy-capture-screenrecording --status >/dev/null 2>&1 || exit 1; stat -c %Y -- "$1"', "island-recording", root.pidPath]
    stdout: StdioCollector {
      id: statusOut
      waitForEnd: true
    }
    onExited: function(exitCode) {
      root.statusSeen(exitCode === 0, statusOut.text)
    }
  }

  // The recorder itself, while it records.
  FileView {
    id: recorderProc
    path: root.recording && root.pid !== "" ? "/proc/" + root.pid + "/comm" : ""
    printErrors: false
    onLoadFailed: if (root.recording) root.ended(true)
  }

  Timer {
    interval: 1000
    repeat: true
    running: root.recording
    onTriggered: {
      root.now = Date.now()
      recorderProc.reload()
    }
  }

  // A pid file left behind by a recorder that died is not a save in progress
  // for ever, and a stop that never took is not one either.
  Timer {
    id: savingTimeout
    interval: 45000
    onTriggered: root.saving = false
  }

  Timer {
    id: stoppingTimeout
    interval: 8000
    onTriggered: root.stopping = false
  }
}
