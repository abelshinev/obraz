# Obraz — Real-Time Stream Viewer

## Setup
# Terminal 1
cd server && npm install && node index.js

# Terminal 2  
cd client && npm install && npm run dev

## Usage
1. Open http://localhost:5173/host.html — Host dashboard
2. Open http://localhost:5173/ — Client page
3. Click Start on Client, grant webcam + screen permissions
4. Both feeds appear on Host with live timestamp

## Architecture
Client (browser) ──WebRTC──> Host (browser)
         \                    /
          └── Socket.IO ─────┘
           (signaling only)

Video never touches the server.