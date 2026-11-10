import QtQuick
import qs.Commons

// Every word the island draws goes through this: plain text, so a track title
// or a timer label shaped like markup is shown as written and never parsed.
Text {
  textFormat: Text.PlainText
  font.family: Style.font.family
  font.pixelSize: Style.font.body
  color: "#f7f7f7"
  elide: Text.ElideRight
  maximumLineCount: 1
  verticalAlignment: Text.AlignVCenter
}
