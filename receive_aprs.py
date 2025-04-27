import socket
import sys
import string
import datetime
import shutil
import asyncio
import websockets
import json # To send data as JSON

UDP_IP = "0.0.0.0"  # Listen on all interfaces
UDP_PORT = 9999     # Match SDRangel port

# Global counter for rows printed (optional now, can be removed if console output is not primary)
row_count = 0

# --- WebSocket Server Setup ---
connected_clients = set()

async def register(websocket):
    connected_clients.add(websocket)
    print(f"Client connected: {websocket.remote_address}")
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.remove(websocket)
        print(f"Client disconnected: {websocket.remote_address}")

async def send_to_clients(message):
    if connected_clients:
        # Convert message (dict) to JSON string
        json_message = json.dumps(message)
        # Use asyncio.gather to send concurrently
        await asyncio.gather(
            *[client.send(json_message) for client in connected_clients]
        )

# --- APRS Parsing Logic (remains mostly the same) ---
def decode_ax25_callsign(data, start, length=7):
    """Decode AX.25 callsign from shifted ASCII (6 bytes + SSID)."""
    callsign = ""
    ssid = 0
    for i in range(start, start + length):
        if i < len(data):
            char = data[i] >> 1  # Unshift AX.25 callsign byte
            if 32 <= char <= 126:  # Printable ASCII
                callsign += chr(char)
            if i == start + 6:  # SSID byte
                ssid = (data[i] & 0x1E) >> 1  # Extract SSID
    callsign = callsign.rstrip()
    return f"{callsign}-{ssid}" if ssid else callsign

def parse_packet(data):
    """Parse raw packet to extract table fields."""
    try:
        # Current timestamp for Date and Time
        now = datetime.datetime.now()
        date = now.strftime("%Y-%m-%d")
        time = now.strftime("%H:%M:%S")

        # Assume packet format: [header][control][PID][data]
        if len(data) < 16:  # Minimum for header + control + PID
            return None

        # Extract Source and Destination callsigns
        src = decode_ax25_callsign(data, 0)
        dst = decode_ax25_callsign(data, 7)

        # Assume control (1 byte) and PID (1 byte) follow
        control_pos = 14
        if len(data) < control_pos + 2:
            return None
        control = data[control_pos]
        pid = data[control_pos + 1]

        # Via field (simplified, assumes single digipeater or none)
        via = ""
        if len(data) > 16 and (data[14] & 0x01) == 0:  # More addresses
            via = decode_ax25_callsign(data, 14)
            data_start = 21
        else:
            data_start = 16

        # Data field (ASCII)
        data_str = data[data_start:].decode('utf-8', errors='ignore')
        data_str = ''.join(c for c in data_str if c in string.printable).strip()

        # Type (simplified)
        frame_type = "UI" if control == 0x03 else "Unknown"

        # PID (hex)
        pid_str = f"0x{pid:02x}"

        # Attempt to extract coordinates from the data string for WebSocket message
        latitude = None
        longitude = None
        try:
            # Regex to find latitude and longitude in various formats
            latLonRegex = r'(\d{4}\.\d{2}[NS]).?(\d{5}\.\d{2}[EW])'
            match = re.search(latLonRegex, data_str)
            if match:
                latDDM = match.group(1)
                lonDDM = match.group(2)
                # Basic DDM to DD conversion (needs a helper function like in script.js)
                lat_deg = float(latDDM[:2])
                lat_min = float(latDDM[2:-1])
                lat_dir = latDDM[-1]
                lon_deg = float(lonDDM[:3])
                lon_min = float(lonDDM[3:-1])
                lon_dir = lonDDM[-1]

                latitude = lat_deg + lat_min / 60.0
                if lat_dir == 'S': latitude *= -1
                longitude = lon_deg + lon_min / 60.0
                if lon_dir == 'W': longitude *= -1
        except Exception as coord_e:
            print(f"Coordinate parsing error within parse_packet: {coord_e}") # Log coord parsing errors

        return {
            "Date": date,
            "Time": time,
            "From": src,
            "To": dst,
            "Via": via,
            "Type": frame_type,
            "PID": pid_str,
            "Data": data_str,
            "latitude": latitude, # Add extracted coordinates
            "longitude": longitude # Add extracted coordinates
        }
    except Exception as e:
        print(f"Parsing error: {e}")
        return None

def print_row(packet, is_header=False):
    """Print packet or header in a single row, maximizing Data column."""
    global row_count

    # Get terminal width
    try:
        term_width = shutil.get_terminal_size().columns
    except OSError: # Handle cases where terminal size cannot be determined (e.g., running non-interactively)
        term_width = 80 # Default width

    # Fixed column widths
    col_widths = {
        "Date": 10,  # YYYY-MM-DD
        "Time": 8,   # HH:MM:SS
        "From": 12,  # Callsign (e.g., YM2ETM-6)
        "To": 12,    # Callsign (e.g., APRS)
        "Via": 12,   # Callsign or empty
        "Type": 6,   # UI, Unknown
        "PID": 6     # 0xf0
    }

    # Calculate available width for Data
    fixed_width = sum(col_widths.values()) + len(col_widths) * 3  # 3 spaces between columns
    data_width = max(20, term_width - fixed_width - 2)  # Minimum 20 chars for Data

    # Prepare fields
    if is_header:
        fields = {
            "Date": "Date".ljust(col_widths["Date"]),
            "Time": "Time".ljust(col_widths["Time"]),
            "From": "From".ljust(col_widths["From"]),
            "To": "To".ljust(col_widths["To"]),
            "Via": "Via".ljust(col_widths["Via"]),
            "Type": "Type".ljust(col_widths["Type"]),
            "PID": "PID".ljust(col_widths["PID"]),
            "Data": "Data".ljust(data_width)
        }
    elif packet: # Ensure packet is not None
        fields = {
            "Date": packet.get("Date", "")[:col_widths["Date"]].ljust(col_widths["Date"]),
            "Time": packet.get("Time", "")[:col_widths["Time"]].ljust(col_widths["Time"]),
            "From": packet.get("From", "")[:col_widths["From"]].ljust(col_widths["From"]),
            "To": packet.get("To", "")[:col_widths["To"]].ljust(col_widths["To"]),
            "Via": packet.get("Via", "")[:col_widths["Via"]].ljust(col_widths["Via"]),
            "Type": packet.get("Type", "")[:col_widths["Type"]].ljust(col_widths["Type"]),
            "PID": packet.get("PID", "")[:col_widths["PID"]].ljust(col_widths["PID"]),
            "Data": packet.get("Data", "")[:data_width]
        }
        if len(packet.get("Data", "")) > data_width:
            fields["Data"] = packet.get("Data", "")[:data_width-3] + "..."  # Truncate with ellipsis
    else:
        # Handle case where packet is None but is_header is False (should not happen with current logic but good practice)
        return

    # Print row
    print(f"{fields['Date']}   {fields['Time']}   {fields['From']}   {fields['To']}   {fields['Via']}   {fields['Type']}   {fields['PID']}   {fields['Data']}")

    # Increment row count for data rows
    if not is_header:
        row_count += 1

# Removed the old synchronous try...while loop here

async def udp_listener(loop):
    """Listen for UDP packets and process them."""
    try:
        # Create UDP socket using asyncio
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: UdpProtocol(), # Simple protocol handler
            local_addr=(UDP_IP, UDP_PORT)
        )
        print(f"Listening for APRS packets on UDP port {UDP_PORT}...")
        # Keep the listener running
        await asyncio.Event().wait() # Keep running indefinitely

    except OSError as e:
        print(f"Error binding to UDP port {UDP_PORT}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"UDP Listener error: {e}")
    finally:
        if 'transport' in locals() and transport:
            transport.close()

class UdpProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        # print(f"UDP Packet from {addr}") # Debugging
        packet = parse_packet(data) # parse_packet now also extracts lat/lon if possible
        if packet:
            # Send parsed packet (including potential lat/lon) to connected WebSocket clients
            asyncio.create_task(send_to_clients(packet))

            # Optional: Still print to console
            global row_count
            print_row(packet)
            if row_count % 10 == 0:
                print_row(None, is_header=True)
        else:
            # Optionally send raw data or error message via WebSocket too
            # error_msg = {"error": "Invalid packet", "source": str(addr), "raw_hex": data.hex()}
            # asyncio.create_task(send_to_clients(error_msg))
            print(f"Received from {addr}: Invalid packet (Raw hex: {data.hex()})")

    def error_received(self, exc):
        print(f"UDP Error received: {exc}")

    def connection_lost(self, exc):
        print("UDP Socket closed")

async def main():
    # Get the current event loop
    loop = asyncio.get_running_loop()

    # Start the WebSocket server
    # Listen on localhost, choose a port (e.g., 8765)
    websocket_server = await websockets.serve(register, "localhost", 8765)
    print(f"WebSocket server started on ws://localhost:8765")

    # Start the UDP listener task
    udp_task = asyncio.create_task(udp_listener(loop))

    # Keep both running
    await asyncio.gather(udp_task) # WebSocket server runs implicitly

if __name__ == "__main__":
    # Need to import re for coordinate parsing
    import re
    try:
        # Print initial header for console output
        print_row(None, is_header=True)
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped by user")
    except Exception as e:
        print(f"Unexpected error in main: {e}")
