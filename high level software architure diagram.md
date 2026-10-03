# Autonomous Rescue Robot — High-Level Software Architecture

*One diagram, full stack: firmware → edge compute → local Wi-Fi network → operator dashboard.*

```mermaid
flowchart TB

    subgraph ARDUINO["ARDUINO UNO — Real-Time Firmware (no OS, cooperative scheduler)"]
        direction TB
        A_UART["UART parser\n4-stage validation"]
        A_DM["Dead-man timer\n2000 ms"]
        A_SM["State machine\nARMED / DRIVING / STOPPED"]
        A_SENS["Sensors\nSonar(ISR)\nGas · Temp/Hum"]
        A_ACT["Actuators\nMotors (BTS7960) · Servos"]
        A_TX["Telemetry CSV\n8 fields @200ms"]
        A_UART --> A_DM --> A_SM --> A_ACT
        A_SENS --> A_TX
    end

    subgraph PI["RASPBERRY PI 4 — Edge Compute (3 supervised processes)"]
        direction TB

        subgraph P1["P1 · Control Server — FastAPI :8080"]
            direction TB
            P1_SB["serial_bridge\n+ lockfile (fcntl.flock)"]
            P1_SAF["safety.py\nclamp · seq-check"]
            P1_GPS["gps_reader\npynmea2 thread"]
            P1_RING["ring_buffer\n300-slot recovery"]
            P1_WS["websocket_hub\n/control/ws — broadcast telemetry\n+ resume_from → recovery_batch"]
            P1_API["REST api.py\n/health · /api/ice-config"]
            P1_SB --> P1_SAF --> P1_WS
            P1_GPS --> P1_WS --> P1_RING
        end

        subgraph P2["P2 · Media Server — aiortc :8443"]
            direction TB
            P2_SIG["signaling\nPOST /webrtc/offer → SDP"]
            P2_MED["media\nH.264 video 640x480@10fps\n+ Opus audio"]
            P2_RLY["talkback relay\noperator video/audio + text\n→ Robot Screen"]
            P2_SIG --> P2_MED
            P2_SIG -.-> P2_RLY
        end

        subgraph P3["P3 · Watchdog — process supervisor"]
            direction TB
            P3_SUP["supervisor\nSCAN → SPAWN/ADOPT → MONITOR\n→ CRASH → 10s cooldown → respawn"]
            P3_HLT["health checks\npoll() + HTTP /health @10s\n3 misses = SIGKILL"]
            P3_SUP --> P3_HLT
        end

        P3 -.spawns / monitors.-> P1
        P3 -.spawns / monitors.-> P2

        SCREEN["Robot Screen\nChromium kiosk\nlocalhost:8443/screen\nmode: Robot Display ⇄ VNC"]
        P2_RLY -.-> SCREEN
    end

    subgraph LAN["LOCAL WI-FI NETWORK"]
        direction LR
        WIFI["Wi-Fi router\nPi and laptop on the same network"]
    end

    subgraph DASH["REACT DASHBOARD — Vite + TS + Tailwind + Leaflet"]
        direction TB
        D_WS["WebSocket client\nheartbeat 500ms · backoff 1→30s\nhello + resume_from"]
        D_RTC["WebRTC client (two-way)\npush-to-talk · camera/image/screen\nmessages to robot screen\nRobot Display / VNC switch"]
        D_ALERT["Alert engine\ntemp/gas/range thresholds"]
        D_MSTATE["Mission state\nSTOP / LIMITED / READY / DRIVING"]
        D_UI["3-region UI\nDriveControl+EStop | Video+Map | Sensors+Alerts"]
        D_WS --> D_MSTATE --> D_UI
        D_WS --> D_ALERT --> D_UI
        D_RTC --> D_UI
    end

    GPSHW[("GPS module")] --> P1_GPS
    CAMHW[("Pi camera + mic")] --> P2_MED
    SCREEN -.-> DISPHW[("Robot display + speaker")]

    A_TX <-->|"UART 115200 baud\ncommand grammar F/R/L/S/T/H/P/?"| P1_SB
    P1 <==>|WebSocket JSON| LAN
    P2 <==>|WebRTC A/V| LAN
    LAN <==>|WiFi, Pi port 8080| DASH

    classDef fw fill:#0f9d6b,color:#fff,stroke:#0b7a54
    classDef app fill:#3b5bdb,color:#fff,stroke:#28409e
    classDef safety fill:#c2410c,color:#fff,stroke:#93300a
    classDef net fill:#64748b,color:#fff,stroke:#475569
    class ARDUINO,A_UART,A_DM,A_SM,A_SENS,A_ACT,A_TX fw
    class P1,P1_SB,P1_SAF,P1_GPS,P1_RING,P1_WS,P1_API,P2,P2_SIG,P2_MED,DASH,D_WS,D_RTC,D_MSTATE,D_UI app
    class P3,P3_SUP,P3_HLT,D_ALERT safety
    class LAN,WIFI net
    classDef talk fill:#fff,color:#12181A,stroke:#B7791F,stroke-dasharray:5 4
    class P2_RLY,SCREEN,DISPHW talk
```

## Legend

| Color | Layer |
|---|---|
| 🟩 Green | Arduino real-time firmware |
| 🟦 Indigo | Application services (control, media, dashboard) |
| 🟧 Rust | Safety & supervision (watchdog, dead-man, alerts) |
| ⬜ Grey | Local Wi-Fi network |
| ⬚ Dashed | Talk-to-victim path (operator → robot display + speaker) |

**Data path:** Sensors/commands ↔ Arduino ↔ UART ↔ P1 (Pi) ↔ WebSocket/WebRTC ↔ Wi-Fi ↔ Dashboard. P3 supervises P1/P2 independently of the data path.

**Source:** `CAPSTONE_METHODOLOGY_FINAL.md` §8.7–8.15.
