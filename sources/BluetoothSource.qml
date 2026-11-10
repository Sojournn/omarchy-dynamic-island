import QtQuick
import Quickshell.Bluetooth
import "../IslandModel.js" as Model

// Bluetooth devices connecting and disconnecting. A device's name is whatever
// the device says it is, so it is bounded here and drawn as plain text.
Item {
  id: root

  property bool active: true

  readonly property var devices: Bluetooth.devices ? Bluetooth.devices.values : []
  // Devices already connected when the island starts, or reported while the
  // adapter is still listing what it knows, are not news.
  property bool armed: false

  signal changed(bool connected, string name, int battery)

  function announce(device) {
    if (!armed || !active || !device) return
    var name = Model.displayText(device.name || device.deviceName, 40)
    if (name === "") return
    var battery = device.batteryAvailable ? Math.round(Number(device.battery || 0) * 100) : -1
    changed(device.connected === true, name, battery)
  }

  Timer {
    interval: 4000
    running: true
    onTriggered: root.armed = true
  }

  Instantiator {
    model: root.devices

    delegate: Connections {
      required property var modelData

      target: modelData

      function onConnectedChanged() { root.announce(modelData) }
    }
  }
}
