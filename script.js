// Initialize the map and set its view to a default location (e.g., Turkey)
const map = L.map('map').setView([39.9334, 32.8597], 6); // Centered on Ankara, Turkey

// Add a tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const messageList = document.getElementById('message-list');
const markers = {}; // Store markers to potentially update them later

// Function to add or update marker and sidebar entry from WebSocket data
function addOrUpdateAprsData(aprsInfo) {
    if (!aprsInfo || !aprsInfo.From) return; // Basic validation

    const callsign = aprsInfo.From; // Use 'From' callsign as marker ID

    // Add/Update marker if location is available
    if (aprsInfo.latitude !== null && aprsInfo.longitude !== null) {
        const lat = aprsInfo.latitude;
        const lon = aprsInfo.longitude;
        const popupContent = `<b>${callsign}</b><br>${aprsInfo.Data}<br>Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;

        if (markers[callsign]) {
            // Update existing marker position and popup
            markers[callsign].setLatLng([lat, lon]);
            markers[callsign].setPopupContent(popupContent);
        } else {
            // Create new marker
            markers[callsign] = L.marker([lat, lon]).addTo(map);
            markers[callsign].bindPopup(popupContent);
        }
    }

    // Add entry to the sidebar
    const listItem = document.createElement('li');
    // Use data directly from the parsed JSON object
    listItem.innerHTML = `
        <span class="timestamp">${aprsInfo.Date} ${aprsInfo.Time}</span>
        <span class="callsign">From:</span> ${aprsInfo.From}
        <span class="callsign">To:</span> ${aprsInfo.To}
        ${aprsInfo.Via ? `<span class="callsign">Via:</span> ${aprsInfo.Via}` : ''}
        <div class="message-data">${aprsInfo.Data}</div>
    `;
    // Prepend to show newest messages first
    messageList.insertBefore(listItem, messageList.firstChild);

    // Optional: Limit the number of messages in the sidebar
    const maxMessages = 50; // Keep the latest 50 messages
    while (messageList.children.length > maxMessages) {
        messageList.removeChild(messageList.lastChild);
    }
}

// --- WebSocket Connection ---
function connectWebSocket() {
    const wsUri = "ws://localhost:8765"; // Address of the Python WebSocket server
    const websocket = new WebSocket(wsUri);

    websocket.onopen = function(evt) {
        console.log("WebSocket connected to " + wsUri);
        // You could send a message to the server if needed:
        // websocket.send("Hello Server");
    };

    websocket.onclose = function(evt) {
        console.log("WebSocket disconnected. Attempting to reconnect in 5 seconds...");
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onmessage = function(evt) {
        // console.log("Message received: " + evt.data); // Debugging
        try {
            const aprsData = JSON.parse(evt.data);
            addOrUpdateAprsData(aprsData);
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };

    websocket.onerror = function(evt) {
        console.error("WebSocket error:", evt);
        // The onclose event will likely fire after an error, triggering reconnection logic.
    };
}

// Start the WebSocket connection
connectWebSocket();

console.log("APRS Map Initialized and WebSocket connection started.");
