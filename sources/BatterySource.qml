import QtQuick
import Quickshell
import Quickshell.Services.UPower
import "../IslandModel.js" as Model

// The battery, read off UPower, for the three moments worth a glance at the
// notch: the charger going in, coming out, and the charge completing. The
// level itself stays in the bar.
Item {
  id: root

  property bool active: true

  readonly property var device: UPower.displayDevice
  readonly property bool present: !!device && device.isPresent === true
  readonly property bool onBattery: UPower.onBattery === true
  readonly property int percent: present ? Math.round(Number(device.percentage || 0) * 100) : -1
  readonly property bool full: present && !onBattery
    && (device.state === UPowerDeviceState.FullyCharged || percent >= 100)

  // The reading the last change was measured against.
  property var reading: null

  signal changed(string kind, int percent)

  function read() {
    return { present: present, onBattery: onBattery, full: full, percent: percent }
  }

  // UPower's properties settle one after another, so a change is read once
  // they have all landed rather than on the first of them.
  function settle() {
    settleTimer.restart()
  }

  onPresentChanged: settle()
  onOnBatteryChanged: settle()
  onFullChanged: settle()

  Timer {
    id: settleTimer
    interval: 400
    onTriggered: {
      var next = root.read()
      var kinds = root.active ? Model.batteryEvents(root.reading, next) : []
      root.reading = next
      for (var i = 0; i < kinds.length; i++) root.changed(kinds[i], next.percent)
    }
  }

  // Whatever the battery is doing when the island starts is not news.
  Component.onCompleted: reading = read()
}
