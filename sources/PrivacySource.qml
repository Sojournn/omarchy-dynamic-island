import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import "../IslandModel.js" as Model

// Whether a program has the microphone or the camera, and which.
//
// The microphone is read off PipeWire: a program recording has a capture
// stream in the audio graph. The camera cannot be, because a program may open
// it without PipeWire at all, so bin/island-camera-watch reports the programs
// holding a camera device open instead. Neither looks at what is recorded.
Item {
  id: root

  property bool microphoneEnabled: true
  property bool cameraEnabled: true
  // Program names that never count, lowercase.
  property var ignore: []
  // Set while something else on the island already accounts for the
  // microphone, such as a dictation.
  property bool microphoneHeld: false

  // ------------------------------------------------------------ the graph

  readonly property var nodes: Pipewire.nodes ? Pipewire.nodes.values : []

  readonly property var nodeNames: {
    var names = []
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].name) names.push(String(nodes[i].name))
    }
    return names
  }

  // Streams that take sound or video in, as opposed to playing it.
  readonly property var captureStreams: {
    var list = []
    if (!microphoneEnabled && !cameraEnabled) return list
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      if (node && node.isStream && node.isSink === false) list.push(node)
    }
    return list
  }

  // A stream's properties (which program it belongs to) can be read only
  // while it is tracked.
  PwObjectTracker {
    objects: root.captureStreams
  }

  // The streams fed by an output rather than an input, by node id: those
  // record what the speakers play, not the microphone.
  readonly property var fedBySink: {
    var fed = ({})
    var groups = Pipewire.linkGroups ? Pipewire.linkGroups.values : []
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i]
      if (group && group.source && group.target && group.source.isSink === true && !group.source.isStream)
        fed[group.target.id] = true
    }
    return fed
  }

  function describe(node) {
    var props = node.properties || ({})
    var mediaClass = String(props["media.class"] || "")
    return {
      name: String(node.name || ""),
      app: String(props["application.name"] || ""),
      binary: String(props["application.process.binary"] || ""),
      media: String(props["media.name"] || ""),
      video: mediaClass !== "" ? mediaClass.indexOf("Video") !== -1 : !node.audio,
      captureSink: String(props["stream.capture.sink"] || "") === "true",
      fromSink: root.fedBySink[node.id] === true,
      // One half of a loopback or a filter: plumbing, not a program.
      linked: props["node.link-group"] !== undefined && props["node.link-group"] !== null
    }
  }

  readonly property var streams: {
    var out = []
    for (var i = 0; i < captureStreams.length; i++) {
      if (captureStreams[i]) out.push(describe(captureStreams[i]))
    }
    return out
  }

  // What a platform's audio processing adds to the graph for good.
  property var hints: Model.parseAudioHints("")

  FileView {
    path: "/usr/share/omarchy-platform/audio.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.hints = Model.parseAudioHints(text())
    onLoadFailed: root.hints = Model.parseAudioHints("")
    onFileChanged: reload()
  }

  // ----------------------------------------------------------- microphone

  property var microphoneDemo: []

  // The programs recording, by label; "" for one that gives no name.
  readonly property var microphoneApps: {
    if (microphoneDemo.length > 0) return microphoneDemo
    if (!microphoneEnabled || microphoneHeld) return []
    return Model.microphoneApps(streams.filter(function(stream) { return !stream.video }), hints, nodeNames, ignore)
  }
  readonly property bool microphoneBusy: microphoneApps.length > 0

  // In use, once it has been for a moment: a program that only asks which
  // microphones there are opens one for an instant, and that is not news.
  property bool microphoneOn: false

  onMicrophoneBusyChanged: {
    microphoneSettle.interval = microphoneBusy ? 500 : 1200
    microphoneSettle.restart()
  }

  Timer {
    id: microphoneSettle
    onTriggered: {
      if (root.microphoneOn === root.microphoneBusy) return
      root.microphoneOn = root.microphoneBusy
      if (root.microphoneOn && root.armed) root.started("microphone", Model.firstLabel(root.microphoneApps))
    }
  }

  // --------------------------------------------------------------- camera

  // The names of the processes holding a camera open, as the watcher last
  // reported them.
  property var holders: []
  property var cameraDemo: []

  readonly property var videoApps: {
    var names = []
    for (var i = 0; i < streams.length; i++) {
      var stream = streams[i]
      if (stream.video && (stream.app || stream.binary)) names.push(stream.app || stream.binary)
    }
    return names
  }

  readonly property var cameraApps: {
    if (cameraDemo.length > 0) return cameraDemo
    if (!cameraEnabled) return []
    return Model.cameraApps(holders, videoApps, ignore)
  }
  readonly property bool cameraBusy: cameraApps.length > 0
  property bool cameraOn: false

  onCameraBusyChanged: {
    cameraSettle.interval = cameraBusy ? 500 : 900
    cameraSettle.restart()
  }

  Timer {
    id: cameraSettle
    onTriggered: {
      if (root.cameraOn === root.cameraBusy) return
      root.cameraOn = root.cameraBusy
      if (root.cameraOn && root.armed) root.started("camera", Model.firstLabel(root.cameraApps))
    }
  }

  readonly property string watchScript: decodeURIComponent(String(Qt.resolvedUrl("../bin/island-camera-watch")).replace(/^file:\/\//, ""))

  // setpriv ends the watcher with the shell: Quickshell does not take its
  // child processes with it when it is killed.
  Process {
    id: watcher
    running: root.cameraEnabled
    command: ["setpriv", "--pdeathsig", "TERM", root.watchScript]
    stdout: SplitParser {
      onRead: function(line) { root.holders = Model.cameraHolders(line) }
    }
    onRunningChanged: if (!running) root.holders = []
  }

  Component.onDestruction: watcher.running = false

  // The microphone or the camera came into use; `label` names the program,
  // when it is known.
  signal started(string kind, string label)

  // A call already under way when the island starts is marked, not announced.
  property bool armed: false

  Timer {
    interval: 3000
    running: true
    onTriggered: root.armed = true
  }

  // A sample of each, for `island demo`.
  function demo(kind) {
    if (kind === "camera") cameraDemo = ["Firefox"]
    else microphoneDemo = ["Firefox"]
    demoTimer.restart()
  }

  Timer {
    id: demoTimer
    interval: 7000
    onTriggered: {
      root.microphoneDemo = []
      root.cameraDemo = []
    }
  }
}
