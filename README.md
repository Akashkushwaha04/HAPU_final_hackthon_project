# HAPU_final_hackthon_project
# Code Blue | Advanced Pressure Injury Prevention

**Eradicate the Silent Epidemic.** Code Blue is an enterprise-grade Clinical Decision Support System (CDSS) interface designed to predict and prevent Hospital-Acquired Pressure Injuries (HAPIs) before tissue breakdown begins. By fusing real-time spatial telemetry with smart escalation matrices, Code Blue protects patients and reduces nursing cognitive load.

## 🚀 Features

The system is built on four core modules:

* **Module 01: MAN 2.0 Spatial Topology**
    * Replaces standard 2-hour turn protocols with a continuous sensor matrix.
    * Tracks micro-movements and calculates shear force gradients in real-time.
* **Module 02: Dynamic Risk Velocity**
    * Calculates compound risk based on the integral of pressure over time.
    * Adjusts risk thresholds dynamically using EMR contextual multipliers (e.g., Hypoxia, Braden Scale).
* **Module 03: Chronological Escalation Journey**
    * Fights alarm fatigue using a 3-tier protocol (Ambient Visual → Targeted Mobile Push → Charge Nurse Override).
    * Eliminates up to 85% of non-actionable audible ward noise.
* **Module 04: Defensible Automated Charting**
    * Generates objective, 100% accurate end-of-shift reports based purely on incontrovertible sensor data.
    * Protects hospitals against CMS penalties for Stage 3 or 4 HAPIs.

## 🛠️ Tech Stack

* **Markup:** HTML5
* **Styling:** Custom CSS3 & [Tailwind CSS](https://tailwindcss.com/) (via CDN)
* **Frontend Logic:** Vanilla JavaScript (ES6+)
* **Backend & Telemetry:** Python 3.x
* **Typography:** [Google Fonts](https://fonts.google.com/) (`Inter` for UI, `Roboto Mono` for metrics)

## 📁 Project Structure

The project has been separated into clean frontend and backend components:

```text
code-blue/
├── index.html          # Main landing page structure
├── tracker.py          # Python script for tracking and processing sensor data telemetry
├── css/
│   └── style.css       # Custom glassmorphism and animation styling
├── js/
│   └── script.js       # Risk calculator logic and scroll reveal interactions
└── README.md           # Project documentation
