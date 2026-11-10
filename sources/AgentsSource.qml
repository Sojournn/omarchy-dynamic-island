import QtQuick
import Quickshell
import Quickshell.Hyprland
import "../IslandModel.js" as Model

// Coding agents that have finished or are waiting on the user. Agents say so
// themselves, through bin/island-agent run from their hooks; nothing here
// watches them.
//
// Either report is announced as an event. After that only an agent waiting on
// the user holds the compact island, until its terminal is focused or it gets
// going again. One that finished steps aside at once: it stays listed on the
// agents page for a while, and the island goes back to whatever else is live.
Item {
  id: root

  property bool active: true

  // Newest first: { key, agent, state, window, project, detail, at }.
  property var sessions: []
  readonly property var summary: Model.agentsSummary(sessions)
  readonly property bool live: active && Model.agentsLive(sessions)

  // Quickshell learns the active window from focus changes, so until the
  // first one after the shell starts it is read off the window list.
  readonly property string focusedWindow: {
    var active = Hyprland.activeToplevel
    if (!active) {
      var toplevels = Hyprland.toplevels ? Hyprland.toplevels.values : []
      for (var i = 0; i < toplevels.length; i++) {
        if (toplevels[i] && toplevels[i].activated) {
          active = toplevels[i]
          break
        }
      }
    }
    return active ? Model.normalizeAddress(active.address) : ""
  }

  signal announced(var session)

  function keep(list) {
    if (list.length !== sessions.length) sessions = list
  }

  function report(payloadJson) {
    if (!active) return "off"
    var payload = Model.agentPayload(payloadJson)
    if (!payload.ok) return "invalid"
    var result = Model.agentsApply(sessions, payload, focusedWindow, Date.now())
    sessions = result.sessions
    if (result.announce) announced(result.announce)
    return "ok"
  }

  // The window an agent runs in was closed.
  function forget(address) {
    keep(Model.agentsFocus(sessions, address))
  }

  function clear() {
    sessions = []
  }

  // Bring an agent's terminal forward; focusing it is what clears it. (Not
  // named `focus`: every Item already has a property of that name, which a
  // function cannot replace, so calling it would throw.)
  function reveal(session) {
    var command = session ? Model.focusWindowCommand(session.window) : []
    if (command.length > 0) Quickshell.execDetached(command)
    else if (session) sessions = sessions.filter(function(other) { return other.key !== session.key })
  }

  onFocusedWindowChanged: keep(Model.agentsFocus(sessions, focusedWindow))
  onActiveChanged: if (!active) clear()

  Timer {
    interval: 60000
    repeat: true
    running: root.sessions.length > 0
    onTriggered: root.keep(Model.agentsExpire(root.sessions, Date.now()))
  }
}
