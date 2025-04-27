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
const enableNotificationsButton = document.getElementById('enable-notifications');
const notificationSound = document.getElementById('notification-sound');
const stopSoundButton = document.getElementById('stop-sound'); // Added Stop Sound button

// --- State ---
const markers = {}; // Store markers { callsign: marker }
let allMessagesData = []; // Store all received message data objects {id: ..., data: aprsInfo}
let messageCounter = 0; // Simple counter for unique message IDs
let currentDetailMessageId = null; // Track which message is shown in details
const notificationCallsigns = ['YM2UDM', 'YM2UDM0']; // Callsigns to trigger notifications
let audioUnlocked = false; // Track if audio context is unlocked
let unlockInProgress = false; // Prevent multiple unlock attempts simultaneously

// --- Audio Unlock ---
// Function to attempt unlocking audio context after user interaction
function unlockAudio(triggeredBy = "unknown") {
    console.log(`unlockAudio called by: ${triggeredBy}. Current state: audioUnlocked=${audioUnlocked}, unlockInProgress=${unlockInProgress}`);
    if (!audioUnlocked && !unlockInProgress) {
        unlockInProgress = true; // Mark that we are attempting to unlock
        console.log("Attempting to unlock audio context...");
        // Try playing and immediately pausing the sound.
        const playPromise = notificationSound.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("Audio play() promise resolved.");
                notificationSound.pause();
                notificationSound.currentTime = 0; // Reset audio
                audioUnlocked = true;
                unlockInProgress = false; // Unlock finished
                console.log("Audio context UNLOCKED successfully.");
                // Remove listeners after successful unlock
                document.body.removeEventListener('click', unlockAudioHandler, true);
                document.body.removeEventListener('touchstart', unlockAudioHandler, true);
            }).catch(error => {
                unlockInProgress = false; // Unlock finished (failed)
                console.error("Audio unlock play() promise REJECTED:", error);
                // Keep listeners active if unlock failed and permission is granted
                // This ensures the next click might succeed.
                if (!audioUnlocked && Notification.permission === "granted") {
                    console.log("Audio unlock failed, ensuring body listeners are present for next interaction.");
                    // Remove just in case they were added multiple times, then add once.
                    document.body.removeEventListener('click', unlockAudioHandler, true);
                    document.body.removeEventListener('touchstart', unlockAudioHandler, true);
                    document.body.addEventListener('click', unlockAudioHandler, { capture: true, once: true });
                    document.body.addEventListener('touchstart', unlockAudioHandler, { capture: true, once: true });
                }
            });
        } else {
             unlockInProgress = false; // Unlock finished (uncertain)
             console.warn("Audio unlock: play() did not return a promise. Cannot confirm unlock status.");
             // Assume it might be unlocked, but rely on subsequent checks.
        }
    } else {
        console.log("Audio unlock skipped (already unlocked or in progress).");
    }
}

// Wrapper handlers for body listeners to pass trigger source
function unlockAudioHandler(event) {
    // Only attempt unlock if permission is granted
    if (Notification.permission === "granted") {
        unlockAudio(`body ${event.type}`);
    } else {
        console.log(`Body ${event.type} detected, but notification permission not granted. Audio unlock skipped.`);
    }
}

// --- Notification Logic ---
function requestNotificationPermission() {
    // Check if the browser supports notifications
    if (!("Notification" in window)) {
        console.error("This browser does not support desktop notification");
        alert("This browser does not support desktop notification. Alerts cannot be shown.");
        enableNotificationsButton.style.display = 'none'; // Hide button if not supported
        return;
    }
    console.log("Notification API is supported.");

    // --- Request permission ---
    console.log("Requesting notification permission...");
    Notification.requestPermission().then((permission) => {
        console.log(`Notification permission result: ${permission}`);

        if (permission === "granted") {
            enableNotificationsButton.style.display = 'none';
            // Test notification
            try {
                new Notification("Notifications Enabled!", { body: "You will now receive earthquake alerts." });
            } catch (e) {
                console.error("Error showing test notification:", e);
                alert("Notifications seem granted, but showing a test failed. Check browser/OS settings.");
            }

            // If audio is not yet unlocked, add listeners to unlock on the *next* user interaction.
            if (!audioUnlocked) {
                 console.log("Permission granted. Adding body listeners to unlock audio on next click/touch.");
                 // Remove potentially old listeners first
                 document.body.removeEventListener('click', unlockAudioHandler, true);
                 document.body.removeEventListener('touchstart', unlockAudioHandler, true);
                 // Add new listeners
                 document.body.addEventListener('click', unlockAudioHandler, { capture: true, once: true });
                 document.body.addEventListener('touchstart', unlockAudioHandler, { capture: true, once: true });
                 alert("Notifications enabled! Click anywhere on the page to enable sound."); // Prompt user
            } else {
                 alert("Notifications enabled!"); // No need to prompt for click if audio already unlocked
            }

        } else if (permission === "denied") {
             enableNotificationsButton.style.display = 'none';
             console.warn("Notification permission was denied. Alerts cannot be shown.");
             alert("Notifications denied. You won't receive alerts. You may need to reset this in browser settings.");
        } else { // permission === "default" (user dismissed the prompt)
            enableNotificationsButton.style.display = 'block'; // Keep visible
            console.log("Notification permission dismissed or not chosen.");
            alert("Notification permission was not granted.");
        }
    });
}

function showNotification(aprsInfo) {
    // Double-check permission before showing
    if (Notification.permission !== "granted") {
        console.log("showNotification: Aborted, permission not granted.");
        return;
    }

    // Extract earthquake data
    const dataParts = aprsInfo.Data.split(' ');
    const magnitudeMatch = aprsInfo.Data.match(/M=([\d.]+)/);
    const location = dataParts.slice(magnitudeMatch ? dataParts.findIndex(p => p.includes('M=')) + 1 : 1).join(' ');
    const magnitude = magnitudeMatch ? magnitudeMatch[1] : 'N/A';

    const title = `Earthquake Alert: M${magnitude}`;
    const body = `Location: ${location}\nFrom: ${aprsInfo.From} To: ${aprsInfo.To}\nTime: ${aprsInfo.Time}`;
    const icon = 'earthquake-icon.png';
    const tag = `aprs-${aprsInfo.From}-${aprsInfo.To}-${Date.now()}`; // Add timestamp for uniqueness if needed

    console.log("showNotification: Creating notification...");
    try {
        const notification = new Notification(title, { body: body, icon: icon, tag: tag });

        notification.onerror = (err) => {
            console.error("Notification error:", err); // Log if notification itself fails
            // This might happen on mobile even if permission seems granted
        };

        // --- Sound Playback ---
        if (audioUnlocked) {
            console.log("showNotification: Audio is unlocked, attempting to play sound.");
            stopSoundButton.style.display = 'inline-block'; // Show stop button
            notificationSound.currentTime = 0; // Reset just in case
            const playPromise = notificationSound.play();
            if(playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Error playing notification sound (even though unlocked):", error);
                    stopSoundButton.style.display = 'none'; // Hide button if play fails
                    audioUnlocked = false; // Assume audio got locked again
                    unlockInProgress = false; // Reset flag
                    console.log("Audio became locked again? Adding body listeners.");
                    document.body.removeEventListener('click', unlockAudioHandler, true);
                    document.body.removeEventListener('touchstart', unlockAudioHandler, true);
                    document.body.addEventListener('click', unlockAudioHandler, { capture: true, once: true });
                    document.body.addEventListener('touchstart', unlockAudioHandler, { capture: true, once: true });
                });
            }
        } else {
            console.warn("showNotification: Audio not unlocked yet. Sound suppressed.");
            stopSoundButton.style.display = 'none'; // Ensure button is hidden
        }

        // --- Notification Click Handler ---
        notification.onclick = () => {
            console.log("Notification clicked.");
            // Try to unlock audio on click *if* it wasn't already unlocked
            if (!audioUnlocked) {
                console.log("Attempting audio unlock from notification click.");
                unlockAudio("notification click");
            }
            window.focus(); // Bring the window to the front
            const message = allMessagesData.find(msg => msg.data === aprsInfo);
            if (message) {
                showDetailPanel(message.id);
            }
            notification.close(); // Close notification after click
        };

    } catch (e) {
        console.error("Failed to create Notification object:", e);
        // This is another point where mobile browsers might fail
    }

    // Optional: Close notification after some time
    // setTimeout(() => notification.close(), 10000);
}

// --- Event Listener for Sound Ending ---
notificationSound.onended = () => {
    console.log("Notification sound finished playing.");
    stopSoundButton.style.display = 'none'; // Hide button when sound ends naturally
};

// --- Event Listener for Stop Sound Button ---
stopSoundButton.addEventListener('click', () => {
    console.log("Stop Sound button clicked.");
    notificationSound.pause();
    notificationSound.currentTime = 0;
    stopSoundButton.style.display = 'none'; // Hide button immediately
});

// Check initial permission status on load
if ("Notification" in window) {
    console.log(`Initial Notification permission state: ${Notification.permission}`);
    if (Notification.permission === "granted") {
        enableNotificationsButton.style.display = 'none';
         // If permission already granted, set up listeners to unlock audio on first interaction
         if (!audioUnlocked) {
             console.log("Permission already granted, adding body listeners for initial interaction to unlock audio.");
             document.body.addEventListener('click', unlockAudioHandler, { capture: true, once: true });
             document.body.addEventListener('touchstart', unlockAudioHandler, { capture: true, once: true });
             // Consider adding a small, dismissible message asking user to click to enable sound?
         }
    } else if (Notification.permission === "denied") {
        enableNotificationsButton.style.display = 'none';
        console.warn("Notifications are denied in browser settings.");
    } else { // default
         enableNotificationsButton.style.display = 'block';
    }
} else {
    enableNotificationsButton.style.display = 'none'; // Hide if not supported
    console.error("Notifications not supported by this browser.");
    // Maybe show a persistent message on the page?
}

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
enableNotificationsButton.addEventListener('click', requestNotificationPermission); // Added listener

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

    // --- Map Interaction ---
    const callsign = aprsInfo.From;
    const marker = markers[callsign];
    // Check if marker exists and the message has coordinates
    if (marker && aprsInfo.latitude !== null && aprsInfo.longitude !== null) {
        const lat = aprsInfo.latitude;
        const lon = aprsInfo.longitude;
        const zoomLevel = 12; // Reduced zoom level

        // Pan/zoom the map to the marker's location and open popup
        map.flyTo([lat, lon], zoomLevel);
        marker.openPopup();
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

    // --- Notification Check ---
    const fromCallsign = aprsInfo.From.toUpperCase();
    const toCallsign = aprsInfo.To.toUpperCase();
    if (notificationCallsigns.includes(fromCallsign) || notificationCallsigns.includes(toCallsign)) {
        showNotification(aprsInfo);
    }
    // --- End Notification Check ---

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
    // Determine WebSocket protocol, host, and port based on page location
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname;
    const wsPath = '/ws'; // The endpoint defined in aiohttp routes
    let wsUri;

    // If accessed via standard HTTP/HTTPS ports (80/443), don't include the port in the WS URI
    // Otherwise (e.g., localhost:8080), include the port.
    if ((wsProtocol === 'ws:' && window.location.port === '80') || (wsProtocol === 'wss:' && window.location.port === '443') || window.location.port === '') {
        wsUri = `${wsProtocol}//${wsHost}${wsPath}`;
    } else {
        wsUri = `${wsProtocol}//${wsHost}:${window.location.port}${wsPath}`;
    }

    console.log(`Attempting WebSocket connection to: ${wsUri}`); // Log the target URI

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
