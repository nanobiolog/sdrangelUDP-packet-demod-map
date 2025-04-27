import socket
import sys
import string
import datetime
import shutil
import asyncio
import json
import re
import os # For file paths
from aiohttp import web, WSMsgType

# --- Configuration ---
UDP_IP = "0.0.0.0"  # Listen on all interfaces for UDP
UDP_PORT = 9999     # SDRangel UDP port
WEB_HOST = "0.0.0.0" # Listen on all interfaces for HTTP/WebSocket
WEB_PORT = 8080     # Port for combined HTTP and WebSocket server
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # Directory of the script

# --- Global State ---
row_count = 0
connected_clients = set() # Store active WebSocket connections

# --- WebSocket Handling (aiohttp) ---
async def websocket_handler(request):
    """Handles WebSocket connections."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_clients.add(ws)
    print(f"+++ WebSocket Client Connected: {request.remote}. Total clients: {len(connected_clients)}")

    try:
        async for msg in ws:
            # This server primarily sends, but we can handle incoming messages if needed
            if msg.type == WSMsgType.TEXT:
                print(f"Received WebSocket message: {msg.data}")
                # Example: await ws.send_str(f"Echo: {msg.data}")
            elif msg.type == WSMsgType.ERROR:
                print(f"!!! WebSocket connection closed with exception {ws.exception()}")
    except Exception as e:
        print(f"!!! WebSocket handler error: {e}")
    finally:
        connected_clients.remove(ws)
        print(f"--- WebSocket Client Disconnected: {request.remote}. Total clients: {len(connected_clients)}")

    return ws

async def send_to_clients(message):
    """Sends a message (dict) as JSON to all connected WebSocket clients."""
    if connected_clients:
        json_message = None
        try:
            json_message = json.dumps(message)
            # print(f"Sending to {len(connected_clients)} clients: {json_message[:100]}...") # Reduce console noise
            # Create a list of tasks to send concurrently
            tasks = [client.send_str(json_message) for client in connected_clients]
            # Wait for all sends to complete (or fail)
            results = await asyncio.gather(*tasks, return_exceptions=True)
            # Log any errors during sending
            # for i, result in enumerate(results): # Reduce console noise
            #      if isinstance(result, Exception):
            #           client = list(connected_clients)[i] # Get corresponding client (order might not be guaranteed if set changes during await)
            #           print(f"!!! Error sending to client {client.remote_address}: {result}")

        except Exception as send_e:
            print(f"!!! Error preparing/sending WebSocket message: {send_e}")
            # if json_message: print(f"Failed message data: {json_message}")
    # else: # Reduce console noise
        # print("No WebSocket clients connected, message not sent.")

# --- HTTP Handlers (aiohttp) ---
async def handle_index(request):
    """Serves index.html."""
    file_path = os.path.join(BASE_DIR, 'index.html')
    try:
        return web.FileResponse(file_path)
    except FileNotFoundError:
        return web.Response(status=404, text="index.html not found")

# Removed handle_js and handle_css as add_static handles them now

# --- APRS Parsing Logic (remains the same) ---
def decode_ax25_callsign(data, start, length=7):
    callsign = ""
    ssid = 0
    for i in range(start, start + length):
        if i < len(data):
            char = data[i] >> 1
            if 32 <= char <= 126: callsign += chr(char)
            if i == start + 6: ssid = (data[i] & 0x1E) >> 1
    callsign = callsign.rstrip()
    return f"{callsign}-{ssid}" if ssid else callsign

def parse_packet(data):
    try:
        now = datetime.datetime.now()
        date = now.strftime("%Y-%m-%d")
        time = now.strftime("%H:%M:%S")
        if len(data) < 16: return None
        src = decode_ax25_callsign(data, 0)
        dst = decode_ax25_callsign(data, 7)
        control_pos = 14
        if len(data) < control_pos + 2: return None
        control = data[control_pos]
        pid = data[control_pos + 1]
        via = ""
        data_start = 16
        # Check if the 'H' bit (extension bit) is 0 for the destination address field (byte 14)
        # If it is 0, it means there's a repeater address following.
        if len(data) > 14 and (data[13] & 0x01) == 0: # Check extension bit of Dest SSID byte
             via = decode_ax25_callsign(data, 14)
             data_start = 21
             # Potentially check for more repeater fields if needed
             # while len(data) > data_start - 1 and (data[data_start - 8] & 0x01) == 0:
             #     via += "," + decode_ax25_callsign(data, data_start)
             #     data_start += 7

        data_bytes = data[data_start:]
        data_str = data_bytes.decode('utf-8', errors='ignore')
        data_str = ''.join(c for c in data_str if c in string.printable).strip()
        data_hex = data_bytes.hex()
        frame_type = "UI" if control == 0x03 else "Unknown"
        pid_str = f"0x{pid:02x}"
        latitude = None
        longitude = None
        try:
            # More robust regex allowing for different separators or none
            latLonRegex = r'(\d{4}\.\d{2}[NS])[\\/ ]?(\d{5}\.\d{2}[EW])'
            match = re.search(latLonRegex, data_str)
            if match:
                latDDM, lonDDM = match.groups()
                lat_deg, lat_min, lat_dir = float(latDDM[:2]), float(latDDM[2:-1]), latDDM[-1]
                lon_deg, lon_min, lon_dir = float(lonDDM[:3]), float(lonDDM[3:-1]), lonDDM[-1]
                latitude = lat_deg + lat_min / 60.0
                if lat_dir == 'S': latitude *= -1
                longitude = lon_deg + lon_min / 60.0
                if lon_dir == 'W': longitude *= -1
        except Exception as coord_e:
            print(f"Coordinate parsing error: {coord_e}")
        return {"Date": date, "Time": time, "From": src, "To": dst, "Via": via,
                "Type": frame_type, "PID": pid_str, "Data": data_str,
                "Data_Hex": data_hex, "latitude": latitude, "longitude": longitude}
    except Exception as e:
        print(f"Parsing error: {e}")
        return None

def print_row(packet, is_header=False):
    global row_count
    try: term_width = shutil.get_terminal_size().columns
    except OSError: term_width = 80
    col_widths = {"Date": 10, "Time": 8, "From": 12, "To": 12, "Via": 12, "Type": 6, "PID": 6}
    fixed_width = sum(col_widths.values()) + len(col_widths) * 3
    data_width = max(20, term_width - fixed_width - 2)
    if is_header:
        fields = {k: k.ljust(w) for k, w in col_widths.items()}
        fields["Data"] = "Data".ljust(data_width)
    elif packet:
        fields = {k: str(packet.get(k, ""))[:w].ljust(w) for k, w in col_widths.items()} # Ensure value is string
        data_val = str(packet.get("Data", "")) # Ensure value is string
        fields["Data"] = (data_val[:data_width-3] + "...") if len(data_val) > data_width else data_val[:data_width]
    else: return
    print(f"{fields['Date']}   {fields['Time']}   {fields['From']}   {fields['To']}   {fields['Via']}   {fields['Type']}   {fields['PID']}   {fields['Data']}")
    if not is_header: row_count += 1

# --- UDP Listener Logic (using asyncio) ---
class UdpProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        packet = parse_packet(data)
        if packet:
            # print(f"Attempting to send packet from {packet.get('From', 'N/A')} via WebSocket...") # Reduce console noise
            # Schedule send_to_clients without awaiting it here
            asyncio.create_task(send_to_clients(packet))
            # Print to console
            global row_count
            if row_count % 20 == 0: print_row(None, is_header=True) # Print header less often
            print_row(packet)
        # else: # Reduce console noise
            # print(f"Received from {addr}: Invalid packet (Raw hex: {data.hex()})")

    def error_received(self, exc):
        print(f"UDP Error received: {exc}")

    def connection_lost(self, exc):
        print("UDP Socket closed")

async def start_udp_listener(loop):
    """Starts the UDP listener."""
    try:
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: UdpProtocol(),
            local_addr=(UDP_IP, UDP_PORT)
        )
        print(f"Listening for APRS packets on UDP port {UDP_PORT}...")
        # Keep the listener running (the web server will keep the loop alive)
    except OSError as e:
        print(f"Error binding to UDP port {UDP_PORT}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"UDP Listener error: {e}")
        # Consider if transport needs closing here

# --- Main Application Setup ---
async def main():
    # Create aiohttp application
    app = web.Application()

    # Add routes
    app.router.add_get('/ws', websocket_handler) # WebSocket endpoint
    app.router.add_get('/', handle_index)        # Serve index.html at the root
    # Serve all other static files (js, css, png, mp3, etc.) from the base directory
    # This MUST come after specific routes like '/' and '/ws'
    app.router.add_static('/', path=BASE_DIR, name='static', show_index=False) # show_index=False prevents serving index.html again

    # Get the current event loop
    loop = asyncio.get_running_loop()

    # Start the UDP listener as a background task
    udp_task = loop.create_task(start_udp_listener(loop))

    # Setup and run the web server
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, WEB_HOST, WEB_PORT)
    print(f"HTTP/WebSocket server started on http://{WEB_HOST}:{WEB_PORT}")
    await site.start()

    # Keep the server running until interrupted
    print("Server running. Press Ctrl+C to stop.")
    try:
        # Keep alive indefinitely (or until UDP task finishes, though it shouldn't)
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        pass # Expected on shutdown
    finally:
        # Cleanup
        print("Shutting down...")
        await runner.cleanup()
        if udp_task and not udp_task.done():
            udp_task.cancel()
            try:
                await udp_task
            except asyncio.CancelledError:
                pass
        print("Shutdown complete.")

if __name__ == "__main__":
    try:
        print_row(None, is_header=True) # Print initial console header
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user")
    except Exception as e:
        print(f"Unexpected error in main execution: {e}")
