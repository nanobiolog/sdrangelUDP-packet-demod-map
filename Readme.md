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
   - Open `index.html` in your web browser to view the application.

## Usage

1. **Run the APRS Receiver Script**
   - Start the `receive_aprs.py` script to receive APRS data:
     ```bash
     python receive_aprs.py
     ```

2. **View the Map**
   - Open the `index.html` file in your browser to view the Leaflet map displaying APRS data.

3. **Customize the Application**
   - Modify `script.js` to adjust the map's behavior or data handling.
   - Update `style.css` to change the appearance of the map and interface.

4. **Stop the Application**
   - To stop the Python script, press `Ctrl+C` in the terminal.
   - Close the browser tab displaying the map.