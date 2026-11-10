import QtQuick
import Quickshell
import "../IslandModel.js" as Model

// Activities other programs report: a build, a download, a deploy, anything
// that is going on for a while. They arrive over IPC (see INTEGRATION.md),
// are kept newest first, and go when their program ends them, when their
// window is closed, or when nothing has been heard from them for their ttl.
Item {
  id: root

  property bool active: true

  // { id, title, text, glyph, tone, fraction, window, ttl, startedAt, at, expiresAt }
  property var items: []
  property double now: Date.now()

  readonly property bool live: active && items.length > 0
  // The one last heard from, which the compact island shows.
  readonly property var current: items.length > 0 ? items[0] : null

  function keep(list) {
    if (list.length !== items.length) items = list
  }

  function report(payloadJson) {
    if (!active) return "off"
    var payload = Model.activityPayload(payloadJson)
    if (!payload.ok) return "invalid: " + payload.error
    var time = Date.now()
    var result = Model.activitiesApply(items, payload, time)
    items = result.list
    now = time
    return result.result
  }

  function forget(address) {
    keep(Model.activitiesForget(items, address))
  }

  function clear() {
    items = []
  }

  // Bring the window an activity belongs to forward, if it named one.
  function reveal(item) {
    var command = item ? Model.focusWindowCommand(item.window) : []
    if (command.length > 0) Quickshell.execDetached(command)
  }

  onActiveChanged: if (!active) clear()

  // Moves the elapsed times along and lets go of what has gone quiet.
  Timer {
    interval: 1000
    repeat: true
    running: root.items.length > 0
    onTriggered: {
      root.now = Date.now()
      root.keep(Model.activitiesExpire(root.items, root.now))
    }
  }
}
