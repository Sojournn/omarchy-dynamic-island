import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import "IslandModel.js" as Model
import "sources"

// Dynamic Island: the display notch as a place for what is going on right
// now. This service owns the activities (music, a timer, a screen recording),
// decides which of them the island shows, answers IPC, and puts one island
// window on every screen that has a notch.
//
//   omarchy-shell island toggle              open or close the island
//   omarchy-shell island show timer          open it on a page
//   omarchy-shell island timer 25m           start a timer
//   omarchy-shell island timerLabeled 5m Tea start one with a label
//   omarchy-shell island demo volume         preview an event or activity
//
// Other programs show their own events and activities through `notify` and
// `activity`; INTEGRATION.md is the reference for those.
//   omarchy-shell island calibrate           line the island up with the notch
Item {
  id: root

  // Injected by the shell.
  property var shell: null
  property var manifest: null
  readonly property string pluginId: manifest && manifest.id ? String(manifest.id) : Model.PLUGIN_ID

  // ---------------------------------------------------------------- palette
  //
  // The island is black whatever the theme, to read as one piece with the
  // notch. Theme colors are used on it only where they are bright enough.
  readonly property color ink: "#f7f7f7"
  readonly property color inkSecondary: Qt.rgba(1, 1, 1, 0.62)
  readonly property color inkTertiary: Qt.rgba(1, 1, 1, 0.38)
  readonly property color accent: Model.readableOnBlack(Commons.Color.accent.r, Commons.Color.accent.g, Commons.Color.accent.b, 0.32)
    ? Commons.Color.accent : ink
  readonly property color urgent: Model.readableOnBlack(Commons.Color.urgent.r, Commons.Color.urgent.g, Commons.Color.urgent.b, 0.18)
    ? Commons.Color.urgent : "#ff5f57"

  function toneColor(tone) {
    if (tone === "accent") return accent
    if (tone === "urgent") return urgent
    if (tone === "muted") return inkSecondary
    return ink
  }

  // A percentage in the display language, for the model's pure functions.
  function percentText(percent) {
    return catalog.t("event.percent").arg(I18n.formatNumber(percent))
  }

  // --------------------------------------------------------------- settings
  //
  // Inline on this plugin's entry in shell.json `plugins[]`; see
  // IslandModel.js for the keys. The shell hands a service no view of that
  // entry, so it is read from the file, which the shell rewrites on change.
  readonly property string configHome: Quickshell.env("XDG_CONFIG_HOME") || (Quickshell.env("HOME") + "/.config")
  property var entry: ({})
  property var settings: Model.normalizeSettings(null)

  // shell.json as last read, kept so the entry can be found again once the
  // shell has handed over the manifest and with it this plugin's id.
  property string configText: ""

  function loadSettings(text) {
    configText = String(text || "")
    entry = Model.pluginEntry(configText, pluginId)
    settings = Model.normalizeSettings(entry)
  }

  function saveSetting(key, value) {
    var changes = ({})
    changes[key] = value
    var next = Model.mergeEntry(entry, changes)
    entry = next
    settings = Model.normalizeSettings(next)
    return shell ? shell.updateEntryInline(pluginId, next) : false
  }

  onPluginIdChanged: loadSettings(configText)

  FileView {
    id: shellConfigFile
    path: root.configHome + "/omarchy/shell.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.loadSettings(text())
    onLoadFailed: root.loadSettings("")
    onFileChanged: reload()
  }

  // Where the notches are, as the platform package describes them.
  property var cutouts: []

  FileView {
    path: "/usr/share/omarchy-platform/display-cutouts.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.cutouts = Model.parseCutouts(text())
    onLoadFailed: root.cutouts = []
    onFileChanged: reload()
  }

  // Whether a fullscreen window covers a screen is read off Hyprland's
  // window list, which Quickshell refreshes only when asked. A window can go
  // fullscreen, open fullscreen by rule (the screensaver does, on a special
  // workspace), or leave; each is a reason to ask again.
  Connections {
    target: Hyprland

    function onRawEvent(event) {
      var name = event ? String(event.name) : ""
      if (name === "fullscreen" || name === "activespecial" || name === "openwindow"
          || name === "closewindow" || name === "movewindow") hyprlandRefresh.restart()
      // An agent whose terminal is closed has nobody left to wait for.
      if (name === "closewindow") {
        agentsSource.forget(String(event.data || ""))
        activitiesSource.forget(String(event.data || ""))
      }
    }
  }

  Timer {
    id: hyprlandRefresh
    interval: 60
    onTriggered: {
      Hyprland.refreshToplevels()
      Hyprland.refreshMonitors()
    }
  }

  Commons.Translations {
    id: catalog
    directory: Qt.resolvedUrl("i18n")
  }
  readonly property var strings: catalog

  // ------------------------------------------------------------- activities

  MediaSource {
    id: mediaSource
    lingerMs: root.settings.mediaLinger * 1000
    artEnabled: root.settings.albumArt
    onTrackChanged: if (root.settings.peekOnTrackChange) root.peekRequested()
  }

  TimerSource {
    id: timerSource
    onFinished: function(label) { root.timerFinished(label) }
    onStatusChanged: if (status !== "done") root.endAlert()
  }

  RecordingSource {
    id: recordingSource
  }

  DictationSource {
    id: dictationSource
    active: root.settings.dictation
  }

  RemindersSource {
    id: remindersSource
    active: root.settings.reminders
    leadMinutes: root.settings.reminderLead
    onFired: function(label) {
      root.showEvent({
        kind: "reminder", glyph: Model.glyphs.bellRing, tone: "accent",
        lead: label !== "" ? label : catalog.t("reminders.title"), trail: catalog.t("reminders.now"),
        fraction: -1, duration: 7000
      })
    }
  }

  AgentsSource {
    id: agentsSource
    active: root.settings.agents
    onAnnounced: function(session) {
      root.showEvent({
        kind: "agent", glyph: Model.glyphs.robot, tone: session.state === "input" ? "urgent" : "accent",
        lead: Model.agentName(session.agent),
        trail: catalog.t(session.state === "input" ? "agents.input" : "agents.done"),
        fraction: -1, duration: 5000
      })
    }
  }

  BatterySource {
    id: batterySource
    active: root.settings.battery
    onChanged: function(kind, percent) {
      var level = percent >= 0 ? catalog.t("event.percent").arg(I18n.formatNumber(percent)) : ""
      root.showEvent({
        kind: "battery",
        glyph: kind === "plugged" ? Model.glyphs.batteryCharging : kind === "charged" ? Model.glyphs.batteryFull : Model.glyphs.battery,
        tone: kind === "unplugged" ? "muted" : "accent",
        lead: catalog.t("battery." + kind), trail: level, fraction: -1, duration: 3600
      })
    }
  }

  BluetoothSource {
    id: bluetoothSource
    active: root.settings.bluetooth
    onChanged: function(connected, name, battery) {
      root.showEvent({
        kind: "bluetooth",
        glyph: connected ? Model.glyphs.bluetooth : Model.glyphs.bluetoothOff,
        tone: connected ? "accent" : "muted",
        lead: name,
        trail: !connected ? catalog.t("bluetooth.disconnected")
          : battery >= 0 ? catalog.t("event.percent").arg(I18n.formatNumber(battery))
          : catalog.t("bluetooth.connected"),
        fraction: -1, duration: 3600
      })
    }
  }

  ActivitiesSource {
    id: activitiesSource
    active: root.settings.integrations
  }

  readonly property var media: mediaSource
  readonly property var timer: timerSource
  readonly property var recording: recordingSource
  readonly property var dictation: dictationSource
  readonly property var reminders: remindersSource
  readonly property var agents: agentsSource
  readonly property var activities: activitiesSource

  // What is live, most important first, and which of those the compact island
  // shows: the newest to go live, until the wheel picks another.
  readonly property var liveIds: Model.liveOrder({
    dictation: dictationSource.live,
    recording: recordingSource.live,
    agents: agentsSource.live,
    activities: activitiesSource.live,
    timer: timerSource.live,
    reminders: remindersSource.live,
    media: mediaSource.live
  })
  property var previousLiveIds: []
  property string compactId: ""

  function syncCompact() {
    compactId = Model.nextCompact(compactId, liveIds, previousLiveIds)
    previousLiveIds = liveIds
  }

  onLiveIdsChanged: syncCompact()
  Component.onCompleted: syncCompact()

  function cycleCompact(delta) {
    if (liveIds.length > 1) compactId = Model.cycle(liveIds, compactId, delta)
  }

  // ----------------------------------------------------------------- events
  //
  // Things that just happened, shown beside the notch for a moment in place
  // of whatever activity was there. See IslandModel.js for the queue.
  property var events: Model.eventsIdle()
  readonly property var event: events.current

  function showEvent(next) {
    events = Model.eventPush(events, next)
  }

  onEventChanged: {
    if (event) {
      eventTimer.interval = Math.max(400, event.duration || 3000)
      eventTimer.restart()
    } else {
      eventTimer.stop()
    }
  }

  Timer {
    id: eventTimer
    onTriggered: root.events = Model.eventNext(root.events)
  }

  // Which screens have an island free to show an event right now, by screen
  // name. Each window keeps its own entry.
  property var readyScreens: ({})

  function setScreenReady(name, ready) {
    var key = String(name || "")
    if (key === "" || (readyScreens[key] === true) === ready) return
    var next = ({})
    for (var screen in readyScreens) next[screen] = readyScreens[screen]
    next[key] = ready
    readyScreens = next
  }

  function anyScreenReady() {
    for (var screen in readyScreens) if (readyScreens[screen] === true) return true
    return false
  }

  // An event from another program (INTEGRATION.md). "shown" means it is on
  // the island or queued behind what is; "declined" that no island is free to
  // show it, so the caller can say it some other way.
  function notify(payloadJson) {
    if (!settings.integrations) return "off"
    var notice = Model.notifyEvent(payloadJson)
    if (!notice.ok) return "invalid: " + notice.error
    if (!anyScreenReady()) return "declined"
    showEvent(notice.event)
    return "shown"
  }

  function focusedScreenReady() {
    var monitor = Hyprland.focusedMonitor
    return !!monitor && readyScreens[String(monitor.name)] === true
  }

  // The on-screen display, offered a payload first by the cloned OSD plugin
  // (see README). "shown" means the island has it; anything else leaves the
  // on-screen display to draw it as it always has: on another monitor, under
  // a fullscreen window, or when it is more than the island has room for.
  function takeOsd(payloadJson) {
    if (!settings.osd || !focusedScreenReady()) return "declined"
    var osd = Model.osdEvent(payloadJson)
    if (osd.kind === "progress") {
      showEvent({
        kind: "osd", preempt: true, glyph: osd.glyph, tone: "ink",
        lead: catalog.t("event.percent").arg(I18n.formatNumber(osd.percent)), trail: "",
        fraction: osd.fraction, duration: osd.duration
      })
      return "shown"
    }
    if (osd.kind === "message" && osd.glyph !== "") {
      showEvent({
        kind: "osd", preempt: true, glyph: osd.glyph, tone: "ink",
        lead: "", trail: osd.text, fraction: -1, duration: osd.duration
      })
      return "shown"
    }
    if (osd.kind === "media" && mediaSource.live) {
      peekRequested()
      return "shown"
    }
    return "declined"
  }

  // A sample of each event and of dictation, to see what they look like.
  function demo(name) {
    var sample = String(name || "")
    if (sample === "volume") showEvent({ kind: "osd", preempt: true, glyph: Model.glyphs.volumeMedium, tone: "ink", lead: catalog.t("event.percent").arg(I18n.formatNumber(45)), trail: "", fraction: 0.45, duration: 2500 })
    else if (sample === "brightness") showEvent({ kind: "osd", preempt: true, glyph: Model.glyphs.brightness, tone: "ink", lead: catalog.t("event.percent").arg(I18n.formatNumber(80)), trail: "", fraction: 0.8, duration: 2500 })
    else if (sample === "plugged" || sample === "battery") batterySource.changed("plugged", 54)
    else if (sample === "unplugged") batterySource.changed("unplugged", 54)
    else if (sample === "charged") batterySource.changed("charged", 100)
    else if (sample === "bluetooth") bluetoothSource.changed(true, "AirPods Pro", 82)
    else if (sample === "disconnected") bluetoothSource.changed(false, "AirPods Pro", -1)
    else if (sample === "reminder") remindersSource.fired("Stand up and stretch")
    else if (sample === "agent") agentsSource.report(JSON.stringify({ state: "input", agent: "claude", project: "demo", detail: "", session: "demo" }))
    else if (sample === "agentdone") agentsSource.report(JSON.stringify({ state: "done", agent: "codex", project: "demo", detail: "", session: "demo-done" }))
    else if (sample === "dictation") dictationSource.demo()
    else if (sample === "notify") notify(JSON.stringify({ title: "Build finished", text: "2m 14s", icon: "check", tone: "accent" }))
    else if (sample === "activity") activitiesSource.report(JSON.stringify({ id: "demo", state: "start", title: "Building", icon: "build", tone: "accent", progress: 42, ttl: 12 }))
    else return "unknown demo"
    return "ok"
  }

  // ------------------------------------------------------------ open island

  // Held open from IPC (a keybinding), as opposed to by the pointer, which
  // each window tracks for itself.
  property bool pinned: false
  // Held open for a moment because a timer just finished.
  property bool alerting: false
  property string pageId: "timer"

  signal peekRequested()
  signal collapseRequested()

  // The page an island opens on: the activity it was showing, or music if
  // something is loaded, or the timer, which is where one gets started.
  function preparePage() {
    pageId = Model.PAGES.indexOf(compactId) !== -1 ? compactId : mediaSource.available ? "media" : "timer"
  }

  function showPage(id) {
    if (Model.PAGES.indexOf(String(id)) === -1) return false
    pageId = String(id)
    return true
  }

  function cyclePage(delta) {
    pageId = Model.cycle(Model.PAGES, pageId, delta)
  }

  function expand() {
    if (!pinned) preparePage()
    pinned = true
  }

  function collapse() {
    pinned = false
    endAlert()
    collapseRequested()
  }

  function toggle() {
    if (pinned) collapse()
    else expand()
  }

  function endAlert() {
    alerting = false
    alertTimer.stop()
  }

  function timerFinished(label) {
    pageId = "timer"
    alerting = true
    alertTimer.restart()
    if (settings.timerNotify)
      Quickshell.execDetached(Model.timerNotification(catalog.t("timer.doneHeadline"), label))
  }

  Timer {
    id: alertTimer
    interval: 7000
    onTriggered: root.alerting = false
  }

  function startTimer(duration, label) {
    var ms = Model.parseDuration(duration)
    if (ms <= 0) return "invalid duration"
    return timerSource.start(ms, label) ? "ok" : "invalid duration"
  }

  function addTimer(duration) {
    var text = String(duration || "").trim()
    var negative = text.charAt(0) === "-"
    var ms = Model.parseDuration(negative || text.charAt(0) === "+" ? text.slice(1) : text)
    if (ms <= 0) return "invalid duration"
    if (timerSource.status !== "running" && timerSource.status !== "paused") return "no timer"
    timerSource.add(negative ? -ms : ms)
    return "ok"
  }

  // ------------------------------------------------------------ calibration
  //
  // The platform knows how tall a notch is but not how wide. Calibration
  // draws a marker on each side of where the island believes the notch ends;
  // the wheel moves them, and a click keeps the width.
  property bool calibrating: false
  property int calibrationWidth: 0

  function nudgeCalibration(currentWidth, delta) {
    calibrationWidth = Math.max(60, Math.min(600, Math.round(currentWidth) + delta))
  }

  function finishCalibration() {
    if (!calibrating) return
    calibrating = false
    if (calibrationWidth > 0) saveSetting("notchWidth", calibrationWidth)
    calibrationWidth = 0
  }

  function toggleCalibration() {
    if (calibrating) {
      finishCalibration()
    } else {
      collapse()
      calibrationWidth = 0
      calibrating = true
    }
  }

  // -------------------------------------------------------------------- ipc

  function statusJson() {
    return JSON.stringify({
      api: Model.API_VERSION,
      live: liveIds,
      compact: compactId,
      page: pageId,
      pinned: pinned,
      media: {
        available: mediaSource.available,
        playing: mediaSource.playing,
        title: mediaSource.title,
        artist: mediaSource.artist
      },
      timer: {
        status: timerSource.status,
        remainingMs: Math.round(timerSource.remainingMs),
        label: timerSource.label
      },
      recording: {
        recording: recordingSource.recording,
        saving: recordingSource.busy,
        elapsedMs: Math.round(recordingSource.elapsedMs)
      },
      dictation: { phase: dictationSource.phase, frame: dictationSource.frame, tray: dictationSource.trayItem !== null },
      reminders: remindersSource.items.length,
      agents: agentsSource.summary,
      activities: activitiesSource.items.map(function(item) {
        return { id: item.id, title: item.title, text: item.text, progress: item.fraction >= 0 ? Math.round(item.fraction * 100) : null }
      }),
      event: event ? event.kind : "",
      focusedWindow: agentsSource.focusedWindow,
      readyScreens: readyScreens
    })
  }

  ShellIpc {
    target: "island"

    function toggle(): string {
      root.toggle()
      return root.pinned ? "expanded" : "collapsed"
    }

    function expand(): string {
      root.expand()
      return "ok"
    }

    function collapse(): string {
      root.collapse()
      return "ok"
    }

    function show(page: string): string {
      if (!root.showPage(page)) return "unknown page"
      root.pinned = true
      return "ok"
    }

    function status(): string {
      return root.statusJson()
    }

    function timer(duration: string): string {
      return root.startTimer(duration, "")
    }

    function timerLabeled(duration: string, label: string): string {
      return root.startTimer(duration, label)
    }

    function timerAdd(duration: string): string {
      return root.addTimer(duration)
    }

    function timerPause(): string {
      timerSource.pause()
      return timerSource.status
    }

    function timerResume(): string {
      timerSource.resume()
      return timerSource.status
    }

    function timerToggle(): string {
      timerSource.toggle()
      return timerSource.status
    }

    function timerCancel(): string {
      timerSource.cancel()
      timerSource.dismiss()
      return timerSource.status
    }

    // ---- for other programs; INTEGRATION.md documents these four ----

    function notify(payloadJson: string): string {
      return root.notify(payloadJson)
    }

    function activity(payloadJson: string): string {
      return activitiesSource.report(payloadJson)
    }

    function activitiesClear(): string {
      activitiesSource.clear()
      return "ok"
    }

    function icons(): string {
      return Object.keys(Model.icons).join(" ")
    }

    // The on-screen display's payload, from the cloned OSD plugin.
    function osd(payloadJson: string): string {
      return root.takeOsd(payloadJson)
    }

    // An agent's report, from bin/island-agent.
    function agent(payloadJson: string): string {
      return agentsSource.report(payloadJson)
    }

    function agentsClear(): string {
      agentsSource.clear()
      return "ok"
    }

    function remindersRefresh(): string {
      remindersSource.refresh()
      return "ok"
    }

    function demo(name: string): string {
      return root.demo(name)
    }

    function calibrate(): string {
      root.toggleCalibration()
      if (root.calibrating) return "calibrating: scroll on the island to adjust, click it to keep"
      return "notch width " + (root.settings.notchWidth > 0 ? root.settings.notchWidth : "auto")
    }

    function notchWidth(width: string): string {
      var value = Math.round(Model.clampNumber(width, 0, 600, -1))
      if (value < 0) return "invalid width"
      root.saveSetting("notchWidth", value)
      return "ok"
    }

    function ping(): string {
      return "ok"
    }
  }

  // ---------------------------------------------------------------- windows

  Variants {
    model: Quickshell.screens

    delegate: Component {
      IslandWindow {
        required property var modelData

        screen: modelData
        island: root
      }
    }
  }
}
