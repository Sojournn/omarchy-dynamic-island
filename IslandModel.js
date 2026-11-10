// Decisions the Dynamic Island makes, kept apart from QML so they can be
// checked without a compositor: tests/model.test.js runs them under node.
//
// Everything that reaches the island from outside (MPRIS metadata, shell.json,
// a persisted timer, IPC arguments) passes through here to be bounded and
// validated before it is drawn, saved, or handed to another program.

var PLUGIN_ID = "io.github.sojournn.dynamic-island"

// The expanded island's pages, in tab order, and which activity wins the
// compact island when several are live at once.
var PAGES = ["media", "timer", "recording", "reminders", "agents", "activities"]
var PRIORITY = ["dictation", "recording", "agents", "activities", "timer", "reminders", "media"]

// The version of the interface other programs talk to (INTEGRATION.md). It
// goes up only when something they rely on changes meaning or goes away.
var API_VERSION = 1

var MAX_TIMER_MS = 24 * 60 * 60 * 1000
var MAX_LABEL = 60

// ---------------------------------------------------------------- glyphs

// Nerd Font (Material Design) glyphs, by code point so the source stays ASCII.
function glyph(codePoint) {
  return String.fromCodePoint(codePoint)
}

var glyphs = {
  play: glyph(0xF040A),
  pause: glyph(0xF03E4),
  next: glyph(0xF04AD),
  previous: glyph(0xF04AE),
  stop: glyph(0xF04DB),
  music: glyph(0xF075A),
  timer: glyph(0xF051B),
  record: glyph(0xF0EC2),
  plus: glyph(0xF0415),
  minus: glyph(0xF0374),
  close: glyph(0xF0156),
  check: glyph(0xF012C),
  restart: glyph(0xF0450),
  microphone: glyph(0xF036C),
  speaker: glyph(0xF057E),
  display: glyph(0xF0379),
  region: glyph(0xF019E),
  volumeHigh: glyph(0xF057E),
  volumeMedium: glyph(0xF0580),
  volumeLow: glyph(0xF057F),
  volumeOff: glyph(0xF0581),
  microphoneOff: glyph(0xF036D),
  brightness: glyph(0xF00E0),
  keyboard: glyph(0xF030C),
  battery: glyph(0xF0079),
  batteryCharging: glyph(0xF0084),
  batteryFull: glyph(0xF17E2),
  bluetooth: glyph(0xF00B1),
  bluetoothOff: glyph(0xF00B2),
  bell: glyph(0xF009A),
  bellRing: glyph(0xF009E),
  robot: glyph(0xF06A9),
  video: glyph(0xF0567),
  batteryAlert: glyph(0xF0083),
  swap: glyph(0xF04E1)
}

// The icons other programs may ask for by name. Each is the Material Design
// glyph of that meaning in the Nerd Font the shell draws with.
var icons = {
  check: glyph(0xF012C),
  success: glyph(0xF05E0),
  warning: glyph(0xF0026),
  error: glyph(0xF0159),
  info: glyph(0xF02FC),
  bell: glyph(0xF009A),
  robot: glyph(0xF06A9),
  timer: glyph(0xF051B),
  clock: glyph(0xF0150),
  hourglass: glyph(0xF051F),
  calendar: glyph(0xF00ED),
  music: glyph(0xF075A),
  download: glyph(0xF01DA),
  upload: glyph(0xF0552),
  sync: glyph(0xF04E6),
  build: glyph(0xF1323),
  test: glyph(0xF0093),
  git: glyph(0xF062C),
  github: glyph(0xF02A4),
  docker: glyph(0xF0868),
  terminal: glyph(0xF018D),
  code: glyph(0xF0174),
  package: glyph(0xF03D6),
  rocket: glyph(0xF14DE),
  bug: glyph(0xF00E4),
  cloud: glyph(0xF015F),
  database: glyph(0xF01BC),
  server: glyph(0xF048B),
  network: glyph(0xF0317),
  wifi: glyph(0xF05A9),
  globe: glyph(0xF01E7),
  mail: glyph(0xF01EE),
  message: glyph(0xF0361),
  phone: glyph(0xF03F2),
  camera: glyph(0xF0100),
  video: glyph(0xF0567),
  microphone: glyph(0xF036C),
  image: glyph(0xF02E9),
  file: glyph(0xF0214),
  folder: glyph(0xF024B),
  link: glyph(0xF0337),
  search: glyph(0xF0349),
  pencil: glyph(0xF03EB),
  trash: glyph(0xF01B4),
  printer: glyph(0xF042A),
  lock: glyph(0xF033E),
  key: glyph(0xF0306),
  user: glyph(0xF0004),
  home: glyph(0xF02DC),
  star: glyph(0xF04CE),
  heart: glyph(0xF02D1),
  flag: glyph(0xF023B),
  fire: glyph(0xF0238),
  bolt: glyph(0xF140B),
  sparkles: glyph(0xF0674),
  pulse: glyph(0xF0430),
  eye: glyph(0xF0208),
  coffee: glyph(0xF0176),
  gift: glyph(0xF0E44),
  cart: glyph(0xF0110),
  money: glyph(0xF01C1),
  truck: glyph(0xF053D),
  map: glyph(0xF034E),
  gamepad: glyph(0xF0297),
  weather: glyph(0xF0595),
  power: glyph(0xF0425),
  battery: glyph(0xF0079),
  bluetooth: glyph(0xF00AF),
  volume: glyph(0xF057E),
  brightness: glyph(0xF00E0),
  play: glyph(0xF040A),
  pause: glyph(0xF03E4),
  stop: glyph(0xF04DB),
  record: glyph(0xF0EC2),
  dots: glyph(0xF01D8)
}

// ---------------------------------------------------------------- numbers

function clampNumber(value, min, max, fallback) {
  var n = Number(value)
  if (typeof value === "boolean" || value === null || value === "" || !isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

// ---------------------------------------------------------------- settings

// Inline settings on the plugin's entry in shell.json `plugins[]`.
//
//   notchWidth / notchHeight  logical px; 0 derives them from the panel
//   expandedWidth             logical px of the open island
//   expandOnHover             open when the pointer rests on the island
//   hoverDelay / collapseDelay  ms before opening / closing on hover
//   hideInFullscreen          tuck away under a real fullscreen window
//   mediaLinger               seconds a paused player stays in the island
//   peekOnTrackChange         briefly show the title when the track changes
//   albumArt                  load the cover the player advertises
//   timerPresets              minutes offered on the timer page
//   timerNotify               also send a desktop notification when done
//   osd                       show volume and brightness changes in the island
//   battery                   announce plugging in, unplugging and a full charge
//   batteryLow                percentages at which a draining battery warns
//   bluetooth                 announce devices connecting and disconnecting
//   dictation                 show Superwhisper recording and transcribing
//   reminders                 show Omarchy reminders
//   reminderLead              minutes before a reminder that it joins the island
//   reminderPresets           minutes offered on the reminders page
//   agents                    show coding agents that finished or need input
//   integrations              let other programs show events and activities
//   microphone                mark the island while an app has the microphone
//   camera                    mark the island while a program has the camera
//   privacyIgnore             programs that never count as using either
var DEFAULTS = {
  notchWidth: 0,
  notchHeight: 0,
  expandedWidth: 420,
  expandOnHover: true,
  hoverDelay: 90,
  collapseDelay: 320,
  hideInFullscreen: true,
  mediaLinger: 20,
  peekOnTrackChange: true,
  albumArt: true,
  timerPresets: [1, 5, 10, 25],
  timerNotify: true,
  osd: true,
  battery: true,
  batteryLow: [20, 10],
  bluetooth: true,
  dictation: true,
  reminders: true,
  reminderLead: 10,
  reminderPresets: [5, 15, 30, 60],
  agents: true,
  integrations: true,
  microphone: true,
  camera: true,
  privacyIgnore: []
}

function boolSetting(value, fallback) {
  return typeof value === "boolean" ? value : fallback
}

function normalizePresets(value, fallback) {
  var defaults = Array.isArray(fallback) ? fallback : DEFAULTS.timerPresets
  if (!Array.isArray(value)) return defaults.slice()
  var out = []
  for (var i = 0; i < value.length && out.length < 5; i++) {
    // A preset out of range is dropped, not pulled into range: a 0 that
    // became a one-minute button would be a button nobody asked for.
    var minutes = typeof value[i] === "number" && isFinite(value[i]) ? Math.round(value[i]) : 0
    if (minutes >= 1 && minutes <= 24 * 60 && out.indexOf(minutes) === -1) out.push(minutes)
  }
  return out.length > 0 ? out : defaults.slice()
}

// Battery levels to warn at, highest first. Unlike the presets, an empty list
// is an answer: it turns the warning off.
function normalizeLevels(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice()
  var out = []
  for (var i = 0; i < value.length && out.length < 4; i++) {
    var level = typeof value[i] === "number" && isFinite(value[i]) ? Math.round(value[i]) : 0
    if (level >= 1 && level <= 99 && out.indexOf(level) === -1) out.push(level)
  }
  return out.sort(function(a, b) { return b - a })
}

// Program names, lowercased, as they are matched in privacyIgnore.
function normalizeNames(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length && out.length < 16; i++) {
    if (typeof value[i] !== "string") continue
    var name = displayText(value[i], 40).toLowerCase()
    if (name !== "" && out.indexOf(name) === -1) out.push(name)
  }
  return out
}

function normalizeSettings(raw) {
  var entry = isPlainObject(raw) ? raw : {}
  return {
    notchWidth: Math.round(clampNumber(entry.notchWidth, 0, 600, DEFAULTS.notchWidth)),
    notchHeight: Math.round(clampNumber(entry.notchHeight, 0, 120, DEFAULTS.notchHeight)),
    expandedWidth: Math.round(clampNumber(entry.expandedWidth, 340, 640, DEFAULTS.expandedWidth)),
    expandOnHover: boolSetting(entry.expandOnHover, DEFAULTS.expandOnHover),
    hoverDelay: Math.round(clampNumber(entry.hoverDelay, 0, 2000, DEFAULTS.hoverDelay)),
    collapseDelay: Math.round(clampNumber(entry.collapseDelay, 0, 5000, DEFAULTS.collapseDelay)),
    hideInFullscreen: boolSetting(entry.hideInFullscreen, DEFAULTS.hideInFullscreen),
    mediaLinger: Math.round(clampNumber(entry.mediaLinger, 0, 3600, DEFAULTS.mediaLinger)),
    peekOnTrackChange: boolSetting(entry.peekOnTrackChange, DEFAULTS.peekOnTrackChange),
    albumArt: boolSetting(entry.albumArt, DEFAULTS.albumArt),
    timerPresets: normalizePresets(entry.timerPresets, DEFAULTS.timerPresets),
    timerNotify: boolSetting(entry.timerNotify, DEFAULTS.timerNotify),
    osd: boolSetting(entry.osd, DEFAULTS.osd),
    battery: boolSetting(entry.battery, DEFAULTS.battery),
    batteryLow: normalizeLevels(entry.batteryLow, DEFAULTS.batteryLow),
    bluetooth: boolSetting(entry.bluetooth, DEFAULTS.bluetooth),
    dictation: boolSetting(entry.dictation, DEFAULTS.dictation),
    reminders: boolSetting(entry.reminders, DEFAULTS.reminders),
    reminderLead: Math.round(clampNumber(entry.reminderLead, 0, 24 * 60, DEFAULTS.reminderLead)),
    reminderPresets: normalizePresets(entry.reminderPresets, DEFAULTS.reminderPresets),
    agents: boolSetting(entry.agents, DEFAULTS.agents),
    integrations: boolSetting(entry.integrations, DEFAULTS.integrations),
    microphone: boolSetting(entry.microphone, DEFAULTS.microphone),
    camera: boolSetting(entry.camera, DEFAULTS.camera),
    privacyIgnore: normalizeNames(entry.privacyIgnore)
  }
}

// The plugin's own entry in shell.json's `plugins[]`, or {}.
function pluginEntry(text, pluginId) {
  var parsed
  try {
    parsed = JSON.parse(String(text || ""))
  } catch (error) {
    return {}
  }
  var plugins = isPlainObject(parsed) && Array.isArray(parsed.plugins) ? parsed.plugins : []
  for (var i = 0; i < plugins.length; i++) {
    if (isPlainObject(plugins[i]) && String(plugins[i].id) === String(pluginId)) return plugins[i]
  }
  return {}
}

// The entry to write back with some settings changed: every key the user
// already had survives, since the shell replaces the entry wholesale.
function mergeEntry(entry, changes) {
  var out = {}
  var source = isPlainObject(entry) ? entry : {}
  for (var key in source) if (key !== "id") out[key] = source[key]
  for (var changed in changes) out[changed] = changes[changed]
  return out
}

// ---------------------------------------------------------------- the notch

// Display cutouts as Omarchy's platform package describes them, read the way
// the bar reads them (plugins/bar/BarModel.js): a panel matches a screen whose
// connector starts with `connector` and whose mode is width x height physical
// pixels, and `top` is how many physical rows the cutout covers.
function parseCutouts(text) {
  var parsed
  try {
    parsed = JSON.parse(String(text || ""))
  } catch (error) {
    return []
  }
  var panels = parsed && Array.isArray(parsed.panels) ? parsed.panels : []
  var cutouts = []
  for (var i = 0; i < panels.length && cutouts.length < 64; i++) {
    var panel = panels[i] || {}
    var width = Number(panel.width)
    var height = Number(panel.height)
    var top = Number(panel.top)
    if (typeof panel.connector !== "string" || panel.connector === "") continue
    if (!(width > 0) || !(height > 0) || !(top > 0) || top >= height) continue
    cutouts.push({ connector: panel.connector, width: width, height: height, top: top })
  }
  return cutouts
}

// The cutout's height on this screen in logical pixels, or 0 for a screen
// without one. `mode` is the output's physical mode ({ width, height,
// transform }) when Hyprland has reported it.
function cutoutTop(cutouts, screenName, logicalWidth, logicalHeight, devicePixelRatio, mode) {
  var name = String(screenName || "")
  var logical = Number(logicalWidth)
  var logicalTall = Number(logicalHeight)
  if (!(logical > 0) || !(logicalTall > 0)) return 0
  var width = Number(mode && mode.width)
  var height = Number(mode && mode.height)
  if (width > 0 && height > 0) {
    var transform = Number(mode.transform) || 0
    if (transform !== 0 && transform !== 4) return 0
    if ((width > height) !== (logical > logicalTall)) return 0
  } else {
    var scale = Number(devicePixelRatio) > 0 ? Number(devicePixelRatio) : 1
    width = Math.round(logical * scale)
    height = Math.round(logicalTall * scale)
  }
  var list = Array.isArray(cutouts) ? cutouts : []
  for (var i = 0; i < list.length; i++) {
    var panel = list[i]
    if (name.indexOf(panel.connector) !== 0) continue
    if (Math.abs(width - panel.width) <= 4 && Math.abs(height - panel.height) <= 4)
      return Math.ceil(panel.top * logical / width)
  }
  return 0
}

// The platform file gives a cutout's height but not its width. Apple's camera
// housings are close to 5.8 times as wide as they are tall (370 x 64 physical
// pixels on the 14" and 16" MacBook Pro); `notchWidth` overrides the guess.
function defaultNotchWidth(notchHeight) {
  var height = Number(notchHeight)
  return height > 0 ? Math.round(height * 5.78) : 0
}

// Whether a workspace holds a real fullscreen window (Hyprland's bit 2; a
// maximized window is 1 and keeps the bar, and so the island).
function fullscreenOn(toplevels, workspaceId) {
  var list = toplevels || []
  for (var i = 0; i < list.length; i++) {
    var toplevel = list[i]
    if (!toplevel || !toplevel.workspace || toplevel.workspace.id !== workspaceId) continue
    var ipc = toplevel.lastIpcObject
    if (ipc && (Number(ipc.fullscreen) & 2) !== 0) return true
  }
  return false
}

// ---------------------------------------------------------------- text

// Text fit to draw: one line, no control characters, bounded.
function displayText(text, maxLength) {
  var limit = maxLength > 0 ? maxLength : MAX_LABEL
  var out = String(text === undefined || text === null ? "" : text)
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return out.length > limit ? out.slice(0, limit).trim() : out
}

// A label cut to at most `maxLength` characters, the last an ellipsis when
// something was left off.
function shortLabel(text, maxLength) {
  var limit = Math.max(2, maxLength || 12)
  var out = displayText(text, 400)
  return out.length > limit ? out.slice(0, limit - 1).trim() + "\u2026" : out
}

// A label fit to hand to another program as well: it never starts with a
// dash, so it cannot be read as an option.
function plainLabel(text, maxLength) {
  return displayText(displayText(text, 4096).replace(/^[\s-]+/, ""), maxLength)
}

// Omarchy's notification service draws a body as markup: it decodes entities
// (repeatedly, since relays stack them), then keeps a safe subset of tags and
// makes links clickable. Escaping therefore cannot keep text literal there,
// because it is decoded straight back. A zero-width space after each "<" and
// "&" can: it survives the decoding, no tag or entity pattern matches across
// it, and the text still reads exactly as it was written. The same break
// inside "://" keeps a URL in a label from becoming something to click.
function notificationLiteral(text) {
  return String(text === undefined || text === null ? "" : text)
    .replace(/\u200b/g, "")
    .replace(/[<&]/g, function(character) { return character + "\u200b" })
    .replace(/:\/\//g, ":\u200b//")
}

// The command that announces a finished timer. Every argument is a separate
// argv entry and none starts with a dash unless it is one of ours.
function timerNotification(headline, label) {
  var argv = ["omarchy-notification-send", "-g", glyphs.timer, "-u", "normal", "-t", "10000",
    plainLabel(headline, 80) || "Timer"]
  var body = notificationLiteral(plainLabel(label, MAX_LABEL))
  if (body !== "") argv.push(body)
  return argv
}

// Cover art is loaded only from a local file or over HTTPS, and only from a
// URL of sane length.
function safeArtUrl(url) {
  var value = String(url === undefined || url === null ? "" : url)
  if (value.length === 0 || value.length > 2048) return ""
  if (/[\u0000- \u007f]/.test(value)) return ""
  if (/^file:\/\/\//.test(value) || /^https:\/\/[^\/]/i.test(value)) return value
  return ""
}

// ---------------------------------------------------------------- time

// "25" is minutes, like `omarchy reminder`; "90s", "25m", "1h30m", and
// "mm:ss" / "h:mm:ss" also work. Returns milliseconds, or 0 for anything that
// is not a duration between one second and a day.
function parseDuration(text) {
  var value = String(text === undefined || text === null ? "" : text).trim().toLowerCase()
  if (value === "" || value.length > 32) return 0
  var ms = 0

  if (/^\d+(\.\d+)?$/.test(value)) {
    ms = Number(value) * 60000
  } else if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(value)) {
    var parts = value.split(":").map(Number)
    ms = parts.length === 3
      ? ((parts[0] * 60 + parts[1]) * 60 + parts[2]) * 1000
      : (parts[0] * 60 + parts[1]) * 1000
  } else {
    var units = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*/g
    var consumed = 0
    var match
    while ((match = units.exec(value)) !== null) {
      if (match.index !== consumed) return 0
      consumed = units.lastIndex
      var amount = Number(match[1])
      var unit = match[2].charAt(0)
      ms += amount * (unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000)
    }
    if (consumed !== value.length) return 0
  }

  ms = Math.round(ms)
  if (!isFinite(ms) || ms < 1000 || ms > MAX_TIMER_MS) return 0
  return ms
}

// "m:ss" or "h:mm:ss". A countdown rounds up, so it reads 0:01 until it is
// over; elapsed time rounds down.
function formatClock(ms, roundUp) {
  var value = Number(ms)
  if (!isFinite(value) || value < 0) value = 0
  var total = roundUp ? Math.ceil(value / 1000) : Math.floor(value / 1000)
  var hours = Math.floor(total / 3600)
  var minutes = Math.floor((total % 3600) / 60)
  var seconds = total % 60
  var ss = (seconds < 10 ? "0" : "") + seconds
  if (hours > 0) return hours + ":" + (minutes < 10 ? "0" : "") + minutes + ":" + ss
  return minutes + ":" + ss
}

// ---------------------------------------------------------------- timer

// The timer is a value: { status, durationMs, endAt, remainingMs, label }.
// status is idle, running (endAt is when it ends), paused (remainingMs is what
// is left), or done.
function timerIdle() {
  return { status: "idle", durationMs: 0, endAt: 0, remainingMs: 0, label: "" }
}

function timerStart(durationMs, label, now) {
  var duration = Math.round(clampNumber(durationMs, 0, MAX_TIMER_MS, 0))
  if (duration < 1000) return timerIdle()
  return { status: "running", durationMs: duration, endAt: now + duration, remainingMs: duration, label: plainLabel(label) }
}

function timerRemaining(timer, now) {
  if (!timer) return 0
  if (timer.status === "running") return Math.max(0, timer.endAt - now)
  if (timer.status === "paused") return Math.max(0, timer.remainingMs)
  return 0
}

// How much of the timer is left, 1 down to 0.
function timerFraction(timer, now) {
  if (!timer || !(timer.durationMs > 0)) return 0
  if (timer.status === "done") return 0
  return Math.max(0, Math.min(1, timerRemaining(timer, now) / timer.durationMs))
}

function timerPause(timer, now) {
  if (!timer || timer.status !== "running") return timer
  var remaining = timerRemaining(timer, now)
  if (remaining <= 0) return timerTick(timer, now)
  return { status: "paused", durationMs: timer.durationMs, endAt: 0, remainingMs: remaining, label: timer.label }
}

function timerResume(timer, now) {
  if (!timer || timer.status !== "paused") return timer
  return { status: "running", durationMs: timer.durationMs, endAt: now + timer.remainingMs, remainingMs: timer.remainingMs, label: timer.label }
}

// Adds (or with a negative delta, takes away) time on a live timer. Taking
// away more than is left leaves one second, never a finished timer.
function timerAdd(timer, deltaMs, now) {
  if (!timer || (timer.status !== "running" && timer.status !== "paused")) return timer
  var delta = Math.round(clampNumber(deltaMs, -MAX_TIMER_MS, MAX_TIMER_MS, 0))
  var remaining = Math.max(1000, Math.min(MAX_TIMER_MS, timerRemaining(timer, now) + delta))
  var duration = Math.max(remaining, Math.min(MAX_TIMER_MS, timer.durationMs + delta))
  return {
    status: timer.status,
    durationMs: duration,
    endAt: timer.status === "running" ? now + remaining : 0,
    remainingMs: remaining,
    label: timer.label
  }
}

function timerTick(timer, now) {
  if (!timer || timer.status !== "running" || now < timer.endAt) return timer
  return { status: "done", durationMs: timer.durationMs, endAt: timer.endAt, remainingMs: 0, label: timer.label }
}

// A timer read back from disk after the shell restarted. A running one keeps
// its end time; one that ran out while the shell was away still rings if that
// was within the last five minutes, and is dropped if it is older.
function timerRestore(text, now) {
  var saved
  try {
    saved = JSON.parse(String(text || ""))
  } catch (error) {
    return timerIdle()
  }
  if (!isPlainObject(saved)) return timerIdle()
  var duration = Math.round(clampNumber(saved.durationMs, 0, MAX_TIMER_MS, 0))
  if (duration < 1000) return timerIdle()
  var label = plainLabel(saved.label)

  if (saved.status === "running") {
    var endAt = Number(saved.endAt)
    if (!isFinite(endAt) || endAt <= 0 || endAt - now > MAX_TIMER_MS) return timerIdle()
    if (endAt > now) return { status: "running", durationMs: duration, endAt: endAt, remainingMs: endAt - now, label: label }
    if (now - endAt <= 5 * 60000) return { status: "done", durationMs: duration, endAt: endAt, remainingMs: 0, label: label }
    return timerIdle()
  }
  if (saved.status === "paused") {
    var remaining = Math.round(clampNumber(saved.remainingMs, 0, MAX_TIMER_MS, 0))
    if (remaining < 1000) return timerIdle()
    return { status: "paused", durationMs: Math.max(duration, remaining), endAt: 0, remainingMs: remaining, label: label }
  }
  return timerIdle()
}

// ---------------------------------------------------------------- media

function playerKey(player) {
  if (!player) return ""
  return String(player.dbusName || player.desktopEntry || player.identity || "")
}

function hasTrack(player) {
  return !!(player && (player.trackTitle || player.trackArtist))
}

// playerctld mirrors whichever player it follows, so the real one is preferred.
function isProxyPlayer(player) {
  var dbusName = String(player && player.dbusName || "").toLowerCase()
  var desktopEntry = String(player && player.desktopEntry || "").toLowerCase()
  return dbusName.indexOf("playerctld") !== -1 || desktopEntry === "playerctld"
}

// The player the island follows: the one picked by hand, else the one playing
// (the one last used, if several are), else the one last used, else any
// holding a track.
function pickPlayer(players, lastKey, chosenKey) {
  var count = players && players.length ? players.length : 0
  var best = null
  var bestScore = 0
  for (var i = 0; i < count; i++) {
    var player = players[i]
    if (!player || !hasTrack(player)) continue
    var score = 1
    if (chosenKey && playerKey(player) === chosenKey) score += 16
    if (player.isPlaying) score += 8
    if (lastKey && playerKey(player) === lastKey) score += 4
    if (!isProxyPlayer(player)) score += 2
    if (score > bestScore) {
      best = player
      bestScore = score
    }
  }
  return best
}

// The players there are to switch between, by key: each one holding a track,
// without the proxy that only mirrors another unless it is all there is.
function playerChoices(players) {
  var count = players && players.length ? players.length : 0
  var real = []
  var proxies = []
  for (var i = 0; i < count; i++) {
    var player = players[i]
    var key = playerKey(player)
    if (!player || !hasTrack(player) || key === "") continue
    var list = isProxyPlayer(player) ? proxies : real
    if (list.indexOf(key) === -1) list.push(key)
  }
  return real.length > 0 ? real : proxies
}

// The keys of the players that are playing, for telling when one starts.
function playingKeys(players) {
  var count = players && players.length ? players.length : 0
  var out = []
  for (var i = 0; i < count; i++) {
    var key = playerKey(players[i])
    if (players[i] && players[i].isPlaying && key !== "" && out.indexOf(key) === -1) out.push(key)
  }
  return out
}

// Whether a player picked by hand is still the one to follow. It is until it
// is gone, or until some other player starts while it sits silent: pressing
// play somewhere else is a newer wish than the pick was.
function chosenPlayer(chosenKey, choices, previousPlaying, nowPlaying) {
  var chosen = String(chosenKey || "")
  if (chosen === "" || !Array.isArray(choices) || choices.indexOf(chosen) === -1) return ""
  var playing = Array.isArray(nowPlaying) ? nowPlaying : []
  var before = Array.isArray(previousPlaying) ? previousPlaying : []
  if (playing.indexOf(chosen) !== -1) return chosen
  for (var i = 0; i < playing.length; i++) {
    if (before.indexOf(playing[i]) === -1) return ""
  }
  return chosen
}

// One bar's height in the equalizer at an animation step, 0.25 to 1. It is a
// fixed scramble of its inputs rather than Math.random(), so it can be checked
// and every bar still moves on its own.
function barLevel(index, step) {
  var x = Math.sin((index + 1) * 12.9898 + step * 78.233) * 43758.5453
  return 0.25 + 0.75 * (x - Math.floor(x))
}

// ---------------------------------------------------------------- activities

// The live activities, most important first. `live` maps an id to a boolean.
function liveOrder(live) {
  var out = []
  for (var i = 0; i < PRIORITY.length; i++) {
    if (live && live[PRIORITY[i]] === true) out.push(PRIORITY[i])
  }
  return out
}

// Which activity the compact island shows. The current one stays while it is
// live, and the most important live one stands in when it is not. One that
// has just gone live takes over only if it matters at least as much as what
// is showing: a timer starting takes the island from music, but music
// starting (or a player blinking between tracks) does not take it from a
// recording or an agent waiting on the user.
function nextCompact(current, liveIds, previousLiveIds) {
  var live = Array.isArray(liveIds) ? liveIds : []
  var previous = Array.isArray(previousLiveIds) ? previousLiveIds : []
  if (live.length === 0) return ""
  var showing = current ? live.indexOf(current) : -1
  if (showing === -1) return live[0]
  // `live` is in order of importance, so the first newcomer is the weightiest.
  for (var i = 0; i <= showing; i++) {
    if (previous.indexOf(live[i]) === -1) return live[i]
  }
  return current
}

// The neighbour of `current` in `list`, wrapping round; the first entry when
// `current` is not in it.
function cycle(list, current, delta) {
  var items = Array.isArray(list) ? list : []
  if (items.length === 0) return ""
  var index = items.indexOf(current)
  if (index === -1) return items[0]
  var step = delta < 0 ? -1 : 1
  return items[(index + step + items.length) % items.length]
}

// ---------------------------------------------------------------- events

// An event is something that just happened, shown beside the notch for a
// moment and then gone: { kind, glyph, tone, lead, trail, fraction, duration,
// preempt }. `lead` is the text after the glyph, left of the notch; `trail`
// the text right of it, or a level bar when `fraction` is 0..1 (and -1 when
// there is none).
//
// The queue is a value: { current, queue }. One of a kind shows at a time, so
// a newer volume level replaces the one on screen and restarts its clock. An
// event that preempts (the volume keys, which must answer at once) takes the
// island from whatever is showing; anything else waits its turn.
var MAX_EVENTS = 4

function eventsIdle() {
  return { current: null, queue: [] }
}

function eventPush(state, event) {
  var base = state && Array.isArray(state.queue) ? state : eventsIdle()
  if (!event || !event.kind) return base
  var waiting = base.queue.filter(function(queued) { return queued.kind !== event.kind })
  if (!base.current || base.current.kind === event.kind || event.preempt === true)
    return { current: event, queue: waiting }
  waiting.push(event)
  return { current: base.current, queue: waiting.slice(-MAX_EVENTS) }
}

function eventNext(state) {
  var queue = state && Array.isArray(state.queue) ? state.queue : []
  if (queue.length === 0) return eventsIdle()
  return { current: queue[0], queue: queue.slice(1) }
}

// -------------------------------------------------------- on-screen display

// A message this long or shorter fits beside the notch; a longer one is left
// to the on-screen display it was meant for.
var MAX_OSD_MESSAGE = 28

function osdGlyph(icon, percent) {
  var name = String(icon || "").toLowerCase()
  if (name === "volume-muted" || name === "volume-mute" || name === "muted" || name === "mute") return glyphs.volumeOff
  if (name === "volume-low" || name === "volume-medium" || name === "volume-high" || name === "volume") {
    if (percent === 0) return glyphs.volumeOff
    if (percent > 0 && percent <= 33) return glyphs.volumeLow
    if (percent > 33 && percent <= 66) return glyphs.volumeMedium
    return glyphs.volumeHigh
  }
  if (name === "microphone-muted" || name === "microphone-off" || name === "mic-muted" || name === "mic-off") return glyphs.microphoneOff
  if (name === "microphone" || name === "mic") return glyphs.microphone
  if (name === "keyboard") return glyphs.keyboard
  if (name === "brightness" || name === "display") return glyphs.brightness
  return ""
}

// What the island makes of a payload meant for Omarchy's on-screen display
// ({ icon, message, value, max, duration }, as omarchy-osd builds it):
//
//   progress  a level, such as volume or brightness, with its glyph
//   message   a few words, short enough to sit beside the notch
//   media     a track change, which the island's own music peek covers
//   none      anything else, which the on-screen display should draw itself
function osdEvent(payloadJson) {
  var none = { kind: "none" }
  var raw = String(payloadJson === undefined || payloadJson === null ? "" : payloadJson)
  if (raw.length > 8192) return none
  var payload
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    return none
  }
  if (!isPlainObject(payload)) return none

  var icon = displayText(payload.icon, 40).toLowerCase()
  var message = displayText(payload.message, 400)
  var value = payload.value === undefined || payload.value === null ? "" : String(payload.value).trim()
  var number = parseInt(value, 10)
  var duration = Math.round(clampNumber(parseInt(payload.duration, 10), 500, 6000, 1400))

  if (icon.indexOf("media") === 0 || icon.indexOf("player") === 0) return { kind: "media" }

  if (value !== "" && !isNaN(number) && message === "") {
    var max = Math.max(1, parseInt(payload.max, 10) || 100)
    var level = Math.max(0, Math.min(max, number))
    var percent = Math.round(level * 100 / max)
    var glyphFor = osdGlyph(icon, percent)
    // A level with a glyph the island does not know is not one it can label.
    if (glyphFor === "") return none
    return { kind: "progress", glyph: glyphFor, fraction: level / max, percent: percent, duration: duration }
  }

  if (message !== "" && message.length <= MAX_OSD_MESSAGE)
    return { kind: "message", glyph: osdGlyph(icon, -1), text: message, duration: Math.max(duration, 1800) }

  return none
}

// ---------------------------------------------------------------- battery

// What changed between two readings of the battery, each
// { present, onBattery, full, percent }: "plugged", "unplugged", "charged" or
// "low". Plugging in a battery that is already full is one event, not two.
// "low" is a battery draining past one of `lowLevels`; passing several of
// them at once, as a laptop waking from sleep can, is still one warning.
function batteryEvents(previous, next, lowLevels) {
  if (!previous || !next || !previous.present || !next.present) return []
  if (previous.onBattery && !next.onBattery) return ["plugged"]
  if (!previous.onBattery && next.onBattery) return ["unplugged"]
  if (!next.onBattery && !previous.full && next.full) return ["charged"]
  if (next.onBattery && Array.isArray(lowLevels) && previous.percent >= 0 && next.percent >= 0) {
    for (var i = 0; i < lowLevels.length; i++) {
      if (previous.percent > lowLevels[i] && next.percent <= lowLevels[i]) return ["low"]
    }
  }
  return []
}

// ---------------------------------------------------------------- privacy

// Which programs have the microphone or the camera, worked out from what
// PipeWire and /proc report. Everything named here comes from other programs,
// so it is bounded and drawn as plain text like any other label.

// The nodes a platform's audio processing adds, which its package lists in
// /usr/share/omarchy-platform/audio.json:
//
//   { "hidden": ["<pattern>", ...],
//     "replaced": [{ "node": "<pattern>", "by": "<pattern>" }, ...] }
//
// A pattern is a regular expression for a whole node name. A MacBook's
// microphone runs through two such nodes that record all the time; they are
// not somebody listening. Missing or malformed text means no hints.
function wholeName(pattern) {
  if (typeof pattern !== "string" || pattern === "" || pattern.length > 200) return null
  try {
    return new RegExp("^(?:" + pattern + ")$")
  } catch (error) {
    return null
  }
}

function parseAudioHints(text) {
  var hints = { hidden: [], replaced: [] }
  var data = null
  try {
    data = JSON.parse(String(text || ""))
  } catch (error) {
    return hints
  }
  if (!isPlainObject(data)) return hints
  var hidden = Array.isArray(data.hidden) ? data.hidden : []
  for (var i = 0; i < hidden.length && hints.hidden.length < 64; i++) {
    var pattern = wholeName(hidden[i])
    if (pattern) hints.hidden.push(pattern)
  }
  var replaced = Array.isArray(data.replaced) ? data.replaced : []
  for (var j = 0; j < replaced.length && hints.replaced.length < 64; j++) {
    if (!isPlainObject(replaced[j])) continue
    var node = wholeName(replaced[j].node)
    var by = wholeName(replaced[j].by)
    if (node && by) hints.replaced.push({ node: node, by: by })
  }
  return hints
}

// Whether the hints hide a node, given the name of every node in the graph.
function audioHidden(name, hints, nodeNames) {
  var value = String(name || "")
  if (value === "" || !hints) return false
  var hidden = hints.hidden || []
  for (var i = 0; i < hidden.length; i++) {
    if (hidden[i].test(value)) return true
  }
  var replaced = hints.replaced || []
  var names = Array.isArray(nodeNames) ? nodeNames : []
  for (var j = 0; j < replaced.length; j++) {
    if (!replaced[j].node.test(value)) continue
    for (var k = 0; k < names.length; k++) {
      var other = String(names[k] || "")
      if (other !== value && replaced[j].by.test(other)) return true
    }
  }
  return false
}

// Programs that open the microphone to draw a level, not to listen: the
// shell's own meters and the usual mixers.
var LEVEL_METERS = ["quickshell", "quickshell-peak-monitor", "pavucontrol", "pwvucontrol", "peak detect"]

// Names people know programs by, where the name a program reports is not it.
// A process name is cut off at fifteen characters, hence the short ones.
var APP_LABELS = {
  "chrome": "Chrome", "google chrome": "Chrome", "chromium": "Chromium", "firefox": "Firefox",
  "brave": "Brave", "zen": "Zen", "obs": "OBS", "ffmpeg": "FFmpeg", "zoom": "Zoom",
  "gpu-screen-recorder": "Screen recorder", "gpu-screen-reco": "Screen recorder",
  "wf-recorder": "Screen recorder", "webrtc voiceengine": "Browser"
}

// A program's name as people would say it.
function appLabel(name) {
  var text = displayText(name, 80)
  // A path to a program is the program.
  if (text.charAt(0) === "/") text = text.split("/").pop()
  text = text.replace(/\s+(input|capture)$/i, "").replace(/^ALSA plug-in \[(.+)\]$/i, "$1")
  var known = APP_LABELS[text.toLowerCase()]
  if (known) return known
  // A bare lowercase word is a program's file name; it reads better capitalized.
  if (/^[a-z][a-z0-9]*$/.test(text)) text = text.charAt(0).toUpperCase() + text.slice(1)
  return displayText(text, 24)
}

// Whether any of a program's names matches one of `ignore` (lowercase; a
// match anywhere in a name counts, so "zoom" covers "ZOOM VoiceEngine").
function ignoresApp(names, ignore) {
  var list = Array.isArray(ignore) ? ignore : []
  for (var i = 0; i < names.length; i++) {
    var name = String(names[i] || "").toLowerCase()
    if (name === "") continue
    for (var j = 0; j < list.length; j++) {
      if (list[j] !== "" && name.indexOf(list[j]) !== -1) return true
    }
  }
  return false
}

function pushLabel(labels, label) {
  if (labels.indexOf(label) === -1 && labels.length < 6) labels.push(label)
}

// The programs recording from a microphone, by label, given the capture
// streams in the audio graph: { name, app, binary, media, captureSink,
// fromSink, linked }. Left out are the platform's own processing, one half
// of a loopback or filter (linked), level meters, a stream recording what
// the speakers play (captureSink, or fed by a sink), and whatever the user
// listed. A stream that names no program still counts,
// under an empty label: something is listening, whoever it is.
function microphoneApps(streams, hints, nodeNames, ignore) {
  var list = Array.isArray(streams) ? streams : []
  var labels = []
  for (var i = 0; i < list.length; i++) {
    var stream = list[i]
    if (!stream) continue
    var names = [stream.name, stream.app, stream.binary, stream.media]
    if (stream.captureSink === true || stream.fromSink === true || stream.linked === true) continue
    if (audioHidden(stream.name, hints, nodeNames)) continue
    if (ignoresApp(names, LEVEL_METERS) || ignoresApp(names, ignore)) continue
    pushLabel(labels, appLabel(stream.app || stream.binary || ""))
  }
  return labels
}

// One line from bin/island-camera-watch: the names of the programs holding a
// camera open, separated by tabs. An empty line is a camera nobody has.
function cameraHolders(line) {
  var parts = String(line === undefined || line === null ? "" : line).slice(0, 2048).split("\t")
  var out = []
  for (var i = 0; i < parts.length && out.length < 8; i++) {
    var name = displayText(parts[i], 40)
    if (name !== "" && out.indexOf(name) === -1) out.push(name)
  }
  return out
}

// The programs using the camera, by label. A program that reaches the camera
// through PipeWire shows up in /proc as PipeWire itself; the video streams in
// the graph (`viaPipewire`, by name) say who is behind it, when they say.
function cameraApps(holders, viaPipewire, ignore) {
  var held = Array.isArray(holders) ? holders : []
  var streams = Array.isArray(viaPipewire) ? viaPipewire : []
  var labels = []
  for (var i = 0; i < held.length; i++) {
    var name = String(held[i] || "")
    if (name === "" || ignoresApp([name], ignore)) continue
    var lower = name.toLowerCase()
    if (lower === "pipewire" || lower === "wireplumber" || lower === "pipewire-media-session") {
      var named = 0
      for (var j = 0; j < streams.length; j++) {
        if (!streams[j] || ignoresApp([streams[j]], ignore)) continue
        pushLabel(labels, appLabel(streams[j]))
        named++
      }
      if (named === 0) pushLabel(labels, "")
    } else {
      pushLabel(labels, appLabel(name))
    }
  }
  return labels
}

// The first program with a name among `labels`, for saying who it is.
function firstLabel(labels) {
  var list = Array.isArray(labels) ? labels : []
  for (var i = 0; i < list.length; i++) {
    if (list[i]) return list[i]
  }
  return ""
}

// ---------------------------------------------------------------- dictation

// Superwhisper animates a status item in the tray; its icon's file name says
// what it is doing (IconRecording-recording-dark.svg).
function frameName(icon) {
  return displayText(String(icon === undefined || icon === null ? "" : icon).split("/").pop().split("-")[0], 40)
}

function dictationPhase(frame) {
  if (frame === "IconRecording") return "recording"
  if (frame === "IconWorking") return "working"
  if (frame === "IconComplete") return "complete"
  return ""
}

// ---------------------------------------------------------------- reminders

var MAX_REMINDERS = 12

// The reminders `omarchy-reminder show --json` lists, soonest first, as
// { unit, label, at }, with `at` in epoch milliseconds.
function parseReminders(text) {
  var parsed
  try {
    parsed = JSON.parse(String(text || ""))
  } catch (error) {
    return []
  }
  var rows = isPlainObject(parsed) && Array.isArray(parsed.reminders) ? parsed.reminders : []
  var out = []
  for (var i = 0; i < rows.length && out.length < MAX_REMINDERS; i++) {
    var row = rows[i]
    if (!isPlainObject(row)) continue
    var unit = String(row.unit || "")
    if (!/^omarchy-reminder-[0-9]{1,6}m-[0-9]{1,12}$/.test(unit)) continue
    var at = Number(row.at) * 1000
    if (!isFinite(at) || at <= 0) continue
    out.push({ unit: unit, label: displayText(row.label, 80), at: at })
  }
  out.sort(function(a, b) { return a.at - b.at })
  return out
}

// The reminders that went off between two listings: the ones no longer
// listed whose time had come. One cleared early is gone without having fired.
function remindersFired(previous, current, now) {
  var before = Array.isArray(previous) ? previous : []
  var units = {}
  var after = Array.isArray(current) ? current : []
  for (var i = 0; i < after.length; i++) units[after[i].unit] = true
  return before.filter(function(reminder) {
    return !units[reminder.unit] && reminder.at <= now + 2000
  })
}

// ---------------------------------------------------------------- agents

// A coding agent reports here when it has finished or is waiting on the
// user. A session is { key, agent, state, window, project, detail, at };
// `window` is the Hyprland address of the terminal it runs in, when known.
var MAX_AGENT_SESSIONS = 6
var AGENT_NAMES = { claude: "Claude", codex: "Codex", opencode: "OpenCode", grok: "Grok", copilot: "Copilot", cursor: "Cursor" }

function normalizeAddress(address) {
  var value = String(address === undefined || address === null ? "" : address).trim().toLowerCase().replace(/^0x/, "")
  return /^[0-9a-f]{4,16}$/.test(value) ? value : ""
}

function agentName(agent) {
  var id = String(agent || "").toLowerCase()
  if (AGENT_NAMES[id]) return AGENT_NAMES[id]
  return id === "" ? "" : id.charAt(0).toUpperCase() + id.slice(1)
}

// A report from an agent's hook, as bin/island-agent sends it: validated and
// bounded, or { ok: false }.
function agentPayload(payloadJson) {
  var bad = { ok: false }
  var raw = String(payloadJson === undefined || payloadJson === null ? "" : payloadJson)
  if (raw.length > 8192) return bad
  var payload
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    return bad
  }
  if (!isPlainObject(payload)) return bad
  var state = String(payload.state || "")
  if (["input", "done", "working", "end"].indexOf(state) === -1) return bad
  var agent = String(payload.agent || "").toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(agent)) return bad
  var window = normalizeAddress(payload.window)
  var session = displayText(payload.session, 64)
  var project = displayText(payload.project, 40)
  return {
    ok: true,
    state: state,
    agent: agent,
    window: window,
    project: project,
    detail: displayText(payload.detail, 120),
    key: window !== "" ? "window:" + window : "agent:" + agent + ":" + (session || project)
  }
}

// Takes a report into the list. Returns the new list and, when the report is
// news the user is not already looking at, the session to announce.
function agentsApply(sessions, payload, focusedWindow, now) {
  var list = (Array.isArray(sessions) ? sessions : []).filter(function(session) { return session.key !== payload.key })
  // Working again, or gone: nothing is waiting on the user any more.
  if (payload.state === "working" || payload.state === "end") return { sessions: list, announce: null }
  // Its window has the focus: the user can see for themselves.
  if (payload.window !== "" && payload.window === normalizeAddress(focusedWindow)) return { sessions: list, announce: null }
  var session = {
    key: payload.key,
    agent: payload.agent,
    state: payload.state,
    window: payload.window,
    project: payload.project,
    detail: payload.detail,
    at: now
  }
  list.unshift(session)
  return { sessions: list.slice(0, MAX_AGENT_SESSIONS), announce: session }
}

// Focusing an agent's window answers it.
function agentsFocus(sessions, focusedWindow) {
  var window = normalizeAddress(focusedWindow)
  var list = Array.isArray(sessions) ? sessions : []
  if (window === "") return list
  return list.filter(function(session) { return session.window !== window })
}

// A finished agent is old news after half an hour; one waiting on the user is
// kept four.
function agentsExpire(sessions, now) {
  return (Array.isArray(sessions) ? sessions : []).filter(function(session) {
    var limit = session.state === "input" ? 4 * 3600000 : 30 * 60000
    return now - session.at < limit
  })
}

// Whether agents hold the compact island. Only one waiting on the user does:
// an agent that finished is announced for a moment and then kept on the
// agents page, out of the way of whatever else is live.
function agentsLive(sessions) {
  return agentsSummary(sessions).input > 0
}

function agentsSummary(sessions) {
  var summary = { input: 0, done: 0 }
  var list = Array.isArray(sessions) ? sessions : []
  for (var i = 0; i < list.length; i++) {
    if (list[i].state === "input") summary.input += 1
    else summary.done += 1
  }
  return summary
}

// The hyprctl command that focuses a window by address, as an argv with
// nothing in it but the validated address, or [] when there is none.
function focusWindowCommand(address) {
  var window = normalizeAddress(address)
  if (window === "") return []
  return ["hyprctl", "dispatch", 'hl.dsp.focus({ window = "address:0x' + window + '" })']
}

// ---------------------------------------------------------------- integration
//
// What other programs may send (INTEGRATION.md is the reference): `notify`,
// an event that shows for a moment, and `activity`, something ongoing that
// stays until it is ended. Both arrive as JSON from anyone who can reach the
// shell's socket, so every field is checked and bounded here, and nothing in
// a payload is ever run.

var MAX_ACTIVITIES = 8

// An icon by its public name. A caller may also pass a glyph of its own: one
// character from the symbol ranges, never a word (a word is a name this
// version does not know) and never an invisible or direction-changing one.
function iconGlyph(icon, fallback) {
  var name = String(icon === undefined || icon === null ? "" : icon).trim()
  var known = name.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(icons, known)) return icons[known]
  var characters = Array.from(name)
  if (characters.length === 1) {
    var code = characters[0].codePointAt(0)
    var surrogate = code >= 0xD800 && code <= 0xDFFF
    var variation = (code >= 0xFE00 && code <= 0xFE0F) || (code >= 0xE0000 && code <= 0xE0FFF)
    if (code >= 0x2190 && !surrogate && !variation && code !== 0xFEFF && code !== 0xFFFC && code !== 0xFFFD)
      return characters[0]
  }
  return fallback === undefined ? "" : fallback
}

function toneName(tone) {
  var name = String(tone === undefined || tone === null ? "" : tone).toLowerCase()
  return name === "accent" || name === "urgent" || name === "muted" ? name : "ink"
}

// A progress given as a percentage, 0 to 100, as a fraction; -1 for none.
function percentFraction(value) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return -1
  var number = Number(value)
  if (!isFinite(number)) return -1
  return Math.max(0, Math.min(100, number)) / 100
}

function integrationId(value) {
  var id = String(value === undefined || value === null ? "" : value)
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) ? id : ""
}

function parsePayload(payloadJson) {
  var raw = String(payloadJson === undefined || payloadJson === null ? "" : payloadJson)
  if (raw.length > 8192) return null
  var payload
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    return null
  }
  return isPlainObject(payload) ? payload : null
}

// notify: { title, text, icon, tone, duration, progress, id }
//
// The event it becomes, or { ok: false, error }. Events with the same id (or,
// without one, the same title) replace each other; different ones queue.
function notifyEvent(payloadJson) {
  var payload = parsePayload(payloadJson)
  if (!payload) return { ok: false, error: "not a JSON object" }
  var title = displayText(payload.title, 48)
  var text = displayText(payload.text, 40)
  if (title === "" && text === "") return { ok: false, error: "needs a title or text" }
  var fraction = percentFraction(payload.progress)
  return {
    ok: true,
    event: {
      kind: "notify:" + (integrationId(payload.id) || title || text),
      glyph: iconGlyph(payload.icon, icons.bell),
      tone: toneName(payload.tone),
      lead: title,
      // A level bar takes the place of the text beside it.
      trail: fraction >= 0 ? "" : text,
      fraction: fraction,
      duration: Math.round(clampNumber(payload.duration, 1500, 10000, 4000))
    }
  }
}

// activity: { id, state, title, text, icon, tone, progress, window, ttl }
//
// state is start (begin, or begin again), update (change some fields of one
// already begun), or end. Only the fields a payload names are in `changes`,
// so an update leaves the rest as they were.
function activityPayload(payloadJson) {
  var payload = parsePayload(payloadJson)
  if (!payload) return { ok: false, error: "not a JSON object" }
  var id = integrationId(payload.id)
  if (id === "") return { ok: false, error: "needs an id of letters, digits and . _ : -" }
  var state = String(payload.state === undefined ? "start" : payload.state)
  if (["start", "update", "end"].indexOf(state) === -1) return { ok: false, error: "state is start, update or end" }

  var changes = {}
  if (payload.title !== undefined) changes.title = displayText(payload.title, 40)
  if (payload.text !== undefined) changes.text = displayText(payload.text, 40)
  if (payload.icon !== undefined) changes.glyph = iconGlyph(payload.icon, icons.pulse)
  if (payload.tone !== undefined) changes.tone = toneName(payload.tone)
  if (payload.progress !== undefined) changes.fraction = percentFraction(payload.progress)
  if (payload.window !== undefined) changes.window = normalizeAddress(payload.window)
  if (payload.ttl !== undefined) changes.ttl = Math.round(clampNumber(payload.ttl, 5, 86400, 600))

  if (state === "start" && !changes.title) return { ok: false, error: "start needs a title" }
  return { ok: true, id: id, state: state, changes: changes }
}

// Takes a report into the list, newest first. An activity is
// { id, title, text, glyph, tone, fraction, window, ttl, startedAt, at, expiresAt }.
// It expires `ttl` seconds after it was last heard from, so one whose program
// died does not stay for ever.
function activitiesApply(list, payload, now) {
  var items = Array.isArray(list) ? list : []
  var existing = null
  for (var i = 0; i < items.length; i++) if (items[i].id === payload.id) existing = items[i]
  var others = items.filter(function(item) { return item.id !== payload.id })

  if (payload.state === "end") return { list: others, result: existing ? "ok" : "unknown" }
  if (payload.state === "update" && !existing) return { list: items, result: "unknown" }

  var base = payload.state === "update" ? existing : {
    id: payload.id, title: "", text: "", glyph: icons.pulse, tone: "ink", fraction: -1, window: "", ttl: 600, startedAt: now
  }
  var item = {}
  for (var key in base) item[key] = base[key]
  for (var changed in payload.changes) item[changed] = payload.changes[changed]
  item.at = now
  item.expiresAt = now + item.ttl * 1000
  others.unshift(item)
  return { list: others.slice(0, MAX_ACTIVITIES), result: "ok" }
}

function activitiesExpire(list, now) {
  return (Array.isArray(list) ? list : []).filter(function(item) { return item.expiresAt > now })
}

// An activity whose window was closed has nothing left to report on.
function activitiesForget(list, address) {
  var window = normalizeAddress(address)
  var items = Array.isArray(list) ? list : []
  if (window === "") return items
  return items.filter(function(item) { return item.window !== window })
}

// What sits right of the notch for an activity: its progress, else its own
// text, else how long it has been going. percentText(n) writes a percentage
// in the display language; without it the digits stay as they are.
function activityReadout(item, now, percentText) {
  if (!item) return ""
  if (item.fraction >= 0) {
    var percent = Math.round(item.fraction * 100)
    return typeof percentText === "function" ? percentText(percent) : percent + "%"
  }
  if (item.text !== "") return item.text
  return formatClock(Math.max(0, now - item.startedAt), false)
}

// ---------------------------------------------------------------- color

// The island is always black, so a theme color only earns its place on it if
// it is bright enough to read there.
function luminance(r, g, b) {
  return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)
}

function readableOnBlack(r, g, b, threshold) {
  return luminance(r, g, b) >= (threshold > 0 ? threshold : 0.32)
}

if (typeof module !== "undefined") {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    PAGES: PAGES,
    PRIORITY: PRIORITY,
    MAX_TIMER_MS: MAX_TIMER_MS,
    DEFAULTS: DEFAULTS,
    glyphs: glyphs,
    clampNumber: clampNumber,
    normalizeSettings: normalizeSettings,
    pluginEntry: pluginEntry,
    mergeEntry: mergeEntry,
    parseCutouts: parseCutouts,
    cutoutTop: cutoutTop,
    defaultNotchWidth: defaultNotchWidth,
    fullscreenOn: fullscreenOn,
    displayText: displayText,
    plainLabel: plainLabel,
    shortLabel: shortLabel,
    notificationLiteral: notificationLiteral,
    timerNotification: timerNotification,
    safeArtUrl: safeArtUrl,
    parseDuration: parseDuration,
    formatClock: formatClock,
    timerIdle: timerIdle,
    timerStart: timerStart,
    timerRemaining: timerRemaining,
    timerFraction: timerFraction,
    timerPause: timerPause,
    timerResume: timerResume,
    timerAdd: timerAdd,
    timerTick: timerTick,
    timerRestore: timerRestore,
    playerKey: playerKey,
    hasTrack: hasTrack,
    isProxyPlayer: isProxyPlayer,
    pickPlayer: pickPlayer,
    playerChoices: playerChoices,
    playingKeys: playingKeys,
    chosenPlayer: chosenPlayer,
    parseAudioHints: parseAudioHints,
    audioHidden: audioHidden,
    appLabel: appLabel,
    ignoresApp: ignoresApp,
    microphoneApps: microphoneApps,
    cameraHolders: cameraHolders,
    cameraApps: cameraApps,
    firstLabel: firstLabel,
    barLevel: barLevel,
    liveOrder: liveOrder,
    nextCompact: nextCompact,
    cycle: cycle,
    luminance: luminance,
    readableOnBlack: readableOnBlack,
    eventsIdle: eventsIdle,
    eventPush: eventPush,
    eventNext: eventNext,
    osdGlyph: osdGlyph,
    osdEvent: osdEvent,
    batteryEvents: batteryEvents,
    frameName: frameName,
    dictationPhase: dictationPhase,
    parseReminders: parseReminders,
    remindersFired: remindersFired,
    normalizeAddress: normalizeAddress,
    agentName: agentName,
    agentPayload: agentPayload,
    agentsApply: agentsApply,
    agentsFocus: agentsFocus,
    agentsExpire: agentsExpire,
    agentsSummary: agentsSummary,
    agentsLive: agentsLive,
    focusWindowCommand: focusWindowCommand,
    API_VERSION: API_VERSION,
    MAX_ACTIVITIES: MAX_ACTIVITIES,
    icons: icons,
    iconGlyph: iconGlyph,
    toneName: toneName,
    percentFraction: percentFraction,
    integrationId: integrationId,
    notifyEvent: notifyEvent,
    activityPayload: activityPayload,
    activitiesApply: activitiesApply,
    activitiesExpire: activitiesExpire,
    activitiesForget: activitiesForget,
    activityReadout: activityReadout
  }
}
