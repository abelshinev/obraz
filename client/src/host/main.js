import { io } from 'socket.io-client';
import './style.css';

// Build the DOM programmatically
const statusContainer = document.createElement('div');
statusContainer.id = 'status-container';
statusContainer.innerHTML = `
  <span class="status-label">Signaling Status</span>
  <div id="status"><span id="status-dot" class="dot"></span>Waiting…</div>
`;
document.body.appendChild(statusContainer);

const grid = document.createElement('div');
grid.className = 'grid';

const webcamWrapper = document.createElement('div');
webcamWrapper.className = 'video-wrapper';
const webcamVideo = document.createElement('video');
webcamVideo.id = 'webcam';
webcamVideo.autoplay = true;
webcamVideo.playsInline = true;
webcamVideo.muted = true;
const webcamLabel = document.createElement('div');
webcamLabel.className = 'video-label';
webcamLabel.textContent = 'Webcam';
webcamWrapper.appendChild(webcamVideo);
webcamWrapper.appendChild(webcamLabel);

const screenWrapper = document.createElement('div');
screenWrapper.className = 'video-wrapper';
const screenVideo = document.createElement('video');
screenVideo.id = 'screen';
screenVideo.autoplay = true;
screenVideo.playsInline = true;
screenVideo.muted = true;
const screenLabel = document.createElement('div');
screenLabel.className = 'video-label';
screenLabel.textContent = 'Screen';
screenWrapper.appendChild(screenVideo);
screenWrapper.appendChild(screenLabel);

grid.appendChild(webcamWrapper);
grid.appendChild(screenWrapper);
document.body.appendChild(grid);

const status = document.getElementById('status');
const videos = [webcamVideo, screenVideo];

const updateStatus = (text, cls = '') => {
  status.innerHTML = `<span id="status-dot" class="dot ${cls}"></span>${text}`;
};

const signalUrl = import.meta.env.VITE_SIGNAL_URL || 'http://localhost:3000';
const socket = io(signalUrl);

socket.on('connect', () => {
  socket.emit('join', { role: 'host' });
  updateStatus('Host connected', 'connected');
});

const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

pc.onicecandidate = ({ candidate }) => candidate && socket.emit('ice-candidate', candidate);

pc.ontrack = (e) => {
  const emptyVideo = videos.find(v => !v.srcObject);
  if (emptyVideo) {
    emptyVideo.srcObject = e.streams[0];
    updateStatus('Streaming', 'streaming');

    const clearVideo = () => {
      emptyVideo.srcObject = null;
      if (videos.every(v => !v.srcObject)) {
        updateStatus('Waiting…', '');
      }
    };
    e.track.onmute = clearVideo;
    e.track.onended = clearVideo;
  }
};

pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'connected') updateStatus('Peer connected', 'streaming');
  else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
    updateStatus('Waiting…', '');
    videos.forEach(v => v.srcObject = null);
  }
};

socket.on('offer', async (offer) => {
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', answer);
});

socket.on('ice-candidate', (candidate) => pc.addIceCandidate(candidate).catch(() => {}));
