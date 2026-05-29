import { io } from 'socket.io-client';
import './style.css';

// Build DOM
const statusContainer = document.createElement('div');
statusContainer.id = 'status-container';
statusContainer.innerHTML = `
  <span class="status-label">Signaling Status</span>
  <div id="status"><span id="status-dot" class="dot"></span>Waiting…</div>
`;
document.body.appendChild(statusContainer);

const startBtn = document.createElement('button');
startBtn.id = 'start-btn';
startBtn.textContent = 'Start';
document.body.appendChild(startBtn);

const stopBtn = document.createElement('button');
stopBtn.id = 'stop-btn';
stopBtn.textContent = 'Stop';
stopBtn.disabled = true;
document.body.appendChild(stopBtn);

const grid = document.createElement('div');
grid.className = 'grid';

const webcamWrapper = document.createElement('div');
webcamWrapper.className = 'canvas-wrapper';
const webcamCanvas = document.createElement('canvas');
webcamCanvas.id = 'webcam-canvas';
const webcamLabel = document.createElement('div');
webcamLabel.className = 'canvas-label';
webcamLabel.textContent = 'Webcam';
webcamWrapper.appendChild(webcamCanvas);
webcamWrapper.appendChild(webcamLabel);

const screenWrapper = document.createElement('div');
screenWrapper.className = 'canvas-wrapper';
const screenCanvas = document.createElement('canvas');
screenCanvas.id = 'screen-canvas';
const screenLabel = document.createElement('div');
screenLabel.className = 'canvas-label';
screenLabel.textContent = 'Screen';
screenWrapper.appendChild(screenCanvas);
screenWrapper.appendChild(screenLabel);

grid.appendChild(webcamWrapper);
grid.appendChild(screenWrapper);
document.body.appendChild(grid);

const status = document.getElementById('status');

const updateStatus = (text, cls = '') => {
  status.innerHTML = `<span id="status-dot" class="dot ${cls}"></span>${text}`;
};

const signalUrl = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:3000';
const socket = io(signalUrl);

socket.on('connect', () => {
  socket.emit('join', { role: 'client' });
  updateStatus('Connected', 'connected');
});

const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

pc.onicecandidate = ({ candidate }) => candidate && socket.emit('ice-candidate', candidate);

pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'connected') updateStatus('Streaming', 'streaming');
  else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
    updateStatus('Waiting…', '');
  }
};

socket.on('answer', (answer) => pc.setRemoteDescription(answer));
socket.on('ice-candidate', (candidate) => pc.addIceCandidate(candidate).catch(() => {}));

// Global references for stream and interval cleanups
let webcamStream = null;
let screenStream = null;
let webcamWithTimestamp = null;
let webcamInterval = null;
let screenInterval = null;
let mockInterval = null;

startBtn.onclick = async () => {
  startBtn.disabled = true;
  stopBtn.disabled = true;
  updateStatus('Requesting permissions...', '');

  try {
    // 1. Get webcam (with fallback if not found)
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        console.warn('Physical webcam not found, using a mock stream.');
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 640;
        mockCanvas.height = 480;
        const ctx = mockCanvas.getContext('2d');
        let x = 0;
        mockInterval = setInterval(() => {
          ctx.fillStyle = '#0f141c';
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = '#8b949e';
          ctx.font = '24px monospace';
          ctx.fillText('MOCK WEBCAM (No Hardware)', 50, 240);
          ctx.fillStyle = '#58a6ff';
          ctx.fillRect(x, 280, 50, 50);
          x = (x + 4) % 640;
        }, 1000 / 30);
        webcamStream = mockCanvas.captureStream(30);
      } else {
        throw err;
      }
    }
    
    // 2. Get screen share
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

    updateStatus('Initializing streams...', 'connected');

    // 3. Setup webcam timestamp draw loop
    const webcamVideo = document.createElement('video');
    webcamVideo.srcObject = webcamStream;
    webcamVideo.muted = true;
    await webcamVideo.play();

    webcamVideo.onloadedmetadata = () => {
      webcamCanvas.width = webcamVideo.videoWidth || 1280;
      webcamCanvas.height = webcamVideo.videoHeight || 720;
    };
    
    const webcamCtx = webcamCanvas.getContext('2d');
    webcamInterval = setInterval(() => {
      if (webcamVideo.readyState >= 2) {
        webcamCtx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
        const ts = new Date().toTimeString().slice(0, 8);
        webcamCtx.font = 'bold 28px monospace';
        webcamCtx.fillStyle = 'rgba(0,0,0,0.5)';
        webcamCtx.fillRect(12, 12, 160, 40);
        webcamCtx.fillStyle = '#ffffff';
        webcamCtx.fillText(ts, 20, 42);
      }
    }, 1000 / 30);

    webcamWithTimestamp = webcamCanvas.captureStream(30);

    // 4. Setup screen draw loop
    const screenVideo = document.createElement('video');
    screenVideo.srcObject = screenStream;
    screenVideo.muted = true;
    await screenVideo.play();

    screenVideo.onloadedmetadata = () => {
      screenCanvas.width = screenVideo.videoWidth || 1280;
      screenCanvas.height = screenVideo.videoHeight || 720;
    };

    const screenCtx = screenCanvas.getContext('2d');
    screenInterval = setInterval(() => {
      if (screenVideo.readyState >= 2) {
        screenCtx.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height);
      }
    }, 1000 / 30);

    // 5. Add WebRTC tracks
    pc.addTrack(webcamWithTimestamp.getVideoTracks()[0], webcamWithTimestamp);
    pc.addTrack(screenStream.getVideoTracks()[0], screenStream);

    // 6. Create WebRTC offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', offer);

    updateStatus('Streaming', 'streaming');
    stopBtn.disabled = false;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      updateStatus('Permission denied — please allow camera/screen access', 'error');
    } else {
      updateStatus(`Error: ${err.message}`, 'error');
    }
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }
};

stopBtn.onclick = () => {
  stopBtn.disabled = true;
  
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  if (webcamWithTimestamp) {
    webcamWithTimestamp.getTracks().forEach(track => track.stop());
    webcamWithTimestamp = null;
  }

  if (webcamInterval) {
    clearInterval(webcamInterval);
    webcamInterval = null;
  }
  if (screenInterval) {
    clearInterval(screenInterval);
    screenInterval = null;
  }
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
  }

  pc.getSenders().forEach(sender => pc.removeTrack(sender));

  const webcamCtx = webcamCanvas.getContext('2d');
  const screenCtx = screenCanvas.getContext('2d');
  webcamCtx.fillStyle = '#000';
  webcamCtx.fillRect(0, 0, webcamCanvas.width, webcamCanvas.height);
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);

  startBtn.disabled = false;
  updateStatus('Connected', 'connected');
};
