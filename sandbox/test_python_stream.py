"""
Test CMDOP Python SDK — TerminalStream for real-time output via gRPC
"""
import os
import sys
import time
import threading

CMDOP_KEY = os.environ.get("CMDOP_KEY")

print("=== CMDOP Python TerminalStream Test ===\n")

from cmdop import CMDOPClient, TerminalStream, StreamEvent, StreamState
import inspect

# Explore CMDOPClient constructor
print("1. CMDOPClient constructor signature:")
print(f"   {inspect.signature(CMDOPClient.__init__)}\n")

# Explore class methods
print("2. CMDOPClient class methods:")
for m in ['remote', 'local', 'from_transport']:
    if hasattr(CMDOPClient, m):
        func = getattr(CMDOPClient, m)
        try:
            print(f"   {m}: {inspect.signature(func)}")
        except:
            print(f"   {m}: (no signature)")

# Connect
print("\n3. Connecting via CMDOPClient.remote()...")
try:
    client = CMDOPClient.remote(api_key=CMDOP_KEY)
    print(f"   Connected: {client.is_connected}")
    print(f"   Mode: {client.mode}")
except Exception as e:
    print(f"   Failed: {e}")
    sys.exit(1)

# List sessions
print("\n4. Listing sessions...")
try:
    result = client.terminal.list()
    print(f"   Total: {result.total}")
    for s in result.sessions:
        print(f"   - {s.session_id} | {s.status} | {s.hostname} | {s.machine_name}")
except Exception as e:
    print(f"   List failed: {e}")

# Find connected session
sessions = result.sessions if result else []
connected = [s for s in sessions if s.status == "connected"]

if not connected:
    print("\n   No connected sessions!")
    client.close()
    sys.exit(0)

session = connected[0]
session_id = session.session_id
print(f"\n   Using: {session_id} ({session.machine_name})")

# Explore TerminalStream
print("\n5. TerminalStream signature:")
print(f"   {inspect.signature(TerminalStream.__init__)}")

# Create TerminalStream
print("\n6. Creating TerminalStream...")
output_chunks = []

def on_output(data):
    text = data if isinstance(data, str) else data.decode('utf-8', errors='replace')
    output_chunks.append(text)
    print(f"   [OUTPUT] {repr(text[:200])}")

def on_error(err):
    print(f"   [ERROR] {err}")

def on_status(status):
    print(f"   [STATUS] {status}")

def on_disconnect(reason=None):
    print(f"   [DISCONNECT] {reason}")

try:
    # Try to create stream using the client's transport
    stream = TerminalStream(
        transport=client.transport,
        session_id=session_id,
    )
    stream.on_output = on_output
    stream.on_error = on_error
    stream.on_status = on_status
    stream.on_disconnect = on_disconnect

    print(f"   Stream created. State: {stream.state}")

    # Connect the stream
    print("   Connecting stream...")
    stream.connect()
    print(f"   Stream state: {stream.state}")
    print(f"   Stream connected: {stream.is_connected}")

    # Wait for connection
    time.sleep(2)

    # Send input
    print("\n7. Sending 'echo PYTHON-STREAM-OK'...")
    stream.send_input("echo PYTHON-STREAM-OK\n")
    print("   Input sent!")

    # Wait for output
    print("\n8. Waiting for output (5 seconds)...")
    time.sleep(5)

    print(f"\n   Collected {len(output_chunks)} output chunks")
    for i, chunk in enumerate(output_chunks[:10]):
        print(f"   [{i}] {repr(chunk[:100])}")

    # Close
    print("\n9. Closing stream...")
    stream.close()

except Exception as e:
    print(f"   TerminalStream failed: {e}")
    import traceback
    traceback.print_exc()

print("\n10. Closing client...")
client.close()
print("   Done.")
