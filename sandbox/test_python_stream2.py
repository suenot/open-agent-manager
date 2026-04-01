"""
Test CMDOP Python SDK — TerminalStream with known session ID
"""
import os
import sys
import time
import inspect

CMDOP_KEY = os.environ.get("CMDOP_KEY")
# Known connected session from Node.js test
SESSION_ID = "a0da7afb-2c0b-52bc-99c0-fb26a7d2f7e9"

print("=== CMDOP Python TerminalStream Test v2 ===\n")

from cmdop import CMDOPClient, TerminalStream, StreamEvent, StreamState

# Connect
print("1. Connecting...")
client = CMDOPClient.remote(api_key=CMDOP_KEY)
print(f"   Mode: {client.mode}")

# Explore TerminalService
print("\n2. TerminalService methods:")
ts = client.terminal
for name in dir(ts):
    if not name.startswith('_'):
        attr = getattr(ts, name)
        if callable(attr):
            try:
                print(f"   {name}{inspect.signature(attr)}")
            except:
                print(f"   {name}()")

# Explore TerminalStream constructor
print(f"\n3. TerminalStream init: {inspect.signature(TerminalStream.__init__)}")

# Try to create a stream
print(f"\n4. Creating TerminalStream for session {SESSION_ID}...")
output_chunks = []

stream = TerminalStream(
    transport=client.transport,
    session_id=SESSION_ID,
)

def on_output(data):
    text = data if isinstance(data, str) else data.decode('utf-8', errors='replace')
    output_chunks.append(text)
    sys.stdout.write(f"[OUT] {repr(text[:200])}\n")
    sys.stdout.flush()

def on_error(err):
    print(f"[ERR] {err}")

def on_status(status):
    print(f"[STS] {status}")

def on_disconnect(reason=None):
    print(f"[DIS] {reason}")

def on_history(data):
    print(f"[HIS] {data}")

stream.on_output = on_output
stream.on_error = on_error
stream.on_status = on_status
stream.on_disconnect = on_disconnect
stream.on_history = on_history

print(f"   State: {stream.state}")
print(f"   Connected: {stream.is_connected}")

# Connect
print("\n5. Connecting stream...")
try:
    stream.connect()
    print(f"   State after connect: {stream.state}")
    print(f"   Connected: {stream.is_connected}")
except Exception as e:
    print(f"   Connect failed: {e}")
    import traceback
    traceback.print_exc()

# Wait for connection
time.sleep(3)
print(f"   State after wait: {stream.state}")
print(f"   Connected: {stream.is_connected}")

# Send input
print("\n6. Sending 'echo PYTHON-STREAM-OK'...")
try:
    stream.send_input("echo PYTHON-STREAM-OK\n")
    print("   Sent!")
except Exception as e:
    print(f"   Send failed: {e}")

# Wait for output
print("\n7. Waiting 5 seconds for output...")
time.sleep(5)

print(f"\n   Output chunks: {len(output_chunks)}")
for i, chunk in enumerate(output_chunks[:20]):
    print(f"   [{i}] {repr(chunk[:100])}")

# Also try sendInput via terminal service
print("\n8. Trying client.terminal.send_input()...")
try:
    result = client.terminal.send_input(SESSION_ID, "echo DIRECT-SEND-OK\n")
    print(f"   Result: {result}")
except Exception as e:
    print(f"   Failed: {e}")

time.sleep(3)
print(f"   Output chunks now: {len(output_chunks)}")
for i, chunk in enumerate(output_chunks[len(output_chunks)-5:]):
    print(f"   [{i}] {repr(chunk[:100])}")

# Close
print("\n9. Closing...")
stream.close()
client.close()
print("Done.")
