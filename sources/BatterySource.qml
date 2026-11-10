import QtQuick
import Quickshell
import Quickshell.Services.UPower
import "../IslandModel.js" as Model

// The battery, read off UPower, for the moments worth a glance at the notch:
// the charger going in, coming out, the charge completing, and a battery
// running low. The level itself stays in the bar.
Item {
  id: root

  property bool active: true
  // The percentages at which a draining battery warns; none turns that off.
  property var lowLevels: []

  readonly property var device: UPower.displayDevice
  // UPower answers in pieces as the shell starts; until the battery's own
  // answer is in, there is no reading to compare against.
  readonly property bool present: !!device && device.ready !== false && device.isPresent === true
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
  onPercentChanged: settle()

  Timer {
    id: settleTimer
    interval: 400
    onTriggered: {
      var next = root.read()
      var kinds = root.active && root.armed ? Model.batteryEvents(root.reading, next, root.lowLevels) : []
      root.reading = next
      for (var i = 0; i < kinds.length; i++) root.changed(kinds[i], next.percent)
    }
  }

  // Whatever the battery is doing when the island starts is not news: the
  // first readings are kept to measure later ones against, and not announced.
  property bool armed: false

  Timer {
    interval: 3000
    running: true
    onTriggered: root.armed = true
  }

  Component.onCompleted: reading = read()
}
