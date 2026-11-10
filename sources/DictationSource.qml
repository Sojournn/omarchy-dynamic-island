import QtQuick
import Quickshell
import Quickshell.Services.SystemTray
import "../IslandModel.js" as Model

// Superwhisper dictation. Its daemon already animates a status item in the
// tray, so the island follows that item's frames rather than asking the daemon
// anything: recording while it listens, working while it transcribes.
Item {
  id: root

  property bool active: true

  readonly property var trayItem: {
    var values = SystemTray.items ? SystemTray.items.values : []
    for (var i = 0; i < values.length; i++) {
      if (String(values[i].id) === "superwhisper") return values[i]
    }
    return null
  }

  // A frame to show in place of the daemon's, for `island demo dictation`.
  property string demoFrame: ""
  readonly property string frame: demoFrame !== "" ? demoFrame : (trayItem ? Model.frameName(trayItem.icon) : "")
  readonly property string phase: active ? Model.dictationPhase(frame) : ""

  readonly property bool recording: phase === "recording"
  readonly property bool working: phase === "working"
  // The moment after a dictation went through: held just long enough for the
  // island to show it on its way back into the notch.
  property bool completing: false
  readonly property bool live: recording || working || completing

  property double startedAt: 0
  property double now: Date.now()
  readonly property double elapsedMs: recording ? Math.max(0, now - startedAt) : 0

  property string lastPhase: ""

  onPhaseChanged: {
    if (phase === "recording" && lastPhase !== "recording") {
      startedAt = Date.now()
      now = startedAt
    }
    if (phase === "recording" || phase === "working") {
      completeTimer.stop()
      completing = false
    } else if (phase === "complete" && (lastPhase === "recording" || lastPhase === "working")) {
      // Only a dictation that went through gets the mark; one that was
      // cancelled, or failed, just leaves.
      completing = true
      completeTimer.restart()
    }
    lastPhase = phase
  }

  Timer {
    id: completeTimer
    interval: 900
    onTriggered: root.completing = false
  }

  Timer {
    interval: 500
    repeat: true
    running: root.recording
    onTriggered: root.now = Date.now()
  }

  function demo() {
    demoFrame = "IconRecording"
    demoTimer.step = 0
    demoTimer.interval = 3200
    demoTimer.restart()
  }

  Timer {
    id: demoTimer
    property int step: 0
    onTriggered: {
      step += 1
      if (step === 1) {
        root.demoFrame = "IconWorking"
        interval = 1600
        restart()
      } else if (step === 2) {
        root.demoFrame = "IconComplete"
        interval = 600
        restart()
      } else {
        root.demoFrame = ""
      }
    }
  }
}
