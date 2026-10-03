# Rescue Robot — Operator Manual

This manual is for the person driving the robot from the dashboard. For how
to install and configure the system, see the [README](../README.md).

---

## 1. Before the mission

Work through this list before the robot is sent in.

**Robot**
- [ ] Battery charged and connected.
- [ ] Arduino and Raspberry Pi powered on.
- [ ] Camera, speaker (3.5 mm jack) and robot display connected.
- [ ] Nothing loose on the chassis; wheels turn freely.

**Network**
- [ ] The Wi-Fi router is powered on, and the robot is within its range.
- [ ] Your laptop is connected to the same Wi-Fi network as the robot.

**Laptop**
- [ ] Chrome is installed.
- [ ] To use your microphone and camera, the Chrome flag is set once:
      open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add
      `http://<pi-ip>:8080`, enable it and restart Chrome. Without
      it, video from the robot, images and text messages still work.

---

## 2. Opening the dashboard

1. Wait about 30 seconds after powering the robot so all services start.
2. In Chrome, open **`http://<pi-ip>:8080`** (the robot's address on the Wi-Fi network).
3. Check the status bar at the top:

| Indicator | Good | Problem |
|---|---|---|
| Connection | `WS connected` (green) | `WS offline` (red): the dashboard can't reach the robot. It retries automatically. |
| Role | `CONTROLLER` (green) | `OBSERVER — view only` (amber): you haven't entered the controller key. You can watch everything but control nothing. |
| Mission state | `READY` (green) | `STOP` (red): see [Section 4](#4-mission-states). |
| Serial | `serial ok` | `serial down`: the Pi can't talk to the Arduino. Motion is disabled. |
| GPS | `GPS fix` | `GPS no fix`: no location yet. Driving still works. It normally gets a fix within a few minutes outdoors. |

**Only the person with the controller key can control the robot.** Type the
key into the **Controller key** box at the top right and click **Unlock**.
The browser remembers it, so you only do this once per laptop. **Forget key**
removes it.

- **Controller** (right key): drive, move the camera, emergency stop, and
  talk to the victim.
- **Observer** (no key): sees the video, sound, sensors, map and alerts, but
  every button that does something is greyed out, including
  **EMERGENCY STOP**.
- Only one controller at a time. If a second dashboard enters the key, it
  takes over. The robot stops, and the first dashboard becomes an observer
  and sees "another dashboard took control".
- **Wrong key:** the box shows "Wrong controller key." After **5 wrong
  tries** that laptop is locked out for **5 minutes**, and even the right key
  is refused until then. It can still watch as an observer.

---

## 3. Dashboard layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Status bar: connection · role · mission state · serial · GPS       │
├──────────────┬──────────────────────────────────┬──────────────────┤
│ Mission state│                                  │ Sensor cards     │
│ Drive pad    │  Live video from robot           │ GPS card         │
│ Speed slider │                                  │ Alerts log       │
│ Camera pan/  ├──────────────────────────────────┴──────────────────┤
│   tilt       │                                                     │
│ EMERGENCY    │  Map (across the middle and right columns)          │
│   STOP       │                                                     │
│ Talk to      │                                                     │
│   victim     │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

---

## 4. Mission states

The large mission state on the left tells you whether it is safe to drive.

| State | Meaning | What to do |
|---|---|---|
| **READY** (green) | Everything working, robot idle. | Drive normally. |
| **DRIVING** (blue) | The robot is moving. | — |
| **DRIVING_LIMITED** (amber) | Video link from the robot lost. You can still drive, but you can't see. | Stop. Click **Retry video** on the video panel; if it fails, wait a few seconds for the media service to restart and try again. |
| **STOP** (red) | Connection lost, Arduino not responding, or no reply from the robot for over 3 seconds. Motion is disabled. | Stop and wait. See [Troubleshooting](#10-troubleshooting). |

---

## 5. Driving

You can drive with the on-screen pad or the keyboard.

| Action | On-screen | Keyboard |
|---|---|---|
| Forward | hold ▲ | hold `↑` or `W` |
| Reverse | hold ▼ | hold `↓` or `S` |
| Turn left | hold ◀ | hold `←` or `A` |
| Turn right | hold ▶ | hold `→` or `D` |
| Stop | click ■ | release the key |

- **The robot only moves while you hold the button or key.** Releasing it stops the robot.
- **Speed slider:** 0 to 180. The default is 120. Start low (around 80) in
  tight spaces and raise it once you're confident.
- Keyboard driving is ignored while you're typing in the message box, so
  typing a message won't move the robot.
- Watch the **Range** sensor card when driving forward. It turns amber
  under 30 cm and red under 20 cm from an obstacle.

### Built-in safety

- **Dead-man stop:** if the robot hears nothing from the dashboard for
  2 seconds (for example, the Wi-Fi drops), it stops the motors on its own.
  Once the connection returns, press a drive button again.
- The dashboard sends a heartbeat in the background, so the robot doesn't
  stop while you're simply idle and connected.

---

## 6. Camera (pan and tilt)

Use the **Pan** and **Tilt** sliders in the Camera section. Both range from
0° to 180°; 90° is centred. Pan and tilt are disabled when you're an observer
or disconnected.

---

## 7. Emergency stop

Click the red **EMERGENCY STOP** button (or the ■ on the drive pad).

- It stops all motors immediately.
- **Only the controller can use it.** On an observer's dashboard it is greyed
  out. If the controller's dashboard is lost, the robot's dead-man stop halts
  the motors within 2 seconds ([Section 5](#built-in-safety)).
- It isn't delayed or dropped by the checks that ordinary commands go through.

Use it whenever the robot does something unexpected. Driving works again as
soon as you press a drive button.

---

## 8. Sensors, map and alerts

**Sensor cards** (right side). A card turns **amber** at the warning level
and **red** at the critical level:

| Sensor | Warning | Critical |
|---|---|---|
| Temperature | above 50 °C | above 70 °C |
| Gas | above 450 | above 600 |
| Range (distance to obstacle) | below 30 cm | below 20 cm |
| Humidity | shown only, no alert | — |

The gas card is labelled "ppm", but the number is really the gas sensor's
raw reading (0–1023). The sensor hasn't been calibrated to true ppm. Use it
to tell whether gas is rising, not as an exact concentration.

**What a red card means for the mission:**
- **Temperature:** possible fire nearby. Back away and report it.
- **Gas:** hazardous air. Report it; rescuers need breathing protection.
- **Range:** the robot is about to hit something. Stop or reverse.

**GPS card and map:** show the robot's latitude and longitude, satellite
count and position on the map (blue dot). Indoors or under rubble, GPS may
show `no fix`, and the dot disappears until the fix returns. A fix needs at
least 4 satellites; mount the antenna facing up with open sky above it.

- **Offline map:** inside the robot's operating area the street map is
  stored on the robot, so it works with no internet. Outside that area the
  map needs internet and is blank without it.
- **Locate / follow button** (target icon, bottom-right of the map): when
  **blue**, the map follows the robot as it moves. **Drag the map** to look
  around and following stops (the button turns white). **Click the button**
  to jump back to the robot and follow it again. It is greyed out while
  there is no GPS fix.
- **Blue lines** are the robot's path: dark blue since you opened the page,
  light blue for everything recorded since the robot's software started. A
  point is added only after the robot moves about 10 m, so a robot standing
  still doesn't draw lines. With few satellites the position can jump now
  and then and add a short stray line.

**Alerts log:** a timestamped list of events such as disconnections,
reconnections (`recovered N buffered telemetry frames`) and command errors.
The newest entry is at the bottom.

---

## 9. Talking to the victim

The **Talk to victim** panel (under the video) uses the robot's speaker and
display. The victim sees and hears you; you see and hear the victim through
the robot's camera and microphone.

Only the controller can use this panel. Observers see "View only" and the
panel is greyed out, including the Robot Display / VNC switch. This includes
a laptop that knows the key but was taken over by another dashboard: talking
moves to the new controller within about a second.

**Before you start**, check the panel's top right shows
`robot screen online` (green). If it's amber, the robot's display isn't
running.

| To… | Do this |
|---|---|
| Speak | Click **🎤 Enable mic** once, then **hold 🎤 Hold to talk** while speaking. Release to stop. |
| Show your face | Click **My camera**. |
| Show a picture | Click **Image** and choose a file (for example, instructions or a photo of the rescue team). |
| Share your screen | Click **My screen**. |
| Show nothing | Click **Nothing**. |
| Send a text message | Type in the message box and click **Send**. When it appears on the robot, you'll see *"Message is on the robot screen ✓"*. |
| Remove the message | Click **Clear**. |

Useful things to tell the victim:
- Help is on the way.
- Stay still, and cover your nose and mouth if there is dust or gas.
- Tap or call out so rescuers can locate you.

**Only one operator can talk at a time.** If another operator is using the
screen, you'll see *"Another operator is talking to the victim"*. When you're
done, click **Release screen** so others can use it.

### Robot Display vs VNC mode

The **Robot display** buttons switch what the robot's screen shows:

- **🖥 Robot Display** (normal): the victim sees your video, images and messages.
- **💻 VNC Mode:** the robot screen shows the Pi desktop for maintenance.
  **The victim can't see anything you send.** A yellow warning appears
  while this mode is on.

Always switch back to **Robot Display** before a mission.

---

## 10. Troubleshooting

| Problem | Likely cause | What to do |
|---|---|---|
| Page won't load | Laptop not on the robot's Wi-Fi network, or robot still starting. | Check you're connected to the same Wi-Fi network as the robot. Wait 30 s and reload. |
| `WS offline` | Wi-Fi link to the robot lost. | The dashboard reconnects on its own (retrying for up to 30 s). Move the robot closer to the Wi-Fi router. |
| `OBSERVER — view only` | No controller key entered, or another dashboard took over. | Enter the key and click **Unlock**. |
| "Wrong controller key." | Key mistyped. | Type it again. Ask whoever set up the robot if you don't have it. |
| "Too many wrong keys. Try again in 5 min." | 5 wrong tries from this laptop. | Wait 5 minutes, or restart the robot service to clear it. |
| "The robot has no controller key set" | `CONTROLLER_KEY` isn't configured on the robot. | Nobody can control until it is set; see the README. |
| `serial down` / state `STOP` | Arduino disconnected or restarting. | The watchdog restarts services automatically; wait about 20 s. If it persists, check the Arduino USB cable. |
| Robot stops by itself while driving | Dead-man stop after a 2-second link drop. | Check the connection indicator, then press drive again. |
| No video | Media service restarting or weak link. | Wait a few seconds. Reload the page if it doesn't return. |
| "Hold to talk" / "My camera" greyed out | Chrome blocks the mic and camera on plain HTTP. | Set the Chrome flag in [Section 1](#1-before-the-mission). Images and text still work. |
| `robot screen offline` | The robot's display app isn't running, or the robot is in VNC mode. | Select **Robot Display**. If it stays offline, the robot display needs a restart. |
| Victim can't see messages | VNC mode is on. | Switch to **Robot Display**. |
| `GPS no fix` | Indoors or no sky view. | Normal indoors. Driving is unaffected. |

---

## 11. After the mission

1. Drive the robot back or wait for recovery.
2. Click **Release screen** if you were talking to the victim.
3. Close the dashboard so the controller role is freed. On a shared laptop,
   click **Forget key** first.
4. Power off the robot and charge the battery.
5. Save the mission logs if needed. They are on the Pi in `/var/log/robot/`,
   and include telemetry and the GPS track.
