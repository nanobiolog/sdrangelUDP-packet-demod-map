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

4. **Set Up a Local Server**
   - If you don't have a local server, you can use Python's built-in HTTP server:
     ```bash
     python -m http.server
     ```

5. **Open the Application**
   - Open `index.html` in your web browser (e.g., http://localhost:8000) to view the application locally.

## Usage

1. **Run the APRS Receiver Script**
   - This script listens for UDP packets (default port 9999) and forwards parsed APRS data via WebSocket (default port 8765).
   - Start the script in a terminal:
     ```bash
     python receive_aprs.py
     ```

2. **Run the Local Web Server**
   - To view the `index.html` page, you need a web server. Use Python's built-in server in the project directory. Open a *separate* terminal for this:
     ```bash
     # Serve on port 8000 (default)
     python -m http.server 8000
     # OR serve on port 80 (might require admin/sudo privileges)
     python -m http.server 80
     ```
   - Access the map locally via `http://localhost:8000` or `http://localhost:80` depending on the port you chose.

3. **(Optional) Access Remotely with Ngrok**
   - To access your map from the internet, you can use [ngrok](https://ngrok.com/).
   - First, ensure your Python HTTP server is running (Step 2).
   - Install ngrok and authenticate it.
   - Open *another* terminal and run ngrok, pointing it to the port your local server is using:
     ```bash
     # If your server is on port 8000
     ngrok http 8000
     # If your server is on port 80
     ngrok http 80
     # If you have a static ngrok domain (replace with yours)
     ngrok http --domain=your-static-domain.ngrok-free.app 80
     ```
   - Ngrok will provide a public URL (e.g., `https://random-string.ngrok-free.app`). Use this URL to access your map from anywhere.
   - **Note:** For the WebSocket connection (live data updates) to work remotely via ngrok, you might need to:
     a) Update the WebSocket URL in `script.js` to use the ngrok domain (e.g., `wss://your-ngrok-domain...`).
     b) Potentially tunnel the WebSocket port (8765) as well, depending on your setup and ngrok plan.

4. **View the Map**
   - Open the local URL (`http://localhost:PORT`) or the ngrok URL in your browser to view the Leaflet map displaying APRS data.

5. **Customize the Application**
   - Modify `script.js` to adjust the map's behavior, WebSocket connection, or data handling.
   - Update `style.css` to change the appearance of the map and interface.

4. **Stop the Application**
   - To stop the Python script, press `Ctrl+C` in the terminal.
   - Close the browser tab displaying the map.
