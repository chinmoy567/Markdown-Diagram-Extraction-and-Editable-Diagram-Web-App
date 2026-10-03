# AUTONOMOUS RESCUE ROBOT SYSTEM
## Final Methodology & Architecture

This document describes the system **as it is built** in this repository:
the Arduino firmware in `arduino/`, the Raspberry Pi processes in `pi/`, the
operator dashboard in `dashboard/` and the deployment files in `deploy/`.
Where a number is a design target that has not yet been measured on the
robot, it is marked as such; measured results belong in
[`TEST_REPORT.md`](TEST_REPORT.md).

---

# TABLE OF CONTENTS

**PART 1: SYSTEM OVERVIEW & ARCHITECTURE**
1. System Overview Diagrams
2. Four-Layer Architecture
3. Five Principal Subsystems
4. Seven Architectural Invariants

**PART 2: HARDWARE & EMBEDDED SYSTEMS**
5. Hardware Components & Specifications
6. Arduino UNO Real-Time Controller
7. Raspberry Pi 4 Edge Processing
8. Motor & Servo Control Systems
9. Sensor Suite & Environmental Monitoring

**PART 3: NETWORK ARCHITECTURE**
10. Local Wi-Fi Network (Overview)
11. Wi-Fi Link Quality Guide
12. Network Deployment Strategy
13. Link Quality & Performance Metrics

**PART 4: COMMUNICATION PROTOCOLS**
14. UART Serial Protocol (Arduino Link)
15. WebSocket Protocol (Command & Telemetry)
16. WebRTC Media Interface (Two-Way Video, Audio & Messaging)
17. REST Endpoints & Health Checks
18. Protocol Interoperability & Error Handling

**PART 5: EMBEDDED SOFTWARE ARCHITECTURE**
19. Raspberry Pi Process Architecture (P1, P2, P3)
20. P1: Control Server (FastAPI/UART/WebSocket)
21. P2: Media Server (aiortc/WebRTC) & Robot Screen
22. P3: Watchdog & Process Supervision
23. Fault-Tolerance Mechanisms
24. System Integration & Data Flow

**PART 6: DATA MANAGEMENT & STORAGE**
25. Telemetry Ring Buffer & Recovery Mechanism
26. Telemetry Pipeline & Visualization
27. GPS Path Tracking & Mapping
28. Logging, Log Rotation & Storage
29. Pin Configuration & Device Interfaces

**PART 7: OPERATIONAL MODES & STATES**
30. Operational Modes
31. Mission State Machine (4-State)
32. Alert Classification & Warning System
33. Graceful Degradation Strategies
34. Emergency Stop & Safety Procedures

**PART 8: STARTUP, RECOVERY & DEPLOYMENT**
35. Startup Handshake Procedure
36. Advisory Locking & Process Management
37. Process Recovery & Auto-Restart
38. Deployment Checklist & Pre-Mission Verification
39. Performance Analysis & Benchmarks
40. System Integration Matrix, Known Limitations & Conclusion

---

# PART 1: SYSTEM OVERVIEW & ARCHITECTURE

# SECTION 1: SYSTEM OVERVIEW DIAGRAMS

## 1.1 High-Level Communication Architecture

```
┌──────────────────────────────┐
│  OPERATOR LAPTOP             │
│  Browser dashboard (React)   │
│  WebSocket :8080 + WebRTC    │
└──────────────┬───────────────┘
               │ Wi-Fi
       ┌───────▼────────┐
       │ Wi-Fi router   │ local network (laptop and Pi on the same network)
       └───────┬────────┘
               │ Wi-Fi
       ┌───────▼────────────────────┐     ┌──────────────────────────┐
       │ Raspberry Pi 4             │────▶│ ROBOT DISPLAY (HDMI) +   │
       │ <pi-ip> (fixed in router)  │     │ SPEAKER (3.5 mm jack)    │
       │ P3 → P1 (:8080), P2 (:8443)│     │ victim-facing            │
       └───┬──────────────┬─────────┘     └──────────────────────────┘
           │ USB serial   │ GPIO UART (/dev/serial0, 9600 baud)
           │ 115,200 baud │
   ┌───────▼────────┐ ┌───▼──────────┐
   │  ARDUINO UNO   │ │ NEO-6M GPS   │
   │  Motors, servos│ └──────────────┘
   │  Sensors       │
   └────────────────┘
```

The operator opens `http://<pi-ip>:8080` in the browser. The Pi's address
is fixed with a reservation in the Wi-Fi router's settings.

## 1.2 System Composition (5 Subsystems)

```
1. OPERATOR CONTROL
   ├─ React 19 + TypeScript SPA (Vite, Tailwind, Leaflet), served by P1
   ├─ WebSocket client (motor/servo commands, heartbeat, telemetry)
   └─ WebRTC client (robot video/audio in; operator voice, video
      and text messages out to the robot display)

2. LOCAL WI-FI NETWORK
   ├─ One ordinary Wi-Fi router; the Pi and the operator laptop join it
   └─ Operator opens http://<pi-ip>:8080

3. EMBEDDED STACK (Raspberry Pi 4)
   ├─ P3: Watchdog — the only systemd-managed process
   ├─ P1: Control (FastAPI, USB serial to Arduino, GPS, WebSocket)
   ├─ P2: Media (aiortc WebRTC) + Robot Screen relay
   └─ Robot Screen: Chromium kiosk on the robot display

4. MOBILE UNIT
   ├─ 4WD chassis, 4 DC motors on 2× BTS7960 drivers
   ├─ Pan-tilt camera mount (2 servos)
   ├─ Sensors: DHT11, MQ-136, HC-SR04 (Arduino); NEO-6M GPS (Pi)
   ├─ USB camera + USB mic (victim → operator)
   └─ 7" HDMI display + speaker (operator → victim)

5. FAULT-TOLERANCE
   ├─ Arduino dead-man stop (2000 ms, firmware)
   ├─ P1 sends stop when the controlling dashboard disconnects
   ├─ P3 watchdog (restarts crashed or hung P1/P2)
   └─ systemd (restarts the watchdog service, 5 s)
```

---

# SECTION 2: FOUR-LAYER ARCHITECTURE

## 2.1 Hierarchical Decomposition

| Layer | Name | Components | Role | Failure Isolation |
|-------|------|-----------|------|------------------|
| **4** | Operator Frontend | React SPA, TypeScript, Vite | Human-machine interface | Browser closes → P1 sends stop; the dead-man stops the motors within 2 s anyway |
| **3** | Local Network | Ordinary Wi-Fi router | Wireless link | Link loss → the operator link drops and the dead-man stops the robot |
| **2** | Edge Processing | Pi: P1/P2/P3 (Python 3.11), Debian 12, systemd | Application logic, media, supervision | Process crash → P3 respawns it after a 10 s cooldown |
| **1** | Hardware | Arduino UNO, motors, servos, sensors | Real-time control, safety | Firmware dead-man stops the motors after 2 s without a command |

## 2.2 Dependency Flow & Failure Modes

```
Layer 4 → Layer 3 → Layer 2 → Layer 1

Failure Scenarios:
├─ Layer 4 fails: Operator offline; P1 sends S on disconnect, the
│                 dead-man stops the motors within 2 s at the latest
├─ Layer 3 fails: The Wi-Fi link is lost (no automatic fallback
│                 network is implemented)
├─ Layer 2 fails: P3 respawns the crashed process; if the Pi itself
│                 is down, commands stop and the dead-man stops the motors
└─ Layer 1 fails: Arduino hang or reset leaves the motor drivers
                  without a command; on reset they boot disabled
```

---

# SECTION 3: FIVE PRINCIPAL SUBSYSTEMS

```
SUBSYSTEM 1: OPERATOR CONTROL
├─ Dashboard: React 19 SPA with Tailwind CSS, three-column layout
├─ Motor control: 4 directions (buttons or arrow keys / WASD),
│  speed slider 0-180, release to stop
├─ Servo control: Pan/tilt sliders 0-180°
├─ Telemetry display: 4 sensor cards (temperature, humidity, gas,
│  range) + GPS card + connection status bar
├─ Video: robot camera 640×480 @ 10 fps (robot → operator)
├─ Audio: robot mic (listen toggle); push-to-talk to the victim
├─ Talk-to-victim: operator voice, face (laptop camera), image or
│  screen share, and text messages shown on the robot display
└─ Mission state: READY / DRIVING / DRIVING_LIMITED / STOP

SUBSYSTEM 2: LOCAL WI-FI NETWORK
├─ One ordinary Wi-Fi router with DHCP
├─ The Pi and the operator laptop join the same Wi-Fi network
├─ The Pi's address is fixed with a reservation in the router
├─ Security: the Wi-Fi network's WPA2/WPA3 password
└─ Operator opens http://<pi-ip>:8080

SUBSYSTEM 3: EMBEDDED COMPUTING
├─ Raspberry Pi 4 Model B (4 GB RAM), Debian 12 (Raspberry Pi OS)
├─ P3: Watchdog, started by systemd (robot-watchdog.service)
├─ P1: WebSocket server, serial bridge, GPS reader, ring buffer
├─ P2: WebRTC media server, operator → Robot Screen relay
├─ Robot Screen: Chromium kiosk page (localhost), fed by P2
├─ Arduino UNO: Motor/servo PWM, sensors, dead-man
└─ Arduino link: USB serial (/dev/ttyACM0), 115,200 baud, 8-N-1

SUBSYSTEM 4: MOBILE UNIT
├─ 4WD chassis
├─ Motors: 4× DC motors, left and right pairs, 2× BTS7960 drivers
├─ Servos: 2× (pan, tilt), 0-180°
├─ Sensors: DHT11, MQ-136, HC-SR04 (Arduino); NEO-6M GPS (Pi)
├─ Camera: USB webcam (Logitech C270), captured at 640×480, 10 fps
├─ Audio: USB mic (victim → operator) + speaker (operator → victim)
├─ Robot display: 7" HDMI screen (1024×600) facing the victim
├─ Power: 4S Li-ion pack (14.8 V nominal) with 40 A BMS; buck
│  converters for the 5 V servo/sensor rails and the Arduino supply;
│  the Pi runs from its own USB power bank (see hardware diagram)
└─ Network: the Pi's on-board Wi-Fi

SUBSYSTEM 5: FAULT-TOLERANCE
├─ Tier 1: Arduino dead-man (firmware, 2000 ms)
├─ Tier 2: P3 watchdog (1 s crash poll; /health every 10 s,
│          3 misses = hang; 10 s cooldown before respawn)
└─ Tier 3: systemd (Restart=on-failure, RestartSec=5)
```

---

# SECTION 4: SEVEN ARCHITECTURAL INVARIANTS

## 4.1 Statement & Implementation

| # | Invariant | Enforcement | Verification |
|---|-----------|-----------|--------------|
| **I** | Motor safety independent of network | Firmware dead-man: no valid command for 2000 ms → drivers disabled, PWM 0 | Tests H7 / F1: motors stop ~2 s after commands cease |
| **II** | P1, P2, P3 decoupled | Separate Python processes; P1 and P2 share no memory or IPC. P3 talks to them only through process status and HTTP `/health` | `pkill -9` of one does not stop the other |
| **III** | Every process supervised | P3 supervises P1 and P2; systemd supervises P3; the kiosk launcher supervises Chromium | Tests F3, F4, F5, F10 |
| **IV** | Control and media on independent paths | Control: WebSocket (TCP 8080, P1). Media: WebRTC (P2; signalling on TCP 8443, media over UDP on ports chosen by ICE) | Killing P2 leaves driving working |
| **V** | Operator state always simple | Mission state derived by one pure function (`deriveMissionState`) into 4 states | `pi/tests/test_mission_state.py` |
| **VI** | Only one process controls the Arduino | `flock` on `/run/robot/p1.lock` + serial port opened with `exclusive=True`; only one WebSocket client holds the controller role | A second P1 exits with code 0 (`LOCK_HELD`) |
| **VII** | Primary operation needs no internet | Dashboard, control and media all run on the local network | Works offline, including the map inside the operating area, drawn from a map file stored on the Pi; outside that area the map background comes from openstreetmap.org (Section 27) |

---

# PART 2: HARDWARE & EMBEDDED SYSTEMS

# SECTION 5: HARDWARE COMPONENTS & SPECIFICATIONS

## 5.1 Mobile Robotic Platform

| Component | Specification | Function |
|-----------|---------------|----------|
| **Chassis** | 4WD ground platform | Rubble traversal |
| **DC Motors** | 4× DC gear motors, wired as left and right pairs | Drive propulsion |
| **Motor drivers** | 2× BTS7960 (43 A dual half-bridge), one per side | Speed and direction |
| **Pan-Tilt** | 2× hobby servos, 0-180° | Camera orientation |
| **USB Camera** | Logitech C270, captured at 640×480, 10 fps | Video to operator |
| **USB Microphone** | USB audio capture device (e.g. ALSA card "U20") | Victim audio to operator |
| **Speaker** | On the Pi's 3.5 mm jack (default PipeWire sink) | Operator voice to victim |
| **Robot Display** | 7" HDMI LCD, 1024×600, facing forward | Operator video / image / text to victim |
| **Battery** | 4S Li-ion (14.8 V nominal, 16.8 V full) with 4S 40 A BMS | Motor power |
| **Buck converters** | 5 V rails (servos, sensors); ~8 V to the Arduino barrel jack | Logic power |
| **Pi power** | Separate USB power bank | Keeps the Pi up when motors draw current |

The firmware accepts motor PWM up to 255, but P1 and the dashboard cap it
at **180** (`MAX_PWM`), which limits the average motor voltage from the
14.8 V pack to about 12 V.

## 5.2 Environmental Sensor Suite

| Sensor | Model | Connected to | Measurement | Read by firmware |
|--------|-------|--------------|-------------|------------------|
| Temperature/Humidity | DHT11 | Arduino A2 | °C and %RH (integers) | Every 2 s |
| Gas | MQ-136 (H₂S-sensitive) | Arduino A3 | **Raw ADC count 0-1023** (not calibrated ppm) | Every 2 s |
| Distance (Ultrasonic) | HC-SR04 | Arduino D7/D8 | Obstacle range, capped at 400 cm | Every 50 ms |
| GPS Receiver | NEO-6M | Pi GPIO UART (`/dev/serial0`, 9600 baud) | Position, fix, satellites (NMEA RMC/GGA) | Read by P1, not the Arduino |

The telemetry field is named `gas_ppm` for historical reasons, but it carries
the raw ADC value; no calibration curve exists for the sensor yet.

---

# SECTION 6: ARDUINO UNO REAL-TIME CONTROLLER

## 6.1 Microcontroller Specifications

| Parameter | Value |
|-----------|-------|
| CPU | ATmega328P, 16 MHz |
| Flash / SRAM | 32 KB / 2 KB |
| Firmware | `RESCUE-UNO` 1.0.0 (`arduino/`) |
| Link to Pi | USB serial, 115,200 baud, 8-N-1 |
| Motor PWM pins | D5, D6 (left, Timer0), D9, D10 (right, Timer1) |
| Servo pins | D11 (pan), D3 (tilt), driven by ServoTimer2Plus on Timer2 |
| Architecture | No OS; cooperative `millis()` scheduler, no `delay()` in the main loop |

Servos use Timer2 (`ServoTimer2Plus`) rather than the standard Servo
library, because the standard library takes Timer1 and would disable
`analogWrite()` on the right motor pins D9/D10.

## 6.2 Dead-Man Safety Timer

The dead-man is a **software check** in the 10 ms safety task (not a timer
interrupt):

```c
// arduino/arduino.ino — taskSafety(), every 10 ms
if ((unsigned long)(now - g_state.lastCommandTime()) >= DEADMAN_TIMEOUT_MS) {   // 2000 ms
  if (g_state.fault() != FAULT_DEADMAN &&
      g_state.mode()  != MODE_PANIC    &&
      g_state.mode()  != MODE_ESTOP) {
    g_state.setFault(FAULT_DEADMAN);     // mode → PANIC
    g_motors.emergencyStop();            // PWM 0 on all four pins, EN (D4) LOW
    g_telemetry.sendPanic();             // "PANIC DEADMAN"
  }
}
```

- **Any well-formed command** refreshes the timer: `F/R/L/G/S/H/P/T/?`.
- The dashboard sends a `heartbeat` every 500 ms, which P1 forwards as `H`,
  so the timer only expires if the dashboard, the network or P1 stops.
- **Recovery is automatic:** when commands resume, the fault clears
  (`EVT DEADMAN_CLEARED`) and the drivers are re-enabled.

**Guarantee:** motors stop within 2000 ms (+ at most one 10 ms task period)
of the last valid command, independent of the network and the Pi.

## 6.3 Cooperative Scheduler (No OS)

```
loop() — every iteration:
├─ g_parser.poll()        read serial bytes, handle complete lines
└─ g_scheduler.run()      run any task whose period has elapsed

Scheduled tasks (arduino/arduino.ino):
├─ taskMotorService    10 ms   ramp PWM toward target (15 steps/tick)
├─ taskSafety          10 ms   dead-man + gas panic + fault recovery
├─ taskSensorFast      50 ms   HC-SR04 (pulseIn, ≤ 25 ms timeout)
├─ taskSensorSlow    2000 ms   DHT11 (~25 ms bit-banged read) + MQ-136 ADC
├─ taskTelemetry      500 ms   CSV telemetry line
└─ taskHeartbeat     1000 ms   "HB <mode> <millis>" + toggle LED D13
```

The HC-SR04 and DHT11 reads block for up to ~25 ms each; this is bounded
and well inside the 2000 ms dead-man window.

## 6.4 Firmware State Machine

```
BOOT ──► READY ──(F/R/L/G)──► ACTIVE
           ▲                    │
           └──────── S ─────────┘

any ──► PANIC  (dead-man timeout, or gas raw ADC ≥ 1000)
PANIC ──► READY (commands resume / gas reading drops below threshold)
```

| Mode | `fw_state` in telemetry | Motion allowed |
|------|-------------------------|----------------|
| READY | 1 (ARMED) | Yes |
| ACTIVE | 2 (DRIVING) | Yes |
| BOOT / PANIC / ESTOP | 3 (STOPPED) | No |

An `ESTOP` mode exists in the code, but no command currently enters it; the
operator's emergency stop is an ordinary `S` (Section 34).

---

# SECTION 7: RASPBERRY PI 4 EDGE PROCESSING

## 7.1 Hardware & OS

| Parameter | Value |
|-----------|-------|
| Board | Raspberry Pi 4 Model B |
| CPU | ARM Cortex-A72, 4 cores @ 1.5 GHz |
| RAM | 4 GB |
| Storage | microSD |
| Network | On-board Wi-Fi, same network as the operator laptop |
| USB | Arduino (serial), camera, microphone |
| HDMI | micro-HDMI → robot display |
| Audio out | 3.5 mm jack → speaker |
| GPIO UART | GPIO14/15 → NEO-6M GPS (`/dev/serial0`) |
| OS | Debian 12 "bookworm" (Raspberry Pi OS), systemd, desktop session with autologin (needed for the kiosk) |
| Python | 3.11, in a virtualenv at `/opt/robot/venv` |

## 7.2 Three Python Processes

systemd starts only **P3** (`robot-watchdog.service`). P3 spawns P1 and P2
as child processes and supervises them.

### P1: Control Server (WebSocket, Serial, Telemetry, GPS)

| Property | Value |
|----------|-------|
| Module | `pi/p1_control` (`python -m p1_control.main`) |
| Framework | FastAPI + uvicorn |
| Port | TCP 8080 (also serves the built dashboard from `/opt/robot/dashboard/dist`) |
| Owned resources | Arduino serial port (`SERIAL_PORT`, `/dev/ttyACM0` in `p1.env`), GPS port `/dev/serial0` |
| Single-instance lock | `flock` on `/run/robot/p1.lock` + exclusive serial open |
| Telemetry broadcast | Every 200 ms, to all WebSocket clients |
| Ring buffer | 300 snapshots (60 s at 200 ms), in memory |
| Disk log | `telemetry.log` CSV at 1 Hz |
| Health endpoint | `GET /health` (JSON) |
| Supervision | P3 |

### P2: Media Server (WebRTC)

| Property | Value |
|----------|-------|
| Module | `pi/p2_media` (`python -m p2_media.main`) |
| Framework | aiortc + PyAV (FFmpeg), FastAPI + uvicorn |
| Port | TCP 8443 (HTTP signalling); media over UDP ports chosen by ICE |
| Owned resources | USB camera (`/dev/video0`), USB mic (first ALSA capture card) |
| Video to operator | 640×480 @ 10 fps, software-encoded by aiortc (VP8 or H.264, whichever the browser's offer prefers; Chrome lists VP8 first) |
| Audio to operator | Mono Opus, 32 kbps, 60 ms packets encoded by P2 itself (`ResilientAudioTrack`) |
| Shared capture | One open camera and one open mic, fanned out to every viewer (`SharedCapture` / `MediaRelay`) |
| Relay | Operator audio/video decoded and re-encoded to the Robot Screen peer; `screen` data-channel messages forwarded (`talkback.ScreenHub`) |
| Signalling | `POST /webrtc/offer` (operator), `POST /webrtc/screen-offer` (Robot Screen, localhost only) |
| Health endpoint | `GET /health` (JSON) |
| Supervision | P3 |

### P3: Watchdog (Process Supervision)

| Property | Value |
|----------|-------|
| Module | `pi/p3_watchdog` (`python -m p3_watchdog.main`) |
| Framework | Python asyncio + aiohttp |
| Supervises | P1 and P2 (spawned with `subprocess.Popen`) |
| Crash detection | `poll()` on the child every 1 s |
| Hang detection | `GET /health` every 10 s, 5 s timeout; 3 consecutive misses → kill |
| Restart | 10 s cooldown, then respawn |
| Supervised by | systemd, `Restart=on-failure`, `RestartSec=5` |

---

# SECTION 8: MOTOR & SERVO CONTROL SYSTEMS

## 8.1 Motor Control Architecture

```
Motor Configuration (differential drive):
├─ Left pair:  front-left + rear-left   → BTS7960 #1
└─ Right pair: front-right + rear-right → BTS7960 #2

Arduino outputs (arduino/config.h):
├─ Left:  RPWM D5 (forward), LPWM D6 (reverse)
├─ Right: RPWM D9 (forward), LPWM D10 (reverse)
├─ Common enable (both drivers): D4
└─ Only one of RPWM/LPWM is non-zero at a time (no shoot-through)

Speed:
├─ Dashboard slider 0-180 → P1 clamps to 0-180 → firmware accepts 0-255
└─ Ramped: 15 PWM units per 10 ms tick (0 → 180 in 120 ms)

Motor Commands:
├─ Forward (F): both sides forward
├─ Reverse (R): both sides reverse
├─ Left turn (L): left reverse, right forward (pivot)
├─ Right turn (G): left forward, right reverse (pivot)
└─ Stop (S): targets set to 0, ramps down (≤ 120 ms from 180)

Emergency stop (dead-man or gas panic): PWM set to 0 immediately,
no ramp, and the enable line D4 is driven LOW.
```

## 8.2 Servo Control (Pan-Tilt)

| Servo | Pin | Range | Home |
|-------|-----|-------|------|
| **Pan** | D11 | 0-180° | 90° |
| **Tilt** | D3 | 0-180° | 90° |

**Commands:** `P90` (pan to 90°), `T45` (tilt to 45°). Values are clamped
to 0-180 in the firmware and in P1. Both servos are centred at boot.

---

# SECTION 9: SENSOR SUITE & ENVIRONMENTAL MONITORING

## 9.1 Sensor Data Integration

| Sensor | Firmware read interval | WARNING (amber card) | CRITICAL (red card) |
|--------|-----------------------|--------------------------|---------------------------|
| Temperature | 2 s (DHT11) | ≥ 50 °C | ≥ 70 °C |
| Humidity | 2 s (DHT11) | — (display only) | — |
| Gas (MQ-136, raw ADC) | 2 s | ≥ 450 | ≥ 600 |
| Range (HC-SR04) | 50 ms | ≤ 30 cm | ≤ 20 cm |
| GPS | 1 Hz fixes (P1) | "no fix" shown | — |

Thresholds come from `/etc/robot/thresholds.json` (template in
`deploy/etc-robot/`) and the matching defaults in `pi/common/protocol.py`
and `dashboard/src/lib/protocol.ts`. The dashboard's sensor cards use the
built-in defaults.

**Firmware gas panic:** independently of the dashboard, the firmware stops
the motors (`PANIC GAS`) when the raw gas reading is **≥ 1000**
(`GAS_ALARM_THRESHOLD`), and releases them when it falls back.

**Range is advisory only.** The HC-SR04 reading is shown to the operator; it
never blocks or rejects a motor command.

## 9.2 Telemetry Ring Buffer (P1)

```
Structure:
├─ Capacity: 300 snapshots (P1 broadcast snapshots, one per 200 ms)
├─ Duration: 60 seconds of history
├─ Storage: in-process memory only (lost when P1 restarts)
└─ Purpose: replay telemetry to a dashboard that reconnects

Recovery Flow:
├─ Dashboard WebSocket drops
├─ Ring buffer keeps filling
├─ Dashboard reconnects: sends hello, then resume_from {last_ts}
├─ P1: buffer.since(last_ts) → recovery_batch {entries, gap_ms}
└─ Dashboard shows the newest entry and logs
   "recovered N buffered telemetry frames"
```

Details are in Section 25.

---

# PART 3: NETWORK ARCHITECTURE

# SECTION 10: LOCAL WI-FI NETWORK (OVERVIEW)

## 10.1 Network Setup

| Feature | Value |
|---------|-------|
| Network | One ordinary Wi-Fi network (any Wi-Fi router) |
| Pi interface | On-board Wi-Fi (`wlan0`) |
| Pi address | From the router's DHCP, fixed with a reservation in the router's settings |
| Operator laptop | Joins the same Wi-Fi network |
| Security | The Wi-Fi network's WPA2/WPA3 password |

## 10.2 Topology

```
Operator laptop ──Wi-Fi──▶ Wi-Fi router ◀──Wi-Fi── Raspberry Pi 4 (<pi-ip>)

Operator reaches the robot at:  http://<pi-ip>:8080
```

Range depends on the router and the site; see Section 13 and the network
tests N1–N8 in `TEST_REPORT.md`.

---

# SECTION 11: WI-FI LINK QUALITY GUIDE

## 11.1 Link Quality Guide

These are general Wi-Fi planning figures, used for site survey; the system
does not measure them itself (Section 40.3).

| Link Quality | RSSI | Status |
|--------------|------|--------|
| **Excellent** | −30 to −50 dBm | Reliable |
| **Good** | −50 to −65 dBm | Stable |
| **Acceptable** | −65 to −75 dBm | Usable |
| **Poor** | −75 to −80 dBm | Weak |
| **Unusable** | below −80 dBm | Link drops |

**Planning target for teleoperation:** RSSI better than −75 dBm,
ping to the Pi under 200 ms, packet loss under 5 %.

---

# SECTION 12: NETWORK DEPLOYMENT STRATEGY

## 12.1 Pre-Deployment Site Survey

```
CHECKLIST:

Wi-Fi Router:
  ├─ Location: Safe perimeter, elevated, toward the search area
  ├─ Power: Battery or mains
  └─ Check: The Pi keeps its reserved address

Robot (Raspberry Pi Wi-Fi):
  ├─ Position: Keep the Pi's antenna area clear of metal
  └─ Check: The robot stays within the router's range over the course

Operator Laptop:
  └─ Joins the same Wi-Fi network as the robot
```

## 12.2 Link Quality Verification

```bash
# On the Pi: signal and bitrate of the Wi-Fi link
iw dev wlan0 link

# From the operator laptop:
ping -c 20 <pi-ip>                # the Pi
# Target: < 5 % loss, < 200 ms
```

---

# SECTION 13: LINK QUALITY & PERFORMANCE METRICS

## 13.1 Planning Figures (not yet measured on this robot)

| Metric | Good | Acceptable | Poor |
|--------|------|-----------|------|
| **RSSI (dBm)** | > −65 | −65 to −75 | −75 to −80 |
| **Ping to Pi (ms)** | < 60 | 60-200 | > 200 |
| **Packet loss (%)** | < 1 | 1-5 | > 5 |

## 13.2 What the Operator Sees When the Link Degrades

The system has **no signal-strength warning** (Section 40.3). Link problems
show up as:

| Symptom | Cause | Dashboard |
|---------|-------|-----------|
| Video freezes or drops | Media path lost | `DRIVING_LIMITED` (amber) once the WebRTC connection leaves `connected` |
| No telemetry for > 3 s | Control path stalled | `STOP` (red) |
| WebSocket closes | Control path lost | `WS offline`, `STOP`; automatic reconnect with backoff 1-30 s |

In every case the robot itself is protected by the dead-man (Section 6.2).

---

# PART 4: COMMUNICATION PROTOCOLS

# SECTION 14: UART SERIAL PROTOCOL (ARDUINO LINK)

## 14.1 Serial Specifications

| Parameter | Value |
|-----------|-------|
| Physical | USB (Arduino UNO's USB-serial), `/dev/ttyACM0` on the Pi |
| Baud Rate | 115,200 bps, 8-N-1, no flow control |
| Framing | ASCII lines, terminated by `\n` (`\r` ignored) |
| Reset | Opening the port toggles DTR, which resets the UNO |

## 14.2 Command Format (Pi → Arduino)

| Command | Token | Argument | Firmware range | Example | Action |
|---------|-------|----------|-------|---------|--------|
| Forward | F | speed | 0-255 | `F120` | Both sides forward |
| Reverse | R | speed | 0-255 | `R90` | Both sides reverse |
| Left Turn | L | speed | 0-255 | `L80` | Left reverse, right forward |
| Right Turn | G | speed | 0-255 | `G80` | Left forward, right reverse |
| Stop | S | — | — | `S` | Motors to zero (ramped) |
| Heartbeat | H | — | — | `H` | Refresh dead-man |
| Pan Servo | P | angle | 0-180 | `P90` | Pan to 90° |
| Tilt Servo | T | angle | 0-180 | `T45` | Tilt to 45° |
| Status | ? | — | — | `?` | Reply with a `STATUS` line |

P1 never sends a speed above 180 (Section 5.1).

## 14.3 Messages (Arduino → Pi)

**Telemetry** — untagged CSV every **500 ms**, 8 positional fields:

```
temperature_c,humidity_pct,gas_ppm,range_cm,pan_angle,tilt_angle,fw_state,uptime_ms

Example:
28,62,312,47,90,90,1,184320
```

Temperature and humidity are DHT11 integers; `gas_ppm` is the raw ADC
count; `fw_state` is 1 ARMED, 2 DRIVING, 3 STOPPED; `uptime_ms` is `millis()`.

**Tagged lines:**

| Tag | Example | When |
|-----|---------|------|
| `READY` | `READY RESCUE-UNO 1.0.0` | End of boot |
| `ACK` | `ACK F` | Each accepted command (except `?`) |
| `NACK` | `NACK F ARG_RANGE` | Each rejected command |
| `HB` | `HB READY 10345` | Every 1000 ms |
| `STATUS` | `STATUS;FW=RESCUE-UNO;VER=1.0.0;MODE=READY;FAULT=NONE;UPTIME=…;DIR=S;SPD=0;DIST=124;T=28;H=62;GAS=312;GALM=0;PAN=90;TILT=90` | Reply to `?` |
| `PANIC` | `PANIC DEADMAN`, `PANIC GAS` | Fault latched |
| `EVT` | `EVT DEADMAN_CLEARED`, `EVT GAS_CLEARED` | Fault cleared |

P1 parses the CSV lines as telemetry; all other lines are written to the P1
event log (`PANIC` at CRITICAL level).

## 14.4 Validation

**Firmware — four stages (`arduino/command_parser.cpp`):**
1. **Framing:** bytes collected up to `\n`; a line longer than the 32-byte
   buffer is discarded with a `NACK`.
2. **Syntax:** known opcode; numeric argument present and all digits where
   required (`ARG_MISSING`, `ARG_INVALID`, `UNKNOWN`).
3. **Range:** speed 0-255, angle 0-180 (`ARG_RANGE`).
4. **State:** motion commands are rejected (`REJECTED`) unless the mode is
   READY or ACTIVE with no fault latched. `S`, `H`, `?`, `P` and `T` are
   always accepted.

A line that passes stages 1-3 refreshes the dead-man timer, even if stage 4
then rejects it.

**P1 — before anything reaches the serial port (`pi/p1_control/safety.py`):**
1. Message type must be known; observers may not send commands.
2. Direction must be `F/R/L/G`; axis must be `pan`/`tilt`.
3. Speed clamped to 0-180 and angle to 0-180 (a clamp is logged as `CMD_CLAMP`).
4. `seq`, when present, must be greater than the client's last `seq`
   (stale or replayed commands are rejected). `stop_all` skips this check so
   a stop is never dropped.

---

# SECTION 15: WEBSOCKET PROTOCOL (COMMAND & TELEMETRY)

## 15.1 WebSocket Connection

| Aspect | Value |
|--------|-------|
| Server | P1 (FastAPI/uvicorn) |
| Endpoint | `ws://<pi-ip>:8080/control/ws` |
| Keep-alive | uvicorn WebSocket ping every 20 s, 20 s timeout |
| Roles | First client to ask for `controller` gets it; all others are `observer` |
| Reconnect | Dashboard retries with exponential backoff, 1 s to 30 s |

The first message on a new connection must be `hello`; P1 answers with an
`ack`, then sends a telemetry snapshot at once and every 200 ms after that.

## 15.2 Dashboard → P1 Messages

```json
// Session handshake (first message)
{"type": "hello", "role": "controller"}

// Resume after reconnect (sent right after hello)
{"type": "resume_from", "last_ts": 1727430000123}

// Motor command — dir is the wire letter F | R | L | G
{"type": "motor", "dir": "F", "speed": 120, "seq": 17}

// Servo command
{"type": "servo", "axis": "pan", "angle": 90, "seq": 18}

// Heartbeat (every 500 ms)
{"type": "heartbeat"}

// Stop (release of a drive control, ■ button, or EMERGENCY STOP)
{"type": "stop_all"}
```

P1 turns these into serial commands: `motor` → `F/R/L/G<speed>`,
`servo` → `P/T<angle>`, `heartbeat` → `H`, `stop_all` → `S`.

## 15.3 P1 → Dashboard Messages

```json
// Handshake reply
{"type": "ack", "of": "hello", "role": "controller", "session": "<uuid>"}

// Telemetry snapshot (every 200 ms)
{
  "type": "telemetry",
  "seq": 1520,
  "server_ts": 1727430000123,
  "temperature_c": 28,
  "humidity_pct": 62,
  "gas_ppm": 312,
  "range_cm": 47,
  "pan_angle": 90,
  "tilt_angle": 90,
  "fw_state": 1,
  "uptime_ms": 184320,
  "lat": 23.810312,
  "lon": 90.412511,
  "gps_fix": true,
  "gps_sats": 8,
  "turn_status": "unavailable",
  "serial_ok": true,
  "ws_clients": 1
}

// Recovery batch (reply to resume_from)
{
  "type": "recovery_batch",
  "entries": [ { ...telemetry snapshot... }, ... ],
  "gap_ms": 0
}

// Rejection
{"type": "error", "code": "rejected", "message": "observer role cannot send commands"}
```

P1 broadcasts every 200 ms from the **latest** Arduino frame, so with the
firmware sending every 500 ms, consecutive snapshots may repeat the same
sensor values with a new `seq` and `server_ts`.

---

# SECTION 16: WEBRTC MEDIA INTERFACE (TWO-WAY VIDEO, AUDIO & MESSAGING)

## 16.1 WebRTC Connection

| Aspect | Value |
|--------|-------|
| Server | P2 (aiortc) |
| Signalling | `POST http://<pi-ip>:8443/webrtc/offer` — full SDP offer in, SDP answer out (no trickle ICE) |
| ICE | Host candidates on the local network; the dashboard creates its peer connection without STUN/TURN servers |
| Transceivers | One video and one audio transceiver, both `sendrecv` |
| Data Channel | Label `screen` (ordered, reliable), created by the dashboard |
| Browser requirement | For the laptop mic/camera, the page must be a secure context: HTTPS, or Chrome/Edge with `chrome://flags/#unsafely-treat-insecure-origin-as-secure` set to `http://<pi-ip>:8080`. Robot video, images and text work without it |

## 16.2 Media Tracks

| Track | Direction | Content | Codec / rate |
|-------|-----------|---------|--------------|
| 1 | Robot → Operator | Robot camera | VP8 or H.264 (software, aiortc), 640×480 @ 10 fps; aiortc's rate control (VP8 starts at 500 kbps) |
| 2 | Robot → Operator | Robot microphone | Mono Opus, 32 kbps, one packet per 60 ms (encoded by P2) |
| 3 | Operator → Robot display | Laptop camera (640×480 @ 10 fps), still image (canvas at 1024×600) or screen share (5 fps) | Browser's choice |
| 4 | Operator → Robot speaker | Laptop mic, push-to-talk (echo cancellation, noise suppression, AGC on) | Opus |

Tracks 3 and 4 are optional: nothing is sent until the operator chooses a
source or holds Talk. With nothing sent, the robot display shows the idle
screen "Help is coming — Stay where you are. The rescue team can see and
hear you through this robot."

**Screen audio (P2 → Robot Screen).** P2 decodes the operator's voice and
re-encodes it itself as **mono Opus, 32 kbps, one packet per 60 ms**, with a
120 ms cushion after silence and a 400 ms cap on buffered voice. This
replaced 20 ms frames, which a busy Pi could not send on time (speech
arrived sped up with pieces missing). See `SOFTWARE_ARCHITECTURE.md`, A.11.

**Robot audio (P2 → dashboard).** The robot mic goes out the same way:
P2 encodes **mono Opus, 32 kbps, one packet per 60 ms** itself instead of
leaving 20 ms frames to aiortc's shared encoder thread pool, which on a busy
Pi sent only ~75 % of the audio and made it choppy. If the mic cannot be
opened, or drops off USB, the session gets silence and P2 retries every
2 s, switching back to the mic as soon as it returns.

**Video source options (Track 3):**

| Source | Browser API | Use |
|--------|-------------|-----|
| Laptop camera | `getUserMedia({video: 640×480, 10 fps})` | Show the operator's face |
| Image file | `<canvas>.captureStream(2)`, repainted to keep frames flowing | Show a picture (instructions, map, photo) |
| Screen / window | `getDisplayMedia({video: 5 fps})` | Show anything on the operator's screen |
| None | track stopped | Idle screen |

**Floor control:** only one operator session at a time may send media or
messages to the robot. The first session to send anything holds the floor
until it releases it or disconnects; others get `floor_denied` and stay
watch/listen-only.

## 16.3 Data Channel — Robot Screen Messages

| Message | Direction | Example | Effect |
|---------|-----------|---------|--------|
| `screen_text` | Operator → Robot | `{"type":"screen_text","text":"Stay calm, help is coming","ts":1727430000}` | Large text banner (trimmed, max 280 chars) |
| `screen_clear` | Operator → Robot | `{"type":"screen_clear"}` | Removes the banner |
| `screen_ack` | Robot → Operator | `{"type":"screen_ack","ts":1727430000}` | Confirms the text is on screen (dashboard shows ✓) |
| `media_state` | Operator → Robot | `{"type":"media_state","talking":true,"video":"camera"}` | Relayed as `screen_state`; shows "🎤 Rescuer is speaking" and hides the idle screen while video is active |
| `floor_release` | Operator → P2 | `{"type":"floor_release"}` | Frees the robot screen and clears it to idle |
| `talk_status` | P2 → Operator | `{"type":"talk_status","screen_online":true,"floor":"you","display_mode":"robot"}` | Robot-screen status and who holds the floor (`free`/`you`/`other`) |
| `floor_denied` | P2 → Operator | `{"type":"floor_denied"}` | Another operator holds the screen |
| `display_mode` | Operator → P2 | `{"type":"display_mode","mode":"vnc"}` | Switch the robot display (no floor needed) |

## 16.3.1 Display Mode — Robot Display ⇄ VNC

VNC on the Pi mirrors the robot display itself, so the full-screen kiosk
also covers an operator's VNC session. P2 holds a display mode:

| Mode | Robot display shows | Switched by |
|------|---------------------|-------------|
| `robot` (default at every P2 start) | Robot Screen kiosk | Dashboard *Robot Display* radio, *Show Robot Screen* menu entry on the Pi, `robot-screen.sh robot` |
| `vnc` | Pi desktop (kiosk closed) | Dashboard *VNC Mode* radio, holding the kiosk's *Hold 3 s for VNC* button, closing the kiosk (Alt+F4), `robot-screen.sh vnc` |

The kiosk launcher polls `GET /screen/mode` every second and opens or closes
Chromium to match. While in `vnc` mode the dashboard warns that the victim
cannot see the operator. The kiosk's button only reacts to a pointer held
for 3 s and ignores keys, so a stray click or key press from a VNC viewer
cannot switch the mode; a viewer can still send Alt+F4, so close it while
talking to a victim.

Messages travel through P2, never through P1, so the safety-critical
command/telemetry path is unaffected by the talk-to-victim feature.

## 16.4 Signalling Flow

```
Operator dashboard:
1. new RTCPeerConnection(); add sendrecv video + audio transceivers
2. createDataChannel("screen")
3. createOffer → setLocalDescription
4. POST /webrtc/offer {sdp, type} → P2 answers with {sdp, type}
5. setRemoteDescription(answer); ICE connects; robot video/audio play
6. Operator holds Talk / picks a video source → tracks attached to the
   existing senders (no renegotiation)
7. P2 relays tracks and `screen` messages to the Robot Screen peer

If P2 is not up yet (e.g. just after boot), the dashboard retries every
3 s until the first connection succeeds. After a later failure it shows
"video error" and a **Retry video** button.

Robot Screen (on the Pi, after desktop login):
1. robot-screen.sh waits for P2, then opens Chromium --kiosk
   http://localhost:8443/screen
2. Page: POST /webrtc/screen-offer (recv-only video/audio + data channel);
   P2 accepts it only from localhost
3. P2 answers; the page shows the idle screen until operator media arrives
```

---

# SECTION 17: REST ENDPOINTS & HEALTH CHECKS

## 17.1 P1 Endpoints (port 8080)

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/health` | GET | Health (P3 supervision) | 200, JSON `{serial_connected, ws_clients, gps_fix, uptime_s}` |
| `/api/ice-config` | GET | ICE server configuration (rate-limited, 5 per minute per client) | 200 JSON, or 429 |
| `/api/session` | GET | Session id, mock flag, thresholds, cadences | 200 JSON |
| `/api/gps-track` | GET | GPS track of this P1 session | 200, GeoJSON `LineString` |
| `/maps/<file>` | GET | Offline map files from `MAP_DIR` (only when that folder exists); supports HTTP range requests | 200 / 206, or 404 |
| `/control/ws` | WS | Control WebSocket | 101 Switching Protocols |
| `/` | GET | Built dashboard (static files) | 200 HTML |

## 17.2 P2 Endpoints (port 8443)

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/health` | GET | Health (P3 supervision) | 200, JSON `{status, camera_open, active_streams, mock_hardware, screen_connected, floor_held, display_mode}` |
| `/webrtc/offer` | POST | WebRTC signalling (operator) | 200 JSON SDP answer, or 500 |
| `/webrtc/screen-offer` | POST | WebRTC signalling (Robot Screen, localhost only) | 200 JSON SDP answer, or 403 |
| `/screen` | GET | Robot Screen kiosk page | 200 HTML |
| `/screen/mode` | GET | Current display mode (`robot` / `vnc`), polled by the kiosk launcher | 200 JSON |
| `/screen/mode` | POST | Switch display mode (kiosk hold button, desktop shortcut, launcher; localhost only) | 200 JSON, 403 or 422 |

## 17.3 Health Check Semantics

```
P3, per child (P1 and P2), independently:
├─ Every 1 s:  poll() the child process → exited = crash
├─ Every 10 s: GET /health, 5 s timeout → non-200 or timeout = miss
├─ 3 consecutive misses → SIGKILL the child (treated as a hang)
└─ After a crash or kill: 10 s cooldown, then respawn
```

`/health` answers 200 whenever the process's event loop is running; it
reports `serial_connected` but does not fail when the Arduino is missing
(Section 40.3).

---

# SECTION 18: PROTOCOL INTEROPERABILITY & ERROR HANDLING

## 18.1 Protocol Stack Integration

```
Layer 4: React dashboard
  ├─ WebSocket client (TCP, reliable) → P1
  └─ WebRTC client (UDP/RTP + SCTP data channel) → P2

Layer 3: Local Wi-Fi network
  └─ One Wi-Fi router, transparent to IP

Layer 2: Raspberry Pi (Linux)
  ├─ P1: WebSocket server + serial bridge + GPS
  ├─ P2: WebRTC media server + Robot Screen relay
  └─ P3: supervision of P1 and P2

Layer 1: Arduino
  ├─ Serial commands in (from P1)
  ├─ PWM out (motors, servos)
  └─ Sensor input (ADC, digital, pulse timing)
```

## 18.2 Error Handling & Recovery

| Error | Detection | Response | Recovery |
|-------|-----------|----------|----------|
| **WebSocket loss** | `onclose` in the dashboard | `WS offline`, mission `STOP`; P1 sends `S` if the controller left | Auto-reconnect (1-30 s backoff), then `resume_from` |
| **Telemetry stalls** | No telemetry for > 3 s (heartbeat counter) | Mission `STOP` | Clears on the next telemetry frame |
| **WebRTC loss** | Peer connection leaves `connected` | Mission `DRIVING_LIMITED`; video panel shows an error | Operator clicks **Retry video** |
| **GPS fix loss** | `gps_fix=false` | GPS card "no fix"; marker hidden | Resumes on next fix |
| **No commands reach the Arduino** | Firmware dead-man (2000 ms) | Motors stop, `PANIC DEADMAN` | Clears when commands resume |
| **Gas over firmware limit** | Raw ADC ≥ 1000 | Motors stop, `PANIC GAS` | Clears when the reading drops |
| **P1 crash** | P3 `poll()` (1 s) | Respawn after 10 s cooldown | Dashboard reconnects on its own |
| **P2 crash** | P3 `poll()` (1 s) | Respawn after 10 s cooldown | Operator clicks **Retry video** |
| **P1/P2 hang** | 3 missed `/health` checks (~30 s) | SIGKILL, then respawn | As above |
| **Operator mic/camera denied** | `getUserMedia` rejects, or page not a secure context | Error shown on the talk panel | Grant permission / use HTTPS or the Chrome flag |
| **Robot Screen offline** | Screen peer not connected | Dashboard shows "robot screen offline" | Launcher relaunches Chromium after 3 s |
| **Arduino unplugged** | Serial read/write raises | `serial_ok=false` → mission `STOP` | Needs a P1 restart (Section 40.3) |

---

# PART 5: EMBEDDED SOFTWARE ARCHITECTURE

# SECTION 19: RASPBERRY PI PROCESS ARCHITECTURE (P1, P2, P3)

## 19.1 Process Isolation & Decoupling

```
systemd
└─ robot-watchdog.service (User=robot, KillMode=control-group)
   └─ P3 watchdog (python -m p3_watchdog.main)
      ├─ P1 control (python -m p1_control.main)
      │  ├─ Resources: Arduino serial, GPS serial, TCP 8080, p1.lock
      │  └─ Failure effect: control/telemetry only
      └─ P2 media (python -m p2_media.main)
         ├─ Resources: camera, mic, TCP 8443, WebRTC UDP ports
         └─ Failure effect: media and talk-to-victim only

Desktop session (autologin user)
└─ robot-screen.sh (autostart) → Chromium --kiosk /screen
   ├─ Resources: HDMI display, speaker (via the browser)
   ├─ Crash: relaunched after 3 s
   └─ Failure effect: victim-side display/speaker only

KEY: P1 and P2 share no memory and no IPC. P3 observes them only
through process status and HTTP /health. A crash in P1 or P2 does
not affect the other.
```

If P3 itself exits abnormally, systemd stops the whole service (P3, P1, P2)
and starts it again after 5 s, so P1 and P2 are respawned too.

---

# SECTION 20: P1 CONTROL SERVER (FASTAPI/UART/WEBSOCKET)

## 20.1 P1 Responsibilities

```
Startup (Section 35):
├─ Acquire /run/robot/p1.lock (exit 0 if another P1 holds it)
├─ Open the Arduino port exclusively; Arduino handshake
└─ Start GPS thread, telemetry log, 200 ms broadcast loop, HTTP server

Serial Bridge (Arduino):
├─ Transmit validated commands (F/R/L/G/S/H/P/T/?)
├─ Read lines every 5-20 ms; CSV lines → latest telemetry frame
├─ Other lines (READY, ACK, NACK, HB, PANIC, EVT) → event log
└─ serial_ok = false if a read or write raises

GPS Reader (NEO-6M on /dev/serial0, 9600 baud):
├─ Own thread; parses RMC and GGA sentences (any talker, e.g. $GP/$GN)
│  with checksum verification
├─ Publishes lat, lon, gps_fix, gps_sats
└─ Keeps the session track (a point only once the robot is ≥ 10 m from
   the last one, so GPS drift around a stationary robot adds nothing)

Telemetry:
├─ Every 200 ms: merge latest Arduino frame + GPS + seq/server_ts/
│  serial_ok/ws_clients → snapshot
├─ Append to ring buffer (300)
├─ Write to telemetry.log at most once per second
└─ Broadcast to all WebSocket clients (concurrently; a slow client
   does not delay the others)

WebSocket Server:
├─ hello → role (one controller, others observers) → ack
├─ resume_from → recovery_batch
├─ motor / servo / heartbeat / stop_all → validate → serial
└─ Controller disconnects → send S immediately

Shutdown:
└─ Send S, close the port, write the GPS track as GeoJSON
```

---

# SECTION 21: P2 MEDIA SERVER (AIORTC/WEBRTC) & ROBOT SCREEN

## 21.1 P2 Responsibilities

```
USB Camera (Video, robot → operator):
├─ Open: /dev/video0 via PyAV (V4L2), 640×480, 10 fps
├─ Shared: one open device, relayed to every viewer (newest frame only)
├─ Encode: software, per viewer, by aiortc (VP8 or H.264)
├─ Fallback: synthetic test pattern if the camera cannot be opened
└─ Output: Track 1

Audio (Two-Way):
├─ Microphone (victim → operator):
│  ├─ Capture: first ALSA capture card, via PyAV with its own ALSA
│  │  config (p2_media/alsa.conf)
│  ├─ Shared: one open device fanned out to every session (MediaRelay,
│  │  buffered so no audio frame is skipped)
│  ├─ Encode: by P2, mono Opus, 32 kbps, 60 ms packets
│  ├─ Fallback: silence while the mic cannot be opened; retried every
│  │  2 s, switching back to the mic when it returns
│  └─ Output: Track 2
│
├─ Speaker (operator → victim):
│  ├─ Receive: Track 4 (Opus, push-to-talk)
│  ├─ Relay: Decoded, re-encoded to Robot Screen peer (mono Opus, 60 ms packets, 120 ms cushion)
│  └─ Playback: Robot Screen page → speaker (3.5 mm jack, the default PipeWire sink)

Operator Video & Messages (operator → victim):
├─ Receive: Track 3 (camera, image or screen share)
├─ Receive: `screen` data channel messages
├─ Floor control: first sending operator holds the floor
├─ Every inbound track is drained, but only the floor holder's frames
│  are forwarded
└─ Relay: re-encoded to the Robot Screen peer; the last frame is
   repeated after 1 s so a still image stays on screen

Robot Screen (victim-facing display):
├─ Runs: Chromium --kiosk http://localhost:8443/screen
├─ Launcher: robot-screen.sh from desktop autostart (relaunch on crash)
├─ Connects: POST /webrtc/screen-offer (localhost only); a new screen
│  connection replaces the old one
├─ Display mode: shown in `robot` mode, closed in `vnc` mode (Section 16.3.1)
├─ Shows: Operator video full-screen, text banner on top
├─ Plays: Operator voice through the speaker
└─ Idle: "Help is coming" when no media

WebRTC Session (per operator):
├─ POST /webrtc/offer → new RTCPeerConnection, add Tracks 1-2
├─ setRemoteDescription(offer) → createAnswer → return answer
├─ on track: hand Tracks 3-4 to the ScreenHub
├─ on datachannel "screen": hand messages to the ScreenHub
└─ Connection failed/closed → release the floor if held, close
```

---

# SECTION 22: P3 WATCHDOG & PROCESS SUPERVISION

## 22.1 Supervision Strategy

```
Per child (P1, P2), one asyncio task each:

SPAWN ──► MONITOR ──(exit or 3 health misses)──► COOLDOWN (10 s) ──► SPAWN

MONITOR, every 1 s:
├─ proc.poll() → exited?  → record exit code → COOLDOWN
└─ every 10 s: GET /health (5 s timeout)
   ├─ 200 → misses = 0
   └─ otherwise → misses += 1; at 3 → SIGKILL → COOLDOWN

Exit codes (from P1):
├─ 0  lock already held by another P1 → logged as PROC_LOCK_HELD
├─ 1  lock error
├─ 2  Arduino handshake failed → crash
└─ 3  invalid configuration → logged as PROC_CONFIG_INVALID
Every case is still retried after the 10 s cooldown.

Detection latency:
├─ Crash (process exits): ≤ 1 s
└─ Hang (alive, not answering): 20-30 s (3 missed checks, 10 s apart)

Recovery time (crash → serving again, design estimate):
├─ Detection ≤ 1 s + cooldown 10 s
├─ P1: 2 s Arduino boot wait + 0.6 s stops + READY (≤ 5 s timeout)
├─ P2: import + HTTP server start
└─ Total: ~13-16 s for P1; a little less for P2
```

P3 logs every event to `/var/log/robot/p3_events.log` (`PROC_SPAWN`,
`PROC_CRASH`, `HEALTH_MISS`, `PROC_KILL`, …).

---

# SECTION 23: FAULT-TOLERANCE MECHANISMS

## 23.1 Three-Tier Supervision Hierarchy

```
TIER 1 (Firmware Level):
└─ Arduino Dead-Man Timer
   ├─ Trigger: no valid command for 2000 ms
   ├─ Action: PWM 0 on all motor pins, driver enable LOW, PANIC DEADMAN
   ├─ Latency: ≤ 2010 ms
   └─ Guarantee: motors stop without the network or the Pi

   Supporting: P1 sends S as soon as the controlling dashboard
   disconnects, and three S commands on every P1 start.

TIER 2 (Application Level):
└─ P3 Watchdog
   ├─ Monitors: P1 and P2 (poll 1 s, /health 10 s)
   ├─ Action: SIGKILL if hung; respawn after 10 s cooldown
   └─ Guarantee: a crashed or hung process is restarted

TIER 3 (OS Level):
└─ systemd (robot-watchdog.service)
   ├─ Monitors: P3
   ├─ Trigger: abnormal exit (Restart=on-failure)
   ├─ Action: stop the control group, restart after 5 s
   └─ Guarantee: supervision comes back without operator action

Kiosk: robot-screen.sh relaunches Chromium 3 s after a crash.
```

---

# SECTION 24: SYSTEM INTEGRATION & DATA FLOW

## 24.1 Data Flow Diagram

```
Telemetry Path:
Arduino
  ├─ HC-SR04 (50 ms), DHT11 + MQ-136 (2 s)
  └─ CSV telemetry every 500 ms ──USB serial──▶ P1
                                                 │
NEO-6M GPS ──/dev/serial0──▶ P1 GPS thread ──────┤
                                                 ▼
                         P1: snapshot every 200 ms
                           ├─▶ ring buffer (300)
                           ├─▶ telemetry.log (1 Hz)
                           └─▶ WebSocket broadcast ──▶ Dashboard
                                                         ├─ Sensor cards
                                                         ├─ GPS card + map
                                                         └─ Mission state

Motor Command Path:
Dashboard (button / key press, slider speed)
  └─ {"type":"motor","dir":"F","speed":120,"seq":n} ──WebSocket──▶ P1
       ├─ role check, clamp, seq check
       └─ "F120\n" ──USB serial──▶ Arduino
            ├─ 4-stage validation, dead-man refresh
            ├─ ACK F
            └─ Ramp PWM toward target (10 ms ticks)
  Release → {"type":"stop_all"} → "S\n" → ramp to 0

Media Path (robot → operator):
USB camera ──▶ P2 (shared capture) ──encode──▶ Track 1 ──▶ Dashboard <video>
USB mic    ──▶ P2 (shared capture) ──Opus───▶ Track 2 ──▶ Dashboard (muted
                                                            until "Listen")

Talk-to-Victim Path (operator → victim):
Operator Laptop
  ├─ Laptop mic (push-to-talk) → Opus → Track 4
  ├─ Laptop camera / image / screen → Track 3
  ├─ Message box → `screen` data channel
  │
  └─ WebRTC → P2 (floor control) → decode + re-encode
     └─ Robot Screen (Chromium kiosk on Pi)
        ├─ Robot display: operator video + text banner
        └─ Speaker: operator voice
```

---

# PART 6: DATA MANAGEMENT & STORAGE

# SECTION 25: TELEMETRY RING BUFFER & RECOVERY MECHANISM

## 25.1 Ring Buffer Structure (`pi/p1_control/ring_buffer.py`)

```
├─ Capacity: 300 snapshots (RING_BUFFER_SIZE)
├─ Element: the full telemetry snapshot dict broadcast by P1
│  (17 data fields + "type"; Section 15.3)
├─ Cadence: one append per 200 ms broadcast
├─ Span: 60 s
├─ Storage: Python list used as a circular buffer, in P1's memory
├─ Lifespan: P1 process lifetime (lost on restart)
└─ Overflow: oldest entry overwritten
```

## 25.2 Recovery Algorithm

```
Dashboard reconnects:
├─ Sends {"type":"hello","role":"controller"}
└─ If it has seen telemetry before:
   {"type":"resume_from","last_ts": <server_ts of the last snapshot>}

P1:
├─ entries = snapshots with server_ts > last_ts (oldest first)
├─ gap_ms  = oldest_retained_ts − last_ts if positive, else 0
│            (history lost because the client was away > 60 s)
└─ Sends {"type":"recovery_batch","entries":[…],"gap_ms":…}

Dashboard:
├─ Takes the newest entry as the current telemetry
└─ Logs "recovered N buffered telemetry frames" in the alert log
```

The dashboard does not yet draw the replayed entries (for example as a
path on the map); the map's history comes from `/api/gps-track` instead
(Section 27).

---

# SECTION 26: TELEMETRY PIPELINE & VISUALIZATION

## 26.1 Telemetry Data Flow

```
Arduino (every 500 ms):
└─ Serial.print CSV: "28,62,312,47,90,90,1,184320\n"
   (~28 bytes ≈ 2.5 ms on the wire at 115,200 baud)

P1 serial reader (polls every 5-20 ms):
├─ parse_telemetry_line(): ≤ 80 chars, exactly 8 fields,
│  each cast and range-checked (e.g. range_cm 0-500, fw_state 1-3)
├─ Malformed frame → dropped (the next one follows in 500 ms)
└─ Valid frame → becomes the "latest frame"

P1 broadcast loop (every 200 ms, drift-corrected):
├─ Build snapshot = latest frame + GPS + P1 fields
├─ Ring buffer, telemetry.log (1 Hz), WebSocket broadcast
└─ Keeps running even if a broadcast fails

Dashboard:
├─ Parses JSON, stores it in React state (useState in useControlSocket)
├─ Re-renders sensor cards, GPS card, map, servo slider positions
└─ Resets the "time since last reply" counter used by the mission state
```

## 26.2 Sensor Display & Alerts

| Sensor | Display Format | WARNING (amber) | CRITICAL (red) |
|--------|-----------------|-----------------|----------------|
| Temperature | "28.0 °C" | ≥ 50 °C | ≥ 70 °C |
| Humidity | "62.0 %" | — | — |
| Gas | "312 ppm" (raw ADC count) | ≥ 450 | ≥ 600 |
| Range | "47 cm" | ≤ 30 cm | ≤ 20 cm |
| GPS | "23.810312, 90.412511" + satellites | "no fix" | — |

---

# SECTION 27: GPS PATH TRACKING & MAPPING

## 27.1 GPS Visualization (Leaflet / react-leaflet)

```
Map:
├─ Position: bottom of the screen, one map across the middle and right
│  columns, under the video and the sensor/alerts column
├─ Offline background: area.pmtiles (Protomaps vector tiles, zoom 0-15)
│  from MAP_DIR on the Pi (default /var/lib/robot/maps), served by P1 at
│  /maps and drawn in the browser; needs no internet
├─ Online background: OpenStreetMap tiles from tile.openstreetmap.org,
│  shown only outside the offline map's area (blank without internet)
├─ Zoom 17; default centre 23.8103, 90.4125 until a fix arrives
└─ Robot marker: blue dot, shown only while gps_fix = true

Locate / follow button (bottom-right of the map):
├─ Follow mode starts on: the map keeps the robot centred as fixes arrive
├─ Dragging the map turns it off (button turns white)
├─ Clicking flies to the robot and turns it back on (button turns blue)
└─ Greyed out while there is no fix

Live Path (blue #2196F3, weight 3):
├─ A point only once the robot is ≥ 10 m from the last one
└─ Keeps the last 1000 points in the browser (~10 km of driving)

Session Track (light blue #90CAF9, weight 3):
├─ Loaded once when the dashboard opens: GET /api/gps-track
└─ All positions P1 has recorded since it started (same 10 m rule)

Persistence:
└─ When P1 stops, the track is written to
   /var/log/robot/gps_track/session_<session-id>.geojson
```

No gap markers are drawn; a period without a fix simply adds no points.
The 10 m rule keeps GPS drift out of the path: a fix wanders by about
10 m around a stationary robot (more with only 4 satellites), and
recording every change once drew thousands of points in one spot. With
few satellites an occasional jump over 10 m can still add a short stray
segment.

## 27.2 Offline Map

The map file is made once per operating area with the `pmtiles` tool,
which cuts a rectangle out of the free Protomaps world map (built from
OpenStreetMap data):

```
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles area.pmtiles \
  --bbox=<west>,<south>,<east>,<north> --maxzoom=15
sudo cp area.pmtiles /var/lib/robot/maps/
```

The current file covers 91.072-91.227 E, 23.431-23.489 N (about
16 km × 6 km, including BAIUST) and is 2.9 MB. The browser reads only the
parts of the file it shows (HTTP range requests), and the map code loads
as a separate chunk after the dashboard starts, so neither the dashboard's
first load nor P1's control path is slowed: under repeated map panning,
P1's median `/health` time rose from 5.9 ms to 6.5 ms. With no map
folder, P1 does not add the `/maps` route and the map uses online tiles
only, as before.

---

# SECTION 28: LOGGING, LOG ROTATION & STORAGE

## 28.1 Log Files (`/var/log/robot/`)

| File | Writer | Content | Rate |
|------|--------|---------|------|
| `telemetry.log` | P1 | CSV, 18 columns (`iso_ts, seq`, the 8 Arduino fields, `lat, lon, gps_fix, gps_sats, serial_ok, ws_clients, turn_status, alert_flags`) | 1 line/s (~93 bytes) |
| `p1_events.log` | P1 | Events: session, handshake, WebSocket, every serial line in/out (`DEBUG_RX`/`DEBUG_TX`) | Per event |
| `p2_events.log` | P2 | Events: WebRTC sessions, floor, display mode, device errors | Per event |
| `p3_events.log` | P3 | Events: spawn, crash, health misses, kills | Per event |
| `gps_track/session_<id>.geojson` | P1 | GPS track, written on P1 shutdown | Per session |

Event line format:

```
[2026-09-27T10:15:02.113+00:00][P1][INFO][HANDSHAKE_OK][arduino ready]
[2026-09-27T10:15:04.520+00:00][P1][INFO][WS_CONNECT][client connected]{client=c1 total=1}
```

`alert_flags` packs threshold crossings into bits: 0 temp_warn, 1
temp_crit, 2 gas_warn, 3 gas_crit, 4 range_warn, 5 range_crit, 7 gps_lost
(bit 6 unused).

## 28.2 Rotation (`deploy/logrotate/robot`)

| Files | Policy |
|-------|--------|
| `telemetry.log` | daily or 50 MB, keep 7, compressed |
| `p1_events.log`, `p2_events.log` (plus `watchdog.log`, `fault.log`, which no code writes) | weekly or 10 MB, keep 8, compressed |
| `session.log` (no code writes it) | monthly or 5 MB, keep 12 |

`p3_events.log` is not in the rotation policy, and the clean-up of old GPS
tracks (a `find … -mtime +90 -delete` cron line in the comments) is not
installed by `install.sh`. Both are listed in Section 40.3.

## 28.3 Storage Estimate

```
telemetry.log: 93 bytes × 86,400 s ≈ 8 MB/day before compression
p1_events.log: dominated by DEBUG_RX/DEBUG_TX lines — every Arduino
               ACK and HB line and every command is logged, so it grows
               faster than telemetry.log while a dashboard is connected
Retention:     7 days of telemetry + 8 weeks of events; a 16 GB or
               larger microSD card leaves ample room
```

---

# SECTION 29: PIN CONFIGURATION & DEVICE INTERFACES

## 29.1 Arduino UNO Pin Allocation (`arduino/config.h`)

| Pin | Function | Notes |
|-----|----------|-------|
| D0 / D1 | Serial RX / TX | Used by the USB-serial link to the Pi |
| D3 | Tilt servo | ServoTimer2Plus (Timer2) |
| D4 | Motor driver enable | Both BTS7960s |
| D5 | Left RPWM (forward) | Timer0 PWM |
| D6 | Left LPWM (reverse) | Timer0 PWM |
| D7 | HC-SR04 TRIG | Output |
| D8 | HC-SR04 ECHO | Input, `pulseIn` |
| D9 | Right RPWM (forward) | Timer1 PWM |
| D10 | Right LPWM (reverse) | Timer1 PWM |
| D11 | Pan servo | ServoTimer2Plus (Timer2) |
| D13 | Status LED | Toggles every 1 s |
| A2 | DHT11 data | Bit-banged single wire |
| A3 | MQ-136 analog out | `analogRead`, 0-1023 |

## 29.2 Raspberry Pi Interfaces

| Interface | Device | Purpose |
|-----------|--------|---------|
| USB | `/dev/ttyACM0` | Arduino UNO (serial) |
| GPIO14 / GPIO15 (UART) | `/dev/serial0` | NEO-6M GPS, 9600 baud |
| USB | `/dev/video0` | Logitech C270 camera |
| USB | First ALSA capture card (e.g. "U20") | USB microphone (P2 picks it by card id) |
| 3.5 mm jack | ALSA card "Headphones" (default PipeWire sink) | Speaker |
| micro-HDMI 0 | HDMI-A-1 | Robot display (Robot Screen kiosk) |
| Wi-Fi | wlan0, address reserved in the Wi-Fi router | Local Wi-Fi network |

---

# PART 7: OPERATIONAL MODES & STATES

# SECTION 30: OPERATIONAL MODES

## 30.1 Mode 1: Primary — Local Network Only (implemented, default)

```
Network path: Operator → Wi-Fi router → Pi → Arduino

Services: P3 ✓ → P1 ✓, P2 ✓; Robot Screen kiosk ✓
Capability:
├─ Motor control: ✓ 4 directions, speed 0-180
├─ Servo control: ✓ pan/tilt 0-180°
├─ Telemetry: ✓ 4 sensors + GPS, 200 ms broadcast
├─ Video: ✓ 640×480, 10 fps
├─ Audio: ✓ two-way (robot mic; operator push-to-talk)
├─ Talk-to-victim: ✓ operator video/image + text on the robot display
├─ GPS tracking: ✓ live path + session track, follow mode, offline map
│  for the operating area
├─ Logging: ✓ telemetry + event logs on the Pi
└─ Internet dependency: none for control, media or telemetry

Config: ENABLE_OVERLAY=0 in /etc/robot/p3.env.
```

## 30.2 Mode 2: Internet Overlay (not implemented)

A remote-operator mode through an internet tunnel with a TURN relay was
planned. The code keeps the hooks (`ENABLE_OVERLAY`, the `turn` field of
`/api/ice-config`, the `turn_status` telemetry field, which currently always
reads `unavailable`), but no tunnel or TURN server is installed or started.

## 30.3 Mode 3: Degraded — Media Down, Control Up

```
Trigger: P2 crash or hang (camera/mic fault, WebRTC failure)

Services: P1 ✓, P2 ✗ (P3 respawns it), P3 ✓
Capability:
├─ Motor control: ✓ (WebSocket, P1)
├─ Telemetry + GPS: ✓
├─ Video / audio: ✗
├─ Talk-to-victim: ✗ (kiosk keeps its last page; reconnects when P2 returns)
└─ Mission state: DRIVING_LIMITED (amber)

Recovery:
├─ P3 detects the crash (≤ 1 s) or hang (~30 s)
├─ 10 s cooldown, P2 respawned
└─ Operator clicks "Retry video" on the dashboard

If only the camera or mic fails to open, P2 keeps running and sends a
synthetic test pattern or silence instead. The mic is retried every 2 s,
so robot audio returns by itself once the mic is back.
```

## 30.4 Mode 4: Degraded — Control Down

```
Trigger: WebSocket lost (network, P1 crash, laptop)

Robot: P1 sends S on controller disconnect (if P1 is alive); the
       Arduino dead-man stops the motors ≤ 2 s after the last command.
Dashboard: STOP (red), "WS offline", reconnects automatically
           (1 s, doubling to 30 s), then replays missed telemetry.
```

No fallback network is provisioned; the operator and the Pi share one
Wi-Fi network.

## 30.5 Mode 5: Pi Offline — Arduino Alone

```
Trigger: Pi power loss, SD card failure, or a total freeze

Arduino behaviour:
├─ No commands → dead-man fires after 2000 ms → PANIC DEADMAN
├─ Motors stopped, drivers disabled; motion commands would be refused
├─ Keeps reading sensors and printing telemetry to the (unread) serial
└─ Status LED keeps toggling every 1 s

Operator: no telemetry, video or control until the Pi is back.

Recovery:
├─ Pi boots → systemd starts P3 → P3 starts P1
├─ P1 opens the port (resets the UNO), handshake, commands resume
└─ Dashboard reconnects on its own
```

---

# SECTION 31: MISSION STATE MACHINE (4-STATE)

## 31.1 Rules (`deriveMissionState`, first match wins)

```
1. STOP             if  WebSocket disconnected
                    or  serial_ok = false
                    or  no telemetry for > 3000 ms
2. DRIVING_LIMITED  if  WebRTC video not connected
3. DRIVING          if  fw_state = 2 (Arduino ACTIVE)
4. READY            otherwise
```

The "no telemetry" timer counts up 500 ms with each heartbeat the dashboard
sends and resets to 0 on every telemetry message.

## 31.2 States

| State | Colour | Meaning | Operator action |
|-------|--------|---------|-----------------|
| **READY** | Green | Everything working, robot idle | Drive normally |
| **DRIVING** | Blue | Robot is moving | — |
| **DRIVING_LIMITED** | Amber | Video link from the robot lost; control still works | Stop; click **Retry video** |
| **STOP** | Red | Control connection lost, Arduino not connected, or no reply for > 3 s | Wait; see the operator manual's troubleshooting |

The mission state is **advisory**: it colours the dashboard but does not
itself block commands. Drive controls are disabled only when the WebSocket
is disconnected or the dashboard is an observer. Motor safety comes from
the firmware (Section 6.2).

## 31.3 Transitions

| From | Condition | To |
|------|-----------|----|
| READY | Motor command accepted (fw_state → 2) | DRIVING |
| DRIVING | Stop (fw_state → 1) | READY |
| READY / DRIVING | Video connection lost | DRIVING_LIMITED |
| DRIVING_LIMITED | Video reconnected (Retry video) | READY / DRIVING |
| any | WebSocket lost, serial down, or > 3 s without telemetry | STOP |
| STOP | Reconnected and telemetry flowing | READY (or DRIVING_LIMITED if video is still down) |

---

# SECTION 32: ALERT CLASSIFICATION & WARNING SYSTEM

## 32.1 Alert Levels

| Level | Visual | Trigger |
|-------|--------|---------|
| **INFO** | Plain card | Normal readings; humidity always |
| **WARNING** | Amber card border and tint | Temp ≥ 50 °C, gas ≥ 450, range ≤ 30 cm |
| **CRITICAL** | Red card border and tint | Temp ≥ 70 °C, gas ≥ 600, range ≤ 20 cm |
| **GPS** | GPS card "no fix", status bar "GPS no fix" | gps_fix = false |
| **TRANSPORT** | Status bar "WS offline" / "serial down"; mission state colour | WebSocket, serial or video loss |

There are no audible alarms. The **alert log** panel lists connection
events ("connected to control server", "disconnected; reconnecting…"),
recovered telemetry and server rejections.

## 32.2 Alert Response

```
Sensor threshold crossing:
├─ WARNING / CRITICAL: card colour changes while the value is over the
│  threshold and returns to normal when it clears (not latched)
└─ The operator decides what to do

Obstacle distance (advisory only, never motor-blocking):
├─ Range ≤ 30 cm → amber; ≤ 20 cm → red
├─ Forward, reverse and turn commands: no range check anywhere
└─ Operator decides whether to stop, reverse, or turn

Gas:
├─ Dashboard: amber ≥ 450, red ≥ 600 (raw ADC)
└─ Firmware: motors stopped at ≥ 1000 (PANIC GAS), independent of the Pi

Transport:
└─ Mission state → STOP or DRIVING_LIMITED (Section 31)
```

---

# SECTION 33: GRACEFUL DEGRADATION STRATEGIES

## 33.1 Failure & Recovery Procedures

| Failure | Detection | Response | Recovery |
|---------|-----------|----------|----------|
| **WebSocket loss** | `onclose` | STOP; P1 sends `S` | Backoff reconnect + `resume_from` |
| **WebRTC loss** | Connection leaves `connected` | DRIVING_LIMITED, video error | **Retry video** |
| **GPS fix loss** | `gps_fix=false` | Marker hidden, "no fix" | Resumes on next fix |
| **Arduino unplugged / port error** | Serial exception | `serial_ok=false` → STOP | Restart P1 (e.g. restart the service) |
| **Arduino reset** | Firmware boots with drivers disabled | Handled by the next command | Commands resume normally |
| **P1 crash** | P3 poll (≤ 1 s) | Respawn after 10 s | Dashboard reconnects |
| **P2 crash** | P3 poll (≤ 1 s) | Respawn after 10 s | Retry video |
| **P3 crash** | systemd | Service restarted after 5 s (P1, P2 too) | Automatic |
| **Robot Screen crash** | Launcher sees Chromium exit | Relaunch after 3 s (or `vnc` if closed by hand) | Automatic |
| **Wi-Fi link break** | WebSocket closes, video drops | Dead-man stops the motors | Dashboard reconnects once the link is back; move the robot or router closer |
| **Pi offline** | Everything stops | Dead-man stops the motors | Pi reboot; services start on their own |

---

# SECTION 34: EMERGENCY STOP & SAFETY PROCEDURES

## 34.1 Emergency Stop Execution

```
Operator clicks EMERGENCY STOP (or ■, or releases a drive control/key):
  │
  ├─ Dashboard: {"type":"stop_all"} over the WebSocket
  │   (sent even when the dashboard is not the controller, but P1
  │    only acts on it from the controller)
  │
  ├─ P1: skips the seq check, writes "S\n" to the Arduino
  │
  ├─ Arduino: "S" is always accepted (any mode)
  │  ├─ Motor targets → 0; PWM ramps down 15 units per 10 ms
  │  │  (from speed 180: 0 in 120 ms)
  │  ├─ Mode ACTIVE → READY (fw_state 1)
  │  └─ ACK S
  │
  └─ Dashboard: mission state DRIVING → READY
```

The emergency-stop button sends the same `S` as releasing a drive control;
it is a large, always-enabled target, not a separate latched state.

```
Dead-man stop (automatic):
  ├─ No command reaches the Arduino for 2000 ms
  ├─ PWM cut to 0 immediately, drivers disabled (D4 LOW)
  └─ PANIC DEADMAN; clears automatically when commands resume

Operator disconnect (automatic):
  ├─ Controller's WebSocket closes (network loss, tab closed)
  ├─ P1 sends S straight away (if P1 is running)
  └─ Otherwise the dead-man stops the motors within 2 s

Gas panic (automatic):
  └─ Raw gas ADC ≥ 1000 → PWM cut, drivers disabled, PANIC GAS
```

---

# PART 8: STARTUP, RECOVERY & DEPLOYMENT

# SECTION 35: STARTUP HANDSHAKE PROCEDURE

## 35.1 Startup Sequence

Times vary and have not yet been measured end to end (test F9 records the
real value).

| Step | Component | Action |
|------|-----------|--------|
| 1 | Pi | Power on, kernel and systemd boot |
| 2 | systemd | Starts `robot-watchdog.service` (P3) as user `robot` |
| 3 | P3 | Spawns P1 and P2 |
| 4 | P1 | Acquires `/run/robot/p1.lock` |
| 5 | P1 | Opens the Arduino port exclusively; DTR resets the UNO |
| 6 | Arduino | Safe boot: drivers disabled, PWM 0, servos centred, `READY RESCUE-UNO 1.0.0` |
| 7 | P1 | Waits 2 s, flushes both buffers |
| 8 | P1 | Sends `S` three times, 200 ms apart |
| 9 | P1 | Sends `?`; waits up to 5 s for `READY` or a telemetry line (else exits with code 2) |
| 10 | P1 | Starts GPS thread, telemetry log, 200 ms broadcast; HTTP on 8080 |
| 11 | P2 | HTTP on 8443 (camera and mic open on the first viewer) |
| 12 | Desktop | Autologin; `robot-screen.sh` waits for P2, then opens the kiosk |
| 13 | Operator | Opens `http://<pi-ip>:8080`; WebSocket `hello` → controller |
| 14 | Dashboard | WebRTC offer to P2 (retried every 3 s until P2 answers) |
| — | **Operational** | Mission state READY |

---

# SECTION 36: ADVISORY LOCKING & PROCESS MANAGEMENT

## 36.1 P1 Single-Instance Lock (`pi/p1_control/lockfile.py`)

```python
# Exclusive, non-blocking advisory lock held for the process lifetime.
fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o644)   # /run/robot/p1.lock
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError as exc:
    os.close(fd)
    raise LockAcquisitionError(f"{self.path} is held by another process") from exc
os.truncate(fd, 0)
os.write(fd, f"{os.getpid()}\n".encode())   # PID for diagnostics
os.fsync(fd)
```

- `/run` is tmpfs, so the file does not survive a reboot.
- The kernel releases the lock when the holder exits, including on SIGKILL.
- A second P1 exits with code **0** (`LOCK_HELD`), which P3 logs
  separately from a crash.

## 36.2 Second Layer: Exclusive Serial Open

```python
serial.Serial(port=SERIAL_PORT, baudrate=115200, timeout=0.1, exclusive=True)
```

`exclusive=True` makes the kernel refuse a second opener of the same
device, so even a process that skipped the lock file could not write to
the Arduino at the same time.

## 36.3 Third Layer: One Controller

Only one WebSocket client holds the `controller` role; the rest are
observers and their commands are rejected (Section 15.1).

---

# SECTION 37: PROCESS RECOVERY & AUTO-RESTART

## 37.1 P3 Recovery Procedure

```
Failure detected (P1 or P2):
  │
  ├─ Crash: proc.poll() returns an exit code
  │   └─ Log PROC_CRASH (or PROC_LOCK_HELD / PROC_CONFIG_INVALID)
  │
  ├─ Hang: third consecutive /health miss
  │   ├─ Log PROC_KILL
  │   └─ SIGKILL, wait up to 5 s
  │
  ├─ Cooldown: 10 s
  │
  ├─ Respawn: subprocess.Popen(P1_CMD or P2_CMD), log PROC_SPAWN
  │
  └─ P1 re-runs the full startup handshake (Section 35), which
     resets the Arduino through DTR and sends three stops
```

P3 does not touch the serial port itself; the Arduino reset comes from P1
reopening the port.

## 37.2 systemd Unit (`deploy/systemd/robot-watchdog.service`)

```ini
[Unit]
Description=Rescue Robot Process Watchdog (P3)
After=network.target dev-ttyUSB0.device
Wants=dev-ttyUSB0.device

[Service]
Type=simple
User=robot
Group=robot
WorkingDirectory=/opt/robot/pi
EnvironmentFile=-/etc/robot/p1.env
EnvironmentFile=-/etc/robot/p2.env
EnvironmentFile=-/etc/robot/p3.env
ExecStart=/opt/robot/venv/bin/python -m p3_watchdog.main
Restart=on-failure
RestartSec=5
KillMode=control-group
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

The unit waits for `dev-ttyUSB0.device`, but the UNO in use enumerates as
`/dev/ttyACM0` (`p1.env`); the device dependency should be updated to match
(Section 40.3).

---

# SECTION 38: DEPLOYMENT CHECKLIST & PRE-MISSION VERIFICATION

## 38.1 Installation (once per robot)

```
1. Flash the Arduino: open arduino/arduino.ino in the Arduino IDE
   (with the ServoTimer2Plus library installed), board "Arduino UNO",
   upload; the serial monitor at 115200 shows "READY RESCUE-UNO 1.0.0".
2. Build the dashboard: cd dashboard && npm install && npm run build
3. On the Pi: sudo ./deploy/install.sh
   (packages, "robot" user, /opt/robot, venv, /etc/robot templates,
   robot-watchdog.service enabled, kiosk autostart, logrotate)
4. Manual steps printed by the script: enable the GPS UART, desktop
   autologin, 3.5 mm jack as default output, check SERIAL_PORT in
   /etc/robot/p1.env (ls /dev/tty{USB,ACM}*)
5. Join the Pi to the Wi-Fi network and reserve its address in the
   Wi-Fi router's settings
6. Offline map (optional, needs internet once): make area.pmtiles for
   the operating area and copy it to /var/lib/robot/maps/ (Section 27.2)
7. sudo systemctl start robot-watchdog.service
```

## 38.2 Pre-Deployment Hardware Checklist

```
ROBOT UNIT:
  ☐ Chassis assembled, all four motors turn the right way
  ☐ Pan-tilt servos mounted, full range free of obstruction
  ☐ DHT11 (A2), MQ-136 (A3, pre-heated), HC-SR04 (D7/D8) wired
  ☐ GPS (NEO-6M) wired to the Pi's GPIO UART, antenna with sky view
  ☐ USB camera mounted on the pan-tilt, focused
  ☐ USB microphone mounted
  ☐ Speaker on the 3.5 mm jack, audible at 2 m
  ☐ Robot display mounted facing forward, at the victim's eye level
  ☐ Pi secured, ventilation not blocked
  ☐ Arduino secured, USB cable to the Pi strain-relieved
  ☐ 4S battery charged, polarity checked, BMS connected
  ☐ Buck converters set (5 V rails, Arduino supply); Pi power bank charged

WI-FI NETWORK:
  ☐ Wi-Fi router powered, placed toward the search area
  ☐ Pi's address reserved in the router (it does not change)
  ☐ Wi-Fi password is not the factory default

OPERATOR LAPTOP:
  ☐ Chrome or Edge, current version
  ☐ Laptop mic + camera working; browser allowed to use them
    (dashboard over HTTPS, or Chrome/Edge flag for the robot's exact
    origin; check `isSecureContext` is true in the browser console)
  ☐ VNC viewer closed while talking to the victim (keys such as
    Alt+F4 sent through it close the kiosk)
  ☐ Wi-Fi adapter with 2.4 GHz support
```

## 38.3 Field Setup & Link Verification

```
1. POWER UP (in order):
   ☐ Wi-Fi router on; wait for it to boot
   ☐ Robot on (Pi, Arduino); wait for the kiosk idle screen

2. LINK VERIFICATION:
   ☐ Laptop joins the same Wi-Fi network as the robot
   ☐ ping <pi-ip>: < 5 % loss, < 200 ms

3. ROBOT SYSTEMS VERIFICATION:
   ☐ Open http://<pi-ip>:8080
   ☐ Status bar: WS connected, role: controller, serial ok; mission READY
   ☐ Sensor cards update; GPS card shows a fix outdoors
   ☐ Video visible (640×480)
   ☐ "Listen to robot mic": robot microphone audible
   ☐ Hold Talk: voice heard from the robot speaker
   ☐ My camera and an image appear on the robot display
   ☐ Text message shown on the robot display; ✓ on the dashboard
   ☐ Drive: each direction moves correctly and stops on release
   ☐ Pan/tilt sliders move the camera
   ☐ Obstacle < 20 cm → range card red (motors unaffected)
   ☐ EMERGENCY STOP while driving → robot stops

4. FAILSAFE CHECKS:
   ☐ Turn laptop Wi-Fi off while driving → robot stops within 2 s
   ☐ Turn it back on → dashboard reconnects, alert log shows recovery
   ☐ Power off the Wi-Fi router → robot stops within 2 s;
     power on → link and telemetry return

5. MISSION START:
   ☐ Battery charged; spare Pi power bank
   ☐ Operator familiar with the dashboard (OPERATOR_MANUAL.md)
   ☐ Wi-Fi coverage checked for the area to be searched
```

---

# SECTION 39: PERFORMANCE ANALYSIS & BENCHMARKS

## 39.1 Motor Command Latency (design estimate — measure with test N6)

| Stage | Path | Estimate |
|-------|------|----------|
| Browser → Wi-Fi router | Wi-Fi | ~5-15 ms |
| Router → Pi | Wi-Fi | ~5-15 ms (site dependent) |
| P1 | Validate, write serial | < 5 ms |
| Serial | "F120\n" (5 bytes at 115,200 baud) | ~0.5 ms |
| Arduino | Parse in main loop; next motor tick | ≤ 10 ms (+ up to ~25 ms if a sensor read is in progress) |
| **Total to motor start** | | **~30-150 ms** |
| Ramp | 0 → 120 in 15-unit steps | + 80 ms to full commanded speed |

## 39.2 Bandwidth Usage

```
Telemetry (P1 → each dashboard):
└─ ~400 bytes of JSON × 5 per second ≈ 2 kB/s ≈ 16 kbps

Video (P2 → each dashboard):
├─ 640×480, 10 fps, aiortc rate control
└─ VP8: starts at 500 kbps (range 250 kbps-1.5 Mbps);
   H.264: starts at 1 Mbps (range 500 kbps-3 Mbps)

Robot audio (P2 → each dashboard):
└─ Mono Opus, 32 kbps, 60 ms packets

Operator → robot (only while in use):
├─ Voice: Opus, browser-chosen rate
├─ Camera 640×480 @ 10 fps / screen share 5 fps / still image
└─ Text messages: negligible

P2 → Robot Screen: localhost only, not on the network.

Rough worst case, one dashboard, VP8, operator camera on (estimate):
≈ 16 kbps + 0.5-1.5 Mbps + 32 kbps + several hundred kbps (operator
video) + voice ≈ 1-2 Mbps — within a 20 MHz 2.4 GHz Wi-Fi link, which is
why the camera and screen share are capped at 640×480 and 10/5 fps.
Each extra viewer adds another video + audio stream.
```

## 39.3 Reliability Targets (to be verified)

| Metric | Target | How it is met / checked |
|--------|--------|-------------------------|
| Motor stop on link loss | 100 %, ≤ 2 s | Firmware dead-man (tests H7, F1) |
| Crash recovery | Automatic, ~15 s | P3 (tests F3, F4) |
| Watchdog recovery | Automatic | systemd (test F5) |
| Reboot to operational | Unattended | Test F9 |
| Automated tests | All pass | `pytest` in `pi/`: 69 tests passing |

No field reliability figures (uptime, packet loss, MTBF) have been
measured yet; they belong in `TEST_REPORT.md` once the field test is run.

---

# SECTION 40: SYSTEM INTEGRATION MATRIX, KNOWN LIMITATIONS & CONCLUSION

## 40.1 Component Dependency Matrix

```
OPERATOR DASHBOARD
  ├─ Depends on: Wi-Fi network, P1 (served from it), P2 for media
  ├─ Failure: tab closed/crash → P1 sends S; dead-man as backstop
  └─ Recovery: reload; reconnect + resume_from

LOCAL WI-FI NETWORK (1 router)
  ├─ Depends on: router power, robot within range
  ├─ Failure: link loss → control lost; dead-man stops the robot
  └─ Recovery: move the robot or router closer, or re-power the router

P1 CONTROL SERVER
  ├─ Depends on: Arduino (USB serial), GPS (UART), Wi-Fi network
  ├─ Failure: crash → P3 respawns after 10 s
  └─ Recovery: dashboard reconnects on its own

P2 MEDIA SERVER
  ├─ Depends on: camera, mic, Wi-Fi network
  ├─ Failure: crash → P3 respawns after 10 s
  └─ Recovery: operator clicks Retry video

ROBOT SCREEN (victim-facing display + speaker)
  ├─ Depends on: P2, desktop session, HDMI display, speaker
  ├─ Failure: Chromium crash → launcher relaunches after 3 s
  └─ Recovery: idle screen until operator media resumes

P3 WATCHDOG
  ├─ Depends on: systemd
  ├─ Failure: crash → systemd restarts the service after 5 s
  └─ Recovery: P1 and P2 are restarted with it

ARDUINO UNO
  ├─ Depends on: power, USB serial to the Pi
  ├─ Failure: no commands → dead-man stops the motors (2 s)
  └─ Recovery: commands resume → fault clears automatically

CRITICAL PATH (Motor Safety):
  └─ Arduino firmware dead-man
     ├─ Stops the motors ≤ 2 s after the last valid command
     └─ Independent of the network, the Pi and the dashboard
```

## 40.2 Technology Stack

```
├─ Firmware: C++ (Arduino core), ServoTimer2Plus
├─ Pi: Python 3.11 — FastAPI, uvicorn, pyserial, aiortc, PyAV, aiohttp
├─ Frontend: React 19, TypeScript, Vite, Tailwind CSS, Leaflet
├─ Kiosk: Chromium in kiosk mode, bash launcher
├─ Network: ordinary Wi-Fi network (WPA2/WPA3)
├─ Supervision: systemd (P3), P3 (P1, P2)
└─ Tests: pytest (69 tests: command validation, telemetry parsing,
   mission state, ring buffer, dead-man emulation, shared capture,
   talk-back)
```

## 40.3 Known Limitations

1. **No Wi-Fi link-quality monitoring.** No process measures signal
   strength or loss.
2. **Serial loss needs a P1 restart.** If the Arduino is unplugged, P1 marks
   `serial_ok=false` but does not reopen the port, and `/health` still
   returns 200, so P3 does not restart it.
3. **A silent Arduino is not detected.** `serial_ok` only drops on a serial
   error. If the firmware stops sending without an error, P1 keeps
   broadcasting the last frame, so readings go stale without a warning.
4. **The offline map covers only its downloaded area.** Outside it the map
   background needs internet, and the map data is only as current as its
   download date. Everything else runs offline.
5. **Gas is uncalibrated.** Readings and thresholds are raw ADC counts,
   labelled "ppm" on the dashboard.
6. **No authentication.** Any host on the Wi-Fi network can open the dashboard and
   take the controller role if it is free; security rests on the Wi-Fi
   password.
7. **Housekeeping.** The systemd unit waits for `dev-ttyUSB0.device` while
   the UNO is `/dev/ttyACM0`; `p3_events.log` is not rotated; logrotate
   names logs no code writes; the GPS-track clean-up cron is not installed;
   `VIDEO_BITRATE_KBPS` in `p2.env` is not used by P2.
8. **Talk-to-victim partly tested on hardware.** Both audio directions work
   on the robot; operator video, images and text have not yet been shown on
   a physical display.
9. **Performance not yet measured.** Latency, range and bandwidth figures
   in Sections 13 and 39 are design estimates until tests N1-N8 are run.

## 40.4 System Conclusion

```
RESCUE ROBOT SYSTEM

Architecture: 5 subsystems, 3-tier fault tolerance

Capabilities:
├─ Teleoperation over a local Wi-Fi network (WebSocket control)
├─ Live video + audio from the robot (WebRTC)
├─ Talk-to-victim: operator voice, face/image/screen and text on
│  the robot's own display and speaker
├─ Environmental monitoring: temperature, humidity, gas, range, GPS
├─ GPS tracking with a saved per-session track
├─ No internet needed for control, media or telemetry
└─ Safety: motors stop ≤ 2 s after the last command, whatever fails
   upstream; P1 also stops them at once when the operator disconnects

Deployment:
├─ One install script on the Pi, three router scripts
├─ Unattended start on power-up (systemd → P3 → P1, P2; kiosk autostart)
└─ Automatic recovery of crashed or hung processes (~15 s)

Strengths:
✓ Motor safety enforced in firmware, independent of the network and Pi
✓ Defence in depth: P1 validates, the firmware validates again
✓ Control and media in separate processes and transports
✓ Single-writer guarantee on the Arduino (lock + exclusive open + one
  controller)
✓ Telemetry replay after reconnect (60 s ring buffer)
✓ Two-way communication with the victim (voice, video, text)
✓ Runs end to end without hardware (MOCK_HARDWARE=1) for development
  and tests

Constraints:
- Range limited by the Wi-Fi router's coverage
- One controller at a time; one talker at a time
- The Wi-Fi router is a single point of failure
- Items in Section 40.3
```

This architecture gives a rescue team a robot they can drive, watch and
listen through over a self-contained local Wi-Fi network, and that lets them speak
to, be seen by and send messages to a trapped victim. Its core safety
property — the motors stop when commands stop — is enforced in the
Arduino firmware and does not depend on any other part of the system.

Suitable for: search and rescue, collapse-zone surveying, and hazmat
reconnaissance where communication infrastructure is unavailable.
