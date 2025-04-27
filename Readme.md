# Installation and Usage Guide

## Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/sdrangelUDP.git
   cd sdrangelUDP
   ```

2. **Install Python**
   - Ensure you have Python 3.8 or later installed. You can download it from [python.org](https://www.python.org/).

3. **Install Required Python Libraries**
   - Use `pip` to install the required libraries:
     ```bash
     pip install -r requirements.txt
   ```
   - The `aiohttp` library is also required:
     ```bash
     pip install aiohttp
     ```
   *(Note: If you previously installed libraries from a `requirements.txt`, ensure `aiohttp` is added or install it separately)*

4. **Open the Application**
   - The Python script now includes the web server. See Usage below.

## Usage

1. **Run the Combined Server Script**
   - This single script listens for UDP packets (default port 9999), serves the web files (`index.html`, `script.js`, `style.css`), and handles WebSocket connections, all on a single port (default 8080).
   - Start the script in a terminal:
     ```bash
     python receive_aprs.py
     ```
   - The server will print messages indicating it's running and listening on UDP port 9999 and HTTP/WebSocket port 8080.

2. **Access Locally**
   - Open your web browser and navigate to:
     ```
     http://localhost:8080
     ```

3. **(Optional) Access Remotely with Ngrok**
   - To access your map from the internet, you can use [ngrok](https://ngrok.com/).
   - First, ensure the `receive_aprs.py` script is running (Step 1).
   - Install ngrok and authenticate it.
   - Open *another* terminal and run ngrok, pointing it to the port the Python script is using (8080):
     ```bash
     ngrok http 8080
     # If you have a static ngrok domain (replace with yours)
     # ngrok http --domain=your-static-domain.ngrok-free.app 8080
     ```
   - Ngrok will provide a public URL (e.g., `https://random-string.ngrok-free.app`). Use this URL to access your map from anywhere.
   - The WebSocket connection should now work automatically through the same ngrok tunnel.

4. **View the Map**
   - Open the local URL (`http://localhost:8080`) or the ngrok URL in your browser to view the Leaflet map displaying APRS data.

5. **Customize the Application**
   - Modify `script.js` to adjust the map's behavior, WebSocket connection, or data handling.
   - Update `style.css` to change the appearance of the map and interface.

4. **Stop the Application**
   - To stop the Python script, press `Ctrl+C` in the terminal.
   - Close the browser tab displaying the map.
