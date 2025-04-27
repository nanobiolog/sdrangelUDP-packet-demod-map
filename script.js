// Initialize the map and set its view, ensuring zoom control is present
const map = L.map('map', {
    zoomControl: true // Explicitly enable zoom control (default is true)
}).setView([39.9334, 32.8597], 6); // Centered on Ankara, Turkey

// Add a tile layer (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// --- DOM Elements ---
const messageList = document.getElementById('message-list');
const filterFromInput = document.getElementById('filter-from');
const filterToInput = document.getElementById('filter-to');
const filterDataInput = document.getElementById('filter-data');
const clearFiltersButton = document.getElementById('clear-filters');
const deleteAllButton = document.getElementById('delete-all-messages');
const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');
const detailCloseButton = document.getElementById('detail-close-button');

// --- State ---
const markers = {}; // Store markers { callsign: marker }
let allMessagesData = []; // Store all received message data objects {id: ..., data: aprsInfo}
let messageCounter = 0; // Simple counter for unique message IDs
let currentDetailMessageId = null; // Track which message is shown in details

// --- Filtering Logic ---
function applyFilters() {
    const filterFrom = filterFromInput.value.toLowerCase();
    const filterTo = filterToInput.value.toLowerCase();
    const filterData = filterDataInput.value.toLowerCase();

    allMessagesData.forEach(msg => {
        const listItem = document.getElementById(`msg-${msg.id}`);
        if (!listItem) return; // Skip if element not found

        const fromMatch = !filterFrom || msg.data.From.toLowerCase().includes(filterFrom);
        const toMatch = !filterTo || msg.data.To.toLowerCase().includes(filterTo);
        const dataMatch = !filterData || msg.data.Data.toLowerCase().includes(filterData);

        const isVisible = fromMatch && toMatch && dataMatch;

        listItem.classList.toggle('hidden', !isVisible);

        // Also hide/show corresponding marker
        const marker = markers[msg.data.From];
        if (marker) {
            // Determine if *any* message for this callsign is visible
            const markerShouldBeVisible = allMessagesData.some(m =>
                m.data.From === msg.data.From && // Marker belongs to this callsign
                document.getElementById(`msg-${m.id}`) && // Check if list item exists
                !document.getElementById(`msg-${m.id}`).classList.contains('hidden') // At least one message for this callsign is visible
            );

            if (markerShouldBeVisible && !map.hasLayer(marker)) {
                map.addLayer(marker);
            } else if (!markerShouldBeVisible && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }
    });
}

// --- Event Listeners ---
filterFromInput.addEventListener('input', applyFilters);
filterToInput.addEventListener('input', applyFilters);
filterDataInput.addEventListener('input', applyFilters);

clearFiltersButton.addEventListener('click', () => {
    filterFromInput.value = '';
    filterToInput.value = '';
    filterDataInput.value = '';
    applyFilters(); // Re-apply to show all
    hideDetailPanel(); // Also hide detail panel when clearing filters
});

deleteAllButton.addEventListener('click', () => {
    hideDetailPanel(); // Hide detail panel when deleting all
    // Remove all list items
    messageList.innerHTML = '';
    // Remove all markers from map and clear storage
    for (const callsign in markers) {
        if (map.hasLayer(markers[callsign])) {
            map.removeLayer(markers[callsign]);
        }
        delete markers[callsign];
    }
    // Clear the message data store
    allMessagesData = [];
    // Clear detail panel content just in case
    detailContent.innerHTML = '';
});

detailCloseButton.addEventListener('click', hideDetailPanel);

// --- Detail Panel Logic ---
function hideDetailPanel() {
    detailPanel.classList.add('hidden');
    currentDetailMessageId = null;
    // Remove highlight from previously selected message
    const highlighted = messageList.querySelector('.highlighted');
    if (highlighted) {
        highlighted.classList.remove('highlighted');
    }
}

function showDetailPanel(messageId) {
    const message = allMessagesData.find(msg => msg.id === messageId);
    if (!message) {
        hideDetailPanel(); // Hide if message not found (e.g., deleted)
        return;
    }

    const aprsInfo = message.data;
    detailContent.innerHTML = `
        <div><strong>Date:</strong> <span>${aprsInfo.Date || 'N/A'}</span></div>
        <div><strong>Time:</strong> <span>${aprsInfo.Time || 'N/A'}</span></div>
        <div><strong>From:</strong> <span>${aprsInfo.From || 'N/A'}</span></div>
        <div><strong>To:</strong> <span>${aprsInfo.To || 'N/A'}</span></div>
        <div><strong>Via:</strong> <span>${aprsInfo.Via || 'N/A'}</span></div>
        <div><strong>Type:</strong> <span>${aprsInfo.Type || 'N/A'}</span></div>
        <div><strong>PID:</strong> <span>${aprsInfo.PID || 'N/A'}</span></div>
        <div><strong>Data:</strong> <span>${aprsInfo.Data || ''}</span></div>
        <div><strong>Data (Hex):</strong> <span>${aprsInfo.Data_Hex || ''}</span></div>
    `;
    detailPanel.classList.remove('hidden');
    currentDetailMessageId = messageId;

    // Highlight the selected message in the list
    const highlighted = messageList.querySelector('.highlighted');
    if (highlighted) {
        highlighted.classList.remove('highlighted');
    }
    const listItem = document.getElementById(`msg-${messageId}`);
    if (listItem) {
        listItem.classList.add('highlighted');
    }
}

// --- Message Handling ---
function deleteMessage(messageId, callsign) {
    // If the message being deleted is the one shown in details, hide the panel
    if (messageId === currentDetailMessageId) {
        hideDetailPanel();
    }

    // Remove list item
    const listItem = document.getElementById(`msg-${messageId}`);
    if (listItem) {
        listItem.remove();
    }

    // Remove message data from store
    allMessagesData = allMessagesData.filter(msg => msg.id !== messageId);

    // Check if any other messages use the same marker
    const markerInUse = allMessagesData.some(msg => msg.data.From === callsign);

    // If marker exists and is no longer needed, remove it
    if (markers[callsign] && !markerInUse) {
        if (map.hasLayer(markers[callsign])) {
            map.removeLayer(markers[callsign]);
        }
        delete markers[callsign];
    }
    // Re-apply filters in case the deleted message affected marker visibility
    applyFilters();
}

// Function to add or update marker and sidebar entry from WebSocket data
function addOrUpdateAprsData(aprsInfo) {
    if (!aprsInfo || !aprsInfo.From) return; // Basic validation

    const callsign = aprsInfo.From; // Use 'From' callsign as marker ID
    const messageId = messageCounter++; // Assign a unique ID

    // Store the raw data with its ID
    const messageData = { id: messageId, data: aprsInfo };
    allMessagesData.push(messageData);

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
            markers[callsign] = L.marker([lat, lon]); // Don't add to map yet
            markers[callsign].bindPopup(popupContent);
        }
    }

    // Add entry to the sidebar
    const listItem = document.createElement('li');
    listItem.id = `msg-${messageId}`; // Assign unique ID to the list item
    listItem.style.cursor = 'pointer'; // Indicate it's clickable
    // Use data directly from the parsed JSON object
    listItem.innerHTML = `
        <button class="delete-button" title="Delete message">X</button>
        <span class="timestamp">${aprsInfo.Date} ${aprsInfo.Time}</span>
        <span class="callsign">From:</span> ${aprsInfo.From}
        <span class="callsign">To:</span> ${aprsInfo.To}
        ${aprsInfo.Via ? `<span class="callsign">Via:</span> ${aprsInfo.Via}` : ''}
        <div class="message-data">${aprsInfo.Data}</div>
    `;

    // Add delete functionality to the button
    const deleteBtn = listItem.querySelector('.delete-button');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering click on list item
        deleteMessage(messageId, callsign);
    });

    // Add click listener to show details
    listItem.addEventListener('click', () => {
        showDetailPanel(messageId);
    });

    // Prepend to show newest messages first
    messageList.insertBefore(listItem, messageList.firstChild);

    // Apply filters to the newly added item and potentially update marker visibility
    applyFilters();

    // Optional: Limit the number of messages in the sidebar (by removing oldest from data store and DOM)
    const maxMessages = 100; // Keep the latest 100 messages
    if (allMessagesData.length > maxMessages) {
        const oldestMessage = allMessagesData.shift(); // Remove oldest from data array
        if (oldestMessage) { // Ensure oldestMessage is not undefined
             deleteMessage(oldestMessage.id, oldestMessage.data.From); // Remove from DOM/map
        }
    }
}

// --- WebSocket Connection ---
function connectWebSocket() {
    const wsUri = "ws://localhost:8765"; // Address of the Python WebSocket server
    const websocket = new WebSocket(wsUri);

    websocket.onopen = function(evt) {
        console.log("WebSocket connected to " + wsUri);
    };

    websocket.onclose = function(evt) {
        console.log("WebSocket disconnected. Attempting to reconnect in 5 seconds...");
        setTimeout(connectWebSocket, 5000);
    };

    websocket.onmessage = function(evt) {
        try {
            const aprsData = JSON.parse(evt.data);
            addOrUpdateAprsData(aprsData);
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };

    websocket.onerror = function(evt) {
        console.error("WebSocket error:", evt);
    };
}

// Start the WebSocket connection
connectWebSocket();

console.log("APRS Map Initialized and WebSocket connection started.");
