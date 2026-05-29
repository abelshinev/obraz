# Methodology

## Why WebRTC
WebRTC is the industry standard for real-time peer-to-peer browser media communications. Key advantages include:
- **Sub-200ms latency**: Leverages UDP-based protocols (like SRTP) to achieve true real-time communication, far outperforming TCP-based streaming alternatives like HLS (typically 2-10 seconds) or RTMP.
- **P2P Architecture**: Once the signaling handshake completes, media flows directly between browsers. This eliminates server bandwidth bottlenecks and reduces server cost significantly since the server does not need to relay video packets.
- **Native Browser Support**: Works out of the box in all modern browsers without requiring any third-party plugins or external native players.

## Why Socket.IO for signaling
WebRTC requires an out-of-band signaling mechanism to exchange SDP (Session Description Protocol) offers, answers, and ICE candidates.
- **High-level abstraction**: Socket.IO simplifies WebSocket connection management, handling auto-reconnection, heartbeats, and client-server event mapping out-of-the-box.
- **Reliable Fallbacks**: If standard WebSockets are blocked by restrictive firewalls, Socket.IO transparently falls back to HTTP long-polling.
- **Timebox Efficiency**: Rather than rolling a custom WebSocket server wrapper to manage role states and relaying, Socket.IO allows implementing the entire signaling server securely in under 60 lines of code.

## Why one RTCPeerConnection, not two
We utilize a single `RTCPeerConnection` instance to manage both media streams (Webcam and Screen) concurrently.
- **Simplified Signaling Exchange**: Only one SDP offer-answer round-trip is required to negotiate both tracks, reducing network overhead and potential race conditions.
- **Clean State Management**: Eliminates the complexity of maintaining separate connection states, ICE gatherings, and track assignments across multiple peer connections.
- **Bandwidth Efficiency**: Allows the underlying browser WebRTC engine to bundle and optimize the transport of multiple media tracks over a single network socket connection.

## Timestamp approach
To display the current timestamp dynamically on the webcam stream:
- **Canvas-based Compositing**: A hidden `<video>` element decodes the incoming raw webcam stream. We run a 30 FPS render loop (`setInterval`) drawing the video frame onto a canvas and rendering the time text (`HH:MM:SS`) on top using Canvas 2D context drawing operations.
- **Baked-in Pixels**: We capture the canvas output using `canvas.captureStream(30)` to produce a new `MediaStream`. 
- **Universal Compatibility**: Because the timestamp is baked directly into the video frames, it is received by the host as part of the video payload itself rather than a UI overlay. This guarantees that any client recording, resizing, or rendering of the track automatically retains the synced timestamp without extra coordination.

## Money handling / Data correctness equivalent
In media streaming applications, video frames are inherently lossy, imprecise, and subject to packet loss or jitter.
- **Client Clock as Source of Truth**: The timestamp is generated using the client browser's local clock (`new Date()`) at the moment of capture.
- **No Server Synchronization Needed**: The host receives the timestamp embedded directly in the decoded video pixels. Because it is rendered client-side prior to encoding, it acts as a reliable source of truth representing the exact capture time, independent of network latency or server clocks.

## What I didn't build and why
- **No TURN server**: In localhost or local network environments, STUN servers (`stun:stun.l.google.com`) are sufficient to discover public candidate addresses. In a real-world production environment, a TURN relay server (such as Coturn) would be required to bypass symmetric NATs and firewalls.
- **No audio**: Audio track capture and transmission was omitted as it was not specified in the requirements.
- **No reconnection flow**: If the WebSocket connection drops or WebRTC enters a failed state, the client does not automatically re-negotiate. This was left out of scope to maintain simplicity and fit the strict timebox constraints.
- **No multi-user**: The signaling server explicitly restricts the roles to exactly one `host` and one `client` at a time. Multi-user conferencing would require implementing rooms, full-mesh signaling, or integrating a Selective Forwarding Unit (SFU).

## What I'd add next
- **TURN server config**: Integrate production TURN credentials (e.g., from Xirsys or a self-hosted Coturn instance) into the `iceServers` array to ensure cross-network connectivity.
- **Reconnection handling**: Implement automatic renegotiation on the client (detecting `disconnected` or `failed` connection states and re-creating/sending a new offer) and Socket.IO auto-reconnects.
- **DataChannel**: Open an `RTCDataChannel` alongside the video tracks to exchange high-frequency telemetry, controls, or metadata out-of-band with minimum latency.
