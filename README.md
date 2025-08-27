# WebSkillComposition
**WebSkillComposition** is a web-based system for skill-based control of industrial robots.
  
It consists of a **Python backend** for OPC UA connection and a **web frontend** with inverse and forward kinematics logic.
The goal is to be able to control robots such as **Franka Research 3**, **EVA Automata**, and **UR5e** via a uniform web interface.

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

## Funktionen

Die Arbeitsweise in WebSkillComposition folgt einem klar strukturierten Ablauf, der sowohl **Offline-** als auch **Online-Programmierung** unterstützt.  
Dadurch kannst du Roboterbewegungen zunächst gefahrlos simulieren und anschließend direkt auf den physischen Roboter übertragen – alles innerhalb derselben Benutzeroberfläche.

### 1. Roboter auswählen und digitalen Zwilling starten
- Wähle im Control-Panel ein **Roboter-URDF-Modell** (z. B. Franka R3, EVA, UR5e).
- Das Modell wird in der 3D-Ansicht geladen und die **kinematische Simulation** ist sofort einsatzbereit.
- Die gleiche IK/FK-Logik funktioniert für alle unterstützten Modelle.

### 2. Steuerungsmodus wählen
- **Offline-Modus**:  
  - Keine Verbindung zum echten Roboter.  
  - Perfekt für **Planung, Simulation und Testen**.  
  - Bewegungen wirken sich nur auf den digitalen Zwilling aus.
- **Online-Modus**:  
  - Verbindung zu einem **OPC UA Robotics Server** herstellen.  
  - Live-Daten des physischen Roboters werden übernommen.  
  - Bewegungen aus dem Digital Twin werden an den realen Roboter gesendet.

### 3. Bewegungen erstellen
- **Joint-Space-Steuerung**:  
  - Gelenkwinkel direkt per Schieberegler oder durch Ziehen einzelner Gelenke im 3D-Modell anpassen.
- **Task-Space-Steuerung (TCP)**:  
  - Den Tool Center Point (TCP) über eine gelbe Steuerkugel verschieben oder rotieren.  
  - Inverse Kinematik berechnet automatisch die passenden Gelenkwinkel.
- **Lead-Through (Hand-Guiding)** – nur im Online-Modus bei unterstützten Cobots:  
  - Roboter von Hand bewegen, Änderungen werden direkt im digitalen Zwilling angezeigt.

### 4. Skills ausführen
- Jede Bewegung oder Aktion basiert auf einem **Skill**:
  - **JointPTPMoveSkill**: Punkt-zu-Punkt-Bewegung im Gelenkraum.
  - **EndEffSkill**: Greifer öffnen/schließen oder andere Endeffektor-Operationen.
- Skills sind **standardisiert** und funktionieren für alle angebundenen Roboter identisch.

### 5. Live-Synchronisation aktivieren
- Im Online-Modus können **digitale und physische Zwillinge** kontinuierlich synchronisiert werden:
  - Änderungen am physischen Roboter → sofort im digitalen Zwilling sichtbar.
  - Manipulationen im digitalen Zwilling → sofortige Ausführung am physischen Roboter.

### 6. Überwachen und Analysieren
- Im **OPC UA Browser** die Adressstruktur des Roboters durchsuchen.
- Variablen und Events abonnieren (z. B. Gelenkpositionen, Temperaturen, Fehler).
- Meldungen im Log-Panel verfolgen (Status, Warnungen, Fehler).

---

**So kannst du WebSkillComposition praktisch einsetzen:**
1. Roboter auswählen und kinematisch im Browser simulieren.  
2. Bewegungen und Skills im Offline-Modus testen.  
3. Verbindung zum physischen Roboter herstellen.  
4. Dieselben Skills live ausführen – herstellerunabhängig und standardisiert.  
5. Status und Rückmeldungen in live überwachen.  

## Tastatur-Shortcuts

Während der Arbeit mit dem 3D-Viewer von WebSkillComposition kannst du über die Tastatur schnell zwischen Ansichts-, Transformations- und IK-Steuerungsmodi wechseln.  
Diese Shortcuts ermöglichen eine flüssige Bedienung, ohne ständig UI-Elemente anklicken zu müssen.

| Taste | Funktion |
|-------|----------|
| **Q** | Umschalten zwischen **Welt-** und **lokalem Koordinatensystem** für Transformationen |
| **W** | Transformationsmodus auf **Translation** setzen |
| **E** | Transformationsmodus auf **Rotation** setzen |
| **T** | IK-Interface für die Manipulation des Endeffektors **ein- oder ausblenden** |

---
