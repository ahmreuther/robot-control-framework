# WebSkillComposition

**WebSkillComposition** ist ein webbasiertes System zur skill-basierten Steuerung von Industrierobotern.  
Es besteht aus einem **Python-Backend** zur OPC UA-Anbindung und einem **Web-Frontend** mit Inverse- und Vorwärtskinematik-Logik.  
Ziel ist es, Roboter wie **Franka Research 3**, **EVA Automata** und **UR5e** über eine einheitliche Weboberfläche steuern zu können.

---

## Aufbau

Das Projekt ist in zwei Hauptordner unterteilt:

- **Backend/**  
  Enthält das Python-Backend, das als OPC UA Client mit einem OPC UA Robotics Server kommuniziert.  
  Es stellt eine HTTP- und WebSocket-Schnittstelle für das Frontend bereit und liefert URDF-Dateien für unterstützte Roboter (inkl. Meshes und Texturen) aus.

- **frontend/**  
  Enthält die Weboberfläche zur skill-basierten Steuerung und die Logik für Inverse Kinematik (IK) und Vorwärtskinematik (FK).

**Architekturübersicht:**

[Frontend (Web UI, IK/FK)] <--HTTP/WebSocket--> [Backend (Python, OPC UA Client)]<br>
|<br>
| OPC UA <br>
v<br>
[OPC UA Robotics Server (Robot / Twin)]

---

## Voraussetzungen

Für die Entwicklung benötigst du:

- **Git**
- **Python 3.11+** (empfohlen)
- **Node.js LTS** (z. B. 20.x) + **npm**
- **uv** (Python-Paketmanager von Astral)  
  Installation:
  - macOS/Linux:
    ```bash
    curl -LsSf https://astral.sh/uv/install.sh | sh
    ```
  - Windows (PowerShell):
    ```powershell
    iwr https://astral.sh/uv/install.ps1 -UseBasicParsing | iex
    ```
- Zugriff auf einen **OPC UA Robotics Server** (z. B. Franka-Controller, Simulator oder Digital Twin)

> Falls du **uv** nicht nutzen möchtest, kannst du auch klassisch mit `venv` + `pip` arbeiten.

---

## Installation & Start

### 1. Backend einrichten

Wechsle ins Backend-Verzeichnis:
```bash
cd Backend
uv run main.py               # Backend starten
```

### 2. Frontend einrichten
Frontend starten:

```bash
cd frontend
npm install
npm run start               # Frontend starten
```