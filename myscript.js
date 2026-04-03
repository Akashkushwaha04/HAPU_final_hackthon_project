// INIT ALASQL DATABASE
alasql("CREATE TABLE AuditLogs (log_timestamp STRING, log_time STRING, severity STRING, position STRING, braden_score INT, event_desc STRING)");

const TURN_DURATION = 7200; 
const THRESHOLDS = { warning: 60, critical: 85 }; 
const COLORS = { safe: '#00E5FF', warn: '#FFaa00', danger: '#FF003C', escalate: '#B026FF' };

let totalInterventions = 0; 
let protocolBreaches = 0; 
let riskChart; 

const systemStartTime = Date.now();
let clockSeconds = TURN_DURATION; 

let targetRotationZ = 0; 
let targetRotationX = 0; 

const positions = [
    "SUPINE", 
    "L. LATERAL", 
    "R. LATERAL", 
    "PRONE", 
    "FOWLER'S", 
    "SEMI-FOWL", 
    "TRENDEL", 
    "REV. TREND"
];
let currentPosIndex = 0;

let bradenScore = 14; 
let bradenMultiplier = 0.15; 

const patientZones = {
    head: { meshes: [], pressure: 20, timeHours: 0.5, isAlerted: false, alertStartTime: 0, hasBreached: false },
    elbow: { meshes: [], pressure: 20, timeHours: 1.2, isAlerted: false, alertStartTime: 0, hasBreached: false },
    buttocks: { meshes: [], pressure: 20, timeHours: 2.5, isAlerted: false, alertStartTime: 0, hasBreached: false },
    heel: { meshes: [], pressure: 20, timeHours: 0.1, isAlerted: false, alertStartTime: 0, hasBreached: false }
};

let audioCtx; let isAudioEnabled = false; let alarmInterval = null; let activeAlarmsCount = 0;

function logSystemEvent(message, type = "info") {
    const terminal = document.getElementById('ai-terminal');
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {hour12: false});
    
    let colorClass = "text-slate-300"; let icon = ">>";
    if(type === "danger") { colorClass = "text-danger"; icon = "[!]"; }
    else if(type === "warn") { colorClass = "text-warn"; icon = "[*]"; }
    else if(type === "safe") { colorClass = "text-safe"; icon = "[+]"; }
    
    const html = `<div><span class="text-slate-500 mr-2">[${time}]</span><span class="${colorClass} font-bold mr-1">${icon}</span><span class="${colorClass}">${message}</span></div>`;
    if (terminal) terminal.insertAdjacentHTML('afterbegin', html);

    alasql("INSERT INTO AuditLogs VALUES (?, ?, ?, ?, ?, ?)", [
        now.toISOString(),
        time,
        type.toUpperCase(),
        positions[currentPosIndex],
        bradenScore,
        message
    ]);
}

function speakAlert(message) {
    if (!isAudioEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Samantha')) || null;
    utterance.pitch = 1.1; utterance.rate = 1.05; utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
}

window.updatePositionTargets = function() {
    if (currentPosIndex === 0) { targetRotationZ = 0; targetRotationX = 0; }
    else if (currentPosIndex === 1) { targetRotationZ = 1.2; targetRotationX = 0; }
    else if (currentPosIndex === 2) { targetRotationZ = -1.2; targetRotationX = 0; }
    else if (currentPosIndex === 3) { targetRotationZ = 3.14; targetRotationX = 0; }
    else if (currentPosIndex === 4) { targetRotationZ = 0; targetRotationX = -0.8; } 
    else if (currentPosIndex === 5) { targetRotationZ = 0; targetRotationX = -0.4; } 
    else if (currentPosIndex === 6) { targetRotationZ = 0; targetRotationX = 0.4; } 
    else if (currentPosIndex === 7) { targetRotationZ = 0; targetRotationX = -0.3; } 
    
    const posName = positions[currentPosIndex];
    document.getElementById('current-position-tel').innerText = posName;

    const rotation = -22.5 - (45 * currentPosIndex);
    document.getElementById('wheel-segments').setAttribute('transform', `rotate(${rotation} 50 50)`);

    for(let i=0; i<8; i++) {
        const seg = document.getElementById(`seg-${i}`);
        const lbl = document.getElementById(`lbl-${i}`);
        
        if (i === currentPosIndex) {
            seg.setAttribute('stroke', '#00E5FF');
            if(lbl) lbl.className = "border border-safe bg-safe/20 text-safe px-1 py-1 text-center shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-all";
        } else {
            seg.setAttribute('stroke', 'rgba(0,229,255,0.15)');
            if(lbl) lbl.className = "border border-white/10 text-slate-500 px-1 py-1 text-center transition-all";
        }
    }

    if(window.updateSensorPositions) window.updateSensorPositions();
}

window.calculateBraden = function() {
    const s1 = parseInt(document.getElementById('br-sensory').value);
    const s2 = parseInt(document.getElementById('br-moisture').value);
    const s3 = parseInt(document.getElementById('br-activity').value);
    const s4 = parseInt(document.getElementById('br-mobility').value);
    const s5 = parseInt(document.getElementById('br-nutrition').value);
    const s6 = parseInt(document.getElementById('br-friction').value);
    
    bradenScore = s1 + s2 + s3 + s4 + s5 + s6;
    
    let label = "NO RISK"; let color = "safe";
    if(bradenScore <= 9) { label = "SEVERE"; color = "danger"; bradenMultiplier = 0.35; }
    else if(bradenScore <= 12) { label = "HIGH"; color = "warn"; bradenMultiplier = 0.25; }
    else if(bradenScore <= 14) { label = "MODERATE"; color = "warn"; bradenMultiplier = 0.15; }
    else if(bradenScore <= 18) { label = "MILD"; color = "safe"; bradenMultiplier = 0.08; }
    else { label = "NO RISK"; color = "safe"; bradenMultiplier = 0.02; }

    const hudEl = document.getElementById('hud-braden');
    hudEl.innerText = `${bradenScore} (${label})`;
    hudEl.className = `hud-data text-xs text-${color} border border-${color}/30 px-1.5 rounded-sm bg-${color}/10`;

    document.getElementById('braden-panel').classList.remove('open');
    logSystemEvent(`Clinical Assessment: Braden Scale updated to ${bradenScore} (${label}). Base risk sensitivity automatically recalibrated.`, "safe");
}

const ws = new WebSocket('ws://localhost:8765');
ws.onmessage = function(event) {
    try {
        const data = JSON.parse(event.data);
        
        if(data.pressures) {
            if (data.pressures.head) patientZones.head.pressure = data.pressures.head;
            if (data.pressures.elbow) patientZones.elbow.pressure = data.pressures.elbow;
            if (data.pressures.buttocks) patientZones.buttocks.pressure = data.pressures.buttocks;
            if (data.pressures.heel) patientZones.heel.pressure = data.pressures.heel;
        }
        if (data.reset) {
            const zoneKey = data.reset;
            const btn = document.getElementById(`btn-${zoneKey}`);
            if (btn) {
                repositionPatient(zoneKey, btn, true);
            } else if (patientZones[zoneKey]) {
                manualRotate();
                logSystemEvent(`Preventative shift recorded at ${zoneKey.toUpperCase()} via camera.`, "safe");
            }
        }
    } catch(e) { console.error("Data parse error", e); }
};

window.toggleAudio = function() {
    isAudioEnabled = !isAudioEnabled; const btn = document.getElementById('sound-toggle');
    if (isAudioEnabled) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
        if (audioCtx.state === 'suspended') audioCtx.resume(); 
        btn.innerHTML = '[ AUDIO : ARMED ]'; btn.className = "bg-safe/20 border border-safe text-safe font-mono text-[9px] tracking-widest px-3 py-1.5 rounded-sm transition-all uppercase backdrop-blur-md shadow-[0_0_10px_rgba(0,229,255,0.3)]";
        logSystemEvent("Voice Synthesis & Alarms ARMED", "safe");
        speakAlert("System audio armed.");
    } else {
        btn.innerHTML = '[ AUDIO : OFF ]'; btn.className = "bg-danger/20 border border-danger text-danger hover:bg-danger/40 font-mono text-[9px] tracking-widest px-3 py-1.5 rounded-sm transition-all uppercase backdrop-blur-md animate-pulse"; 
        stopPersistentAlarm();
        logSystemEvent("Audio Disabled by Operator", "warn");
    }
}

function playTone(freq, type, dur, vol) {
    if (!isAudioEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + dur);
}
function playUrgentSequence() {
    if (!isAudioEnabled) return; const p = 950; const v = 0.3;
    playTone(p, 'triangle', 0.15, v); setTimeout(() => playTone(p, 'triangle', 0.15, v), 200); setTimeout(() => playTone(p, 'triangle', 0.15, v), 400);
    setTimeout(() => playTone(p, 'triangle', 0.15, v), 800); setTimeout(() => playTone(p, 'triangle', 0.15, v), 1000);
}
function startPersistentAlarm() { if (alarmInterval || !isAudioEnabled) return; playUrgentSequence(); alarmInterval = setInterval(playUrgentSequence, 3000); }
function stopPersistentAlarm() { if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; } }
function playConfirmSound() { playTone(523.25, 'sine', 0.2, 0.1); setTimeout(() => playTone(659.25, 'sine', 0.4, 0.1), 150); }

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); }
};

window.closeModal = function(id) {
    try {
        const m = document.getElementById(id);
        if (!m) return;
        m.style.display = 'none';
    } catch (err) {
        console.error("Modal Close Error", err);
    }
}

window.toggleModal = function(id) { 
    try {
        const m = document.getElementById(id); 
        if (!m) return;
        
        if (m.style.display === 'none' || m.style.display === '') {
            m.style.display = 'flex';
            
            if (id === 'report-modal') {
                document.getElementById('stat-prevented').innerText = totalInterventions; 
                document.getElementById('stat-breaches').innerText = protocolBreaches;
                
                const uptimeMins = Math.floor((Date.now() - systemStartTime) / 60000);
                const uptimeHrs = (uptimeMins / 60).toFixed(2);
                document.getElementById('stat-uptime').innerHTML = `${uptimeHrs}<span class="text-lg text-slate-500">H</span>`;
            }
        } else {
            m.style.display = 'none';
        }
    } catch (err) {
        console.error("Modal Error", err);
    }
}

window.downloadLog = function() {
    try {
        logSystemEvent("Compliance Data Exported to Excel.", "safe");
        
        const logs = alasql("SELECT log_timestamp AS Timestamp, log_time AS Time, severity AS Severity, position AS `Patient Position`, braden_score AS `Braden Score`, event_desc AS `Event Description` FROM AuditLogs");
        
        const uptimeMins = Math.floor((Date.now() - systemStartTime) / 60000);
        const uptimeHrs = (uptimeMins / 60).toFixed(2);
        
        const summaryData = [
            {"Metric": "Total Preventative Interventions", "Value": totalInterventions},
            {"Metric": "Mandatory Protocol Breaches", "Value": protocolBreaches},
            {"Metric": "System Uptime (Hours)", "Value": uptimeHrs}
        ];

        const wb = XLSX.utils.book_new();
        
        const wsLogs = XLSX.utils.json_to_sheet(logs.length ? logs : [{"Message": "No events logged yet."}]);
        XLSX.utils.book_append_sheet(wb, wsLogs, "Audit Logs");
        
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Session Summary");

        XLSX.writeFile(wb, `CodeBlue_Audit_Log_${new Date().getTime()}.xlsx`);
        
        closeModal('report-modal');
    } catch (err) {
        console.error("Excel Export Error: ", err);
        alert("Excel Export failed. Please check browser permissions.");
    }
}

function updateAlertBadge() {
    const badge = document.getElementById('alert-badge');
    if(activeAlarmsCount > 0) {
        badge.className = 'text-[9px] font-mono text-danger tracking-widest animate-pulse'; badge.innerText = `${activeAlarmsCount} CRITICAL`; document.getElementById('empty-alert-msg').style.display = 'none';
    } else {
        badge.className = 'text-[9px] font-mono text-slate-400 tracking-widest'; badge.innerText = `0 PENDING`; document.getElementById('empty-alert-msg').style.display = 'flex';
    }
}

window.manualRotate = function() {
    logSystemEvent("Manual position change initiated.", "info");
    
    Object.values(patientZones).forEach(z => { 
        z.pressure = 20; 
        z.timeHours = 0; 
        z.isAlerted = false; 
        z.hasBreached = false; 
    });
    
    document.querySelectorAll('.alert-card').forEach(el => el.remove());
    activeAlarmsCount = 0;
    stopPersistentAlarm();
    updateAlertBadge();

    clockSeconds = TURN_DURATION;
    
    currentPosIndex = (currentPosIndex + 1) % positions.length;
    window.updatePositionTargets();
    
    totalInterventions++; 
    playConfirmSound();
    speakAlert(`Patient repositioned to ${positions[currentPosIndex].toLowerCase()}. Timer reset.`);
}

window.repositionPatient = function(zoneKey, btnEl, fromRemote=false) {
    patientZones[zoneKey].timeHours = 0; 
    patientZones[zoneKey].pressure = 20; 
    
    patientZones[zoneKey].isAlerted = false; patientZones[zoneKey].hasBreached = false;
    if(btnEl) btnEl.closest('.alert-card').remove();
    activeAlarmsCount--; if (activeAlarmsCount <= 0) { activeAlarmsCount = 0; stopPersistentAlarm(); }
    
    clockSeconds = TURN_DURATION; 
    
    currentPosIndex = (currentPosIndex + 1) % positions.length;
    window.updatePositionTargets();

    updateAlertBadge(); totalInterventions++; playConfirmSound(); 
    let method = fromRemote ? "Remote Camera Gesture" : "Manual Dashboard Override";
    logSystemEvent(`Patient Physically Turned. Alert resolved at ${zoneKey.toUpperCase()}`, "safe");
    speakAlert(`Patient repositioning confirmed. Timer reset to 2 hours.`);
};

function triggerAlert(zoneKey, riskScore) {
    if (patientZones[zoneKey].isAlerted) return;
    patientZones[zoneKey].isAlerted = true; patientZones[zoneKey].alertStartTime = Date.now(); activeAlarmsCount++; startPersistentAlarm(); 
    
    const container = document.getElementById('alert-container');
    let actionText = "Lateral Shift"; if(zoneKey === 'heel') actionText = "Heel Offload";
    
    logSystemEvent(`CRITICAL RISK detected at ${zoneKey.toUpperCase()} (Score: ${Math.round(riskScore)})`, "danger");
    speakAlert(`Code Blue. Tier 1 pressure ulcer risk detected at ${zoneKey}. Immediate repositioning required.`);

    const alertHTML = `
        <div id="alert-${zoneKey}" class="alert-card relative bg-danger/10 border border-danger/50 p-3 overflow-hidden backdrop-blur-md transition-all duration-500 mb-2">
            <div class="flex justify-between items-start mb-2 relative z-10">
                <div>
                    <p id="alert-status-${zoneKey}" class="text-[9px] font-mono text-danger tracking-widest uppercase flex items-center gap-1">
                        <span class="w-1.5 h-1.5 bg-danger animate-pulse"></span> TIER 1 ALARM
                    </p>
                    <p class="hud-title text-white mt-1">${zoneKey} ULCER RISK</p>
                </div>
                <div id="alert-score-${zoneKey}" class="hud-data text-xl text-danger drop-shadow-[0_0_10px_rgba(255,0,60,0.5)]">${Math.round(riskScore)}</div>
            </div>
            <div class="flex justify-between items-center mt-2 pt-2 border-t border-danger/30 relative z-10">
                <p class="text-[9px] text-safe font-mono uppercase tracking-widest">> ${actionText}</p>
                <button id="btn-${zoneKey}" onclick="repositionPatient('${zoneKey}', this)" class="bg-danger/20 hover:bg-danger text-white text-[8px] font-mono tracking-widest px-2 py-1 uppercase border border-danger transition-colors cursor-pointer pointer-events-auto z-50 relative">TURN PATIENT</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('afterbegin', alertHTML); updateAlertBadge();
}

let manGroup;
let createSensor;
let ctx;

window.addEventListener('DOMContentLoaded', () => {
    
    try {
        ctx = document.getElementById('riskChart').getContext('2d');
        let gradient = ctx.createLinearGradient(0, 0, 0, 100); gradient.addColorStop(0, 'rgba(0, 229, 255, 0.4)'); gradient.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
        
        riskChart = new Chart(ctx, {
            type: 'line',
            data: { labels: Array(20).fill(''), datasets: [{ data: Array(20).fill(30), borderColor: COLORS.safe, backgroundColor: gradient, borderWidth: 1, fill: true, tension: 0.3, pointRadius: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { y: { display: false, min: 0, max: 150 }, x: { display: false } }, animation: { duration: 500 } }
        });
    } catch (e) { console.error("Chart Init Error", e); }

    const container3d = document.getElementById('canvas-container');
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x02040a, 0.03);
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000); 
    camera.position.set(0, 0, 14); 
    
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(window.innerWidth, window.innerHeight); 
    container3d.appendChild(renderer.domElement);
    
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.target.set(0, 0, 0); controls.enablePan = false; controls.minDistance = 2; controls.maxDistance = 30;

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0x00E5FF, 2.0); dirLight.position.set(5, 10, 7); scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xB026FF, 2.0); backLight.position.set(-5, -5, -7); scene.add(backLight);

    manGroup = new THREE.Group();
    const manMat = new THREE.MeshStandardMaterial({ color: 0x006699, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.7 });

    const loader = new THREE.GLTFLoader();
    loader.load('patient.glb', function (gltf) {
        const humanModel = gltf.scene;
        humanModel.traverse((child) => { if (child.isMesh) { child.material = manMat; } });

        const box = new THREE.Box3().setFromObject(humanModel);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scale = 10 / maxDim;
            humanModel.scale.set(scale, scale, scale);
        }

        const scaledBox = new THREE.Box3().setFromObject(humanModel);
        const center = scaledBox.getCenter(new THREE.Vector3());
        humanModel.position.sub(center); 
        manGroup.add(humanModel);
    }, undefined, function(e){});
    
    const gridHelper = new THREE.GridHelper(20, 20, 0x00E5FF, 0x00E5FF); gridHelper.position.y = -5; gridHelper.material.opacity = 0.1; gridHelper.material.transparent = true; scene.add(gridHelper);
    scene.add(manGroup);

    createSensor = function(x, y, z) {
        const group = new THREE.Group(); group.position.set(x, y, z);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.8, depthTest: false });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
        mesh.renderOrder = 999; mesh.visible = false;
        const light = new THREE.PointLight(0x00E5FF, 5, 10); light.visible = false;
        group.add(mesh); group.add(light); manGroup.add(group);
        return { group, mesh, light };
    }
    
    window.updateSensorPositions = function() {
        Object.values(patientZones).forEach(zone => {
            zone.meshes.forEach(sensor => { manGroup.remove(sensor.group); });
            zone.meshes = [];
        });

        if (currentPosIndex === 0) { // SUPINE
            patientZones.head.meshes.push(createSensor(0, 4.0, 0.5)); 
            patientZones.elbow.meshes.push(createSensor(2.5, 0.5, 0.2));  
            patientZones.elbow.meshes.push(createSensor(-2.5, 0.5, 0.2)); 
            patientZones.buttocks.meshes.push(createSensor(0, -1.0, -1.0)); 
            patientZones.heel.meshes.push(createSensor(-1.0, -4.8, -0.5));
            patientZones.heel.meshes.push(createSensor(1.0, -4.8, -0.5));
        } else if (currentPosIndex === 1) { // LEFT LATERAL
            patientZones.head.meshes.push(createSensor(1.0, 4.0, 0)); 
            patientZones.elbow.meshes.push(createSensor(2.2, 1.5, 0)); 
            patientZones.buttocks.meshes.push(createSensor(1.5, -1.0, 0)); 
            patientZones.heel.meshes.push(createSensor(1.0, -4.5, 0)); 
        } else if (currentPosIndex === 2) { // RIGHT LATERAL
            patientZones.head.meshes.push(createSensor(-1.0, 4.0, 0)); 
            patientZones.elbow.meshes.push(createSensor(-2.2, 1.5, 0)); 
            patientZones.buttocks.meshes.push(createSensor(-1.5, -1.0, 0)); 
            patientZones.heel.meshes.push(createSensor(-1.0, -4.5, 0)); 
        } else if (currentPosIndex === 3) { // PRONE
            patientZones.head.meshes.push(createSensor(0, 4.0, -0.8)); 
            patientZones.elbow.meshes.push(createSensor(0, 1.5, -1.0)); 
            patientZones.buttocks.meshes.push(createSensor(1.0, -3.0, -0.8)); 
            patientZones.buttocks.meshes.push(createSensor(-1.0, -3.0, -0.8));
            patientZones.heel.meshes.push(createSensor(-1.0, -4.8, -1.0)); 
            patientZones.heel.meshes.push(createSensor(1.0, -4.8, -1.0));
        } else if (currentPosIndex === 4) { // FOWLER'S
            patientZones.head.meshes.push(createSensor(0, 4.0, 0.5)); 
            patientZones.buttocks.meshes.push(createSensor(0, -1.5, -1.0)); 
            patientZones.heel.meshes.push(createSensor(-1.0, -4.8, -0.5));
            patientZones.heel.meshes.push(createSensor(1.0, -4.8, -0.5));
        } else if (currentPosIndex === 5) { // SEMI-FOWLER
            patientZones.head.meshes.push(createSensor(0, 4.0, 0.5)); 
            patientZones.buttocks.meshes.push(createSensor(0, -1.2, -1.0)); 
            patientZones.heel.meshes.push(createSensor(-1.0, -4.8, -0.5));
            patientZones.heel.meshes.push(createSensor(1.0, -4.8, -0.5));
        } else if (currentPosIndex === 6) { // TRENDELENBURG
            patientZones.head.meshes.push(createSensor(0, 4.0, 0.5)); 
            patientZones.elbow.meshes.push(createSensor(2.5, 0.5, 0.2));  
            patientZones.elbow.meshes.push(createSensor(-2.5, 0.5, 0.2)); 
        } else if (currentPosIndex === 7) { // REV. TREND
            patientZones.buttocks.meshes.push(createSensor(0, -1.0, -1.0)); 
            patientZones.heel.meshes.push(createSensor(-1.0, -4.8, -0.5));
            patientZones.heel.meshes.push(createSensor(1.0, -4.8, -0.5));
        }
    };
    window.updateSensorPositions();

    window.addEventListener('resize', () => { 
        camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); 
    });

    function animate3d() {
        requestAnimationFrame(animate3d); if(controls) controls.update(); 
        
        manGroup.rotation.z += (targetRotationZ - manGroup.rotation.z) * 0.05;
        manGroup.rotation.x += (targetRotationX - manGroup.rotation.x) * 0.05;
        
        Object.values(patientZones).forEach(zone => {
            zone.meshes.forEach(sensor => {
                const currentHex = sensor.mesh.material.color.getHex();
                if (currentHex === 0xFF003C || currentHex === 0xB026FF) {
                    const pulse = 1.2 + 0.4 * Math.sin(Date.now() * 0.008); 
                    sensor.mesh.scale.set(pulse, pulse, pulse); 
                    sensor.light.intensity = 15 + 5 * Math.sin(Date.now() * 0.008); 
                } else { 
                    sensor.mesh.scale.set(1, 1, 1); 
                    sensor.light.intensity = 5; 
                }
            });
        });
        renderer.render(scene, camera);
    }
    animate3d();

    function runSimulationTick() {
        try {
            let maxRisk = 0; const now = Date.now();
            document.getElementById('hud-bpm').innerText = 70 + Math.floor(Math.random() * 4);
            
            Object.keys(patientZones).forEach(zoneKey => {
                const data = patientZones[zoneKey]; 
                
                data.timeHours += 0.01; 
                const riskScore = data.pressure * (1 + (data.timeHours * bradenMultiplier));
                
                if (riskScore > maxRisk) maxRisk = riskScore;
                
                let colorHex = COLORS.safe; let isUnderPressure = false; 
                
                if (riskScore >= THRESHOLDS.critical) { 
                    colorHex = COLORS.danger; triggerAlert(zoneKey, riskScore); isUnderPressure = true;
                } 
                else if (riskScore >= THRESHOLDS.warning) { 
                    colorHex = COLORS.warn; isUnderPressure = true;
                }

                if (data.isAlerted) {
                    const elapsed = (now - data.alertStartTime) / 1000;
                    const statusTxt = document.getElementById(`alert-status-${zoneKey}`);
                    const btn = document.getElementById(`btn-${zoneKey}`);
                    const scoreTxt = document.getElementById(`alert-score-${zoneKey}`);
                    
                    if (scoreTxt) scoreTxt.innerText = Math.round(riskScore);
                    
                    if (elapsed > 10 && elapsed <= 20) {
                        if(statusTxt && statusTxt.innerText.indexOf("TIER 2") === -1) { 
                            statusTxt.innerHTML = `<span class="w-1.5 h-1.5 bg-[#FFaa00] animate-pulse"></span> TIER 2: PAGING RN`; 
                            statusTxt.className = "text-[9px] font-mono text-[#FFaa00] tracking-widest uppercase flex items-center gap-1 drop-shadow-[0_0_5px_rgba(255,170,0,0.8)]"; 
                            logSystemEvent(`Tier 2 Escalation at ${zoneKey.toUpperCase()}. Paging RN.`, "warn");
                            speakAlert(`Escalating. Paging Registered Nurse for ${zoneKey} intervention.`);
                        }
                        colorHex = COLORS.warn; 
                    } else if (elapsed > 20 && elapsed <= 30) {
                        if(statusTxt && statusTxt.innerText.indexOf("TIER 3") === -1) { 
                            statusTxt.innerHTML = `<span class="w-1.5 h-1.5 bg-[#B026FF] animate-pulse"></span> TIER 3: CHARGE NURSE`; 
                            statusTxt.className = "text-[9px] font-mono text-[#B026FF] tracking-widest uppercase flex items-center gap-1 drop-shadow-[0_0_5px_rgba(176,38,255,0.8)]"; 
                            logSystemEvent(`Tier 3 Escalation at ${zoneKey.toUpperCase()}. Alerting Charge Nurse.`, "warn");
                        }
                        colorHex = COLORS.escalate; 
                    } else if (elapsed > 30) {
                        if(statusTxt && statusTxt.innerText.indexOf("BREACH") === -1) { 
                            statusTxt.innerHTML = `<span class="w-1.5 h-1.5 bg-[#FF003C] animate-pulse"></span> PROTOCOL BREACH`; 
                            statusTxt.className = "text-[9px] font-mono text-[#FF003C] tracking-widest uppercase flex items-center gap-1 drop-shadow-[0_0_5px_rgba(255,0,60,0.8)]"; 
                            if (btn) { btn.innerText = "OVERRIDE & LOG"; btn.className = "bg-[#FF003C] text-white text-[8px] font-mono tracking-widest px-2 py-1 border border-[#FF003C] animate-pulse cursor-pointer pointer-events-auto z-50 relative"; }
                            if (!data.hasBreached) { 
                                data.hasBreached = true; protocolBreaches++; 
                                logSystemEvent(`MANDATORY TURN PROTOCOL BREACHED AT ${zoneKey.toUpperCase()}`, "danger");
                                speakAlert(`Critical Error. Mandatory turn protocol breached at ${zoneKey}. Logged to central server.`);
                            }
                        }
                        colorHex = COLORS.danger; 
                    }
                }
                
                data.meshes.forEach(sensor => { 
                    if (sensor && sensor.mesh && sensor.light) { 
                        sensor.mesh.material.color.set(colorHex); 
                        sensor.light.color.set(colorHex); 
                        sensor.mesh.visible = isUnderPressure;
                        sensor.light.visible = isUnderPressure;
                    } 
                });
            });

            const globalEl = document.getElementById('global-risk-display'); 
            const wardDot = document.getElementById('ward-active-dot');
            const riskBorder = document.getElementById('risk-border');
            
            maxRisk = Math.min(100, maxRisk);
            globalEl.innerHTML = Math.round(maxRisk);
            
            if(clockSeconds > 0) {
                clockSeconds -= 1; 
                if (clockSeconds === 600) {
                    logSystemEvent("Mandatory turn deadline approaching (10 minutes).", "warn");
                    speakAlert("Warning. Ten minutes remaining until mandatory patient turn.");
                }
            } else if (clockSeconds === 0) {
                logSystemEvent("Auto-Turn safety protocol initiated.", "warn");
                window.manualRotate(); 
            }
            
            const hrs = Math.floor(clockSeconds / 3600); 
            const mins = Math.floor((clockSeconds % 3600) / 60); 
            const secs = clockSeconds % 60;
            
            const timerText = document.getElementById('turn-timer');
            timerText.innerText = `0${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
            
            const wheel = document.getElementById('turn-progress');
            const dashOffset = 289 - ((clockSeconds / TURN_DURATION) * 289); 
            wheel.style.strokeDashoffset = Math.max(0, dashOffset);
            
            if(clockSeconds <= 600 && clockSeconds > 300) { 
                wheel.style.stroke = COLORS.warn; 
                timerText.className = "text-warn font-bold text-sm tracking-wider animate-pulse";
            } else if (clockSeconds <= 300) {
                wheel.style.stroke = COLORS.danger; 
                timerText.className = "text-danger font-bold text-sm tracking-wider animate-pulse";
            } else { 
                wheel.style.stroke = COLORS.safe; 
                timerText.className = "text-white font-bold text-sm tracking-wider";
            }

            if (maxRisk >= THRESHOLDS.critical) { 
                globalEl.className = 'hud-data text-7xl text-danger drop-shadow-[0_0_20px_rgba(255,0,30,0.8)] transition-colors duration-500'; 
                riskBorder.className = 'flex items-baseline gap-1 bg-black/40 backdrop-blur-lg px-6 py-2 border-r-4 border-b-4 border-danger/80 shadow-[10px_10px_30px_rgba(255,0,60,0.2)] transition-colors duration-500';
                wardDot.className = 'w-2 h-2 bg-danger animate-pulse'; 
                if(riskChart) { riskChart.data.datasets[0].borderColor = COLORS.danger; const g = ctx.createLinearGradient(0,0,0,100); g.addColorStop(0, 'rgba(255, 0, 60, 0.4)'); g.addColorStop(1, 'rgba(255, 0, 60, 0.0)'); riskChart.data.datasets[0].backgroundColor = g; }
                document.getElementById('hud-spo2').innerText = `91%`; document.getElementById('hud-spo2').className = 'hud-data text-xl text-danger';
            } else if (maxRisk >= THRESHOLDS.warning) { 
                globalEl.className = 'hud-data text-7xl text-warn transition-colors duration-500'; 
                riskBorder.className = 'flex items-baseline gap-1 bg-black/40 backdrop-blur-lg px-6 py-2 border-r-4 border-b-4 border-warn/80 transition-colors duration-500';
                wardDot.className = 'w-2 h-2 bg-warn animate-pulse'; 
                if(riskChart) { riskChart.data.datasets[0].borderColor = COLORS.warn; const g = ctx.createLinearGradient(0,0,0,100); g.addColorStop(0, 'rgba(255, 170, 0, 0.4)'); g.addColorStop(1, 'rgba(255, 170, 0, 0.0)'); riskChart.data.datasets[0].backgroundColor = g; }
            } else { 
                globalEl.className = 'hud-data text-7xl text-safe transition-colors duration-500'; 
                riskBorder.className = 'flex items-baseline gap-1 bg-black/40 backdrop-blur-lg px-6 py-2 border-r-4 border-b-4 border-safe/50 transition-colors duration-500';
                wardDot.className = 'w-2 h-2 bg-safe shadow-[0_0_8px_#00E5FF]'; 
                if(riskChart) { riskChart.data.datasets[0].borderColor = COLORS.safe; const g = ctx.createLinearGradient(0,0,0,100); g.addColorStop(0, 'rgba(0, 229, 255, 0.4)'); g.addColorStop(1, 'rgba(0, 229, 255, 0.0)'); riskChart.data.datasets[0].backgroundColor = g; }
                document.getElementById('hud-spo2').innerText = `96%`; document.getElementById('hud-spo2').className = 'hud-data text-xl text-safe';
            }
            if(riskChart) { riskChart.data.datasets[0].data.push(maxRisk); riskChart.data.datasets[0].data.shift(); riskChart.update(); }
        } catch(e) { console.error("Sim Tick Error", e); }
    }
    
    setInterval(runSimulationTick, 1000); 
    
    window.forceDemoSpike = function() { 
        patientZones.buttocks.timeHours = 4; 
        patientZones.buttocks.pressure = 95;
        clockSeconds = 605; 
        logSystemEvent("Clock fast-forwarded to demonstrate 1h 50m limit warnings.", "warn");
    }
});