"""
Test gRPC bidirectional streaming for terminal output.
Uses AsyncCMDOPClient.remote() with API key.
stream() creates a NEW session with full bidirectional I/O.
"""
import asyncio
import os
import sys

# Load .env
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
for line in open(env_path):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()

API_KEY = os.environ.get('CMDOP_KEY')
if not API_KEY:
    print("ERROR: CMDOP_KEY not found in .env")
    sys.exit(1)

print(f"API Key: {API_KEY[:10]}...")


async def test_stream():
    from cmdop import AsyncCMDOPClient

    print("\n=== 1. Connecting to CMDOP (remote) ===")
    client = AsyncCMDOPClient.remote(API_KEY)
    print(f"   Connected! mode={client.mode}")

    # Test stream (bidirectional gRPC) — creates a NEW session
    print("\n=== 2. Testing stream() - bidirectional gRPC ===")
    output_chunks = []

    stream = client.terminal.stream()

    stream.on_output(lambda data: output_chunks.append(data))
    stream.on_error(lambda err: print(f"   STREAM ERROR: {err}"))
    stream.on_status(lambda status: print(f"   STATUS: {status}"))
    stream.on_disconnect(lambda reason: print(f"   DISCONNECTED: {reason}"))

    print("   Connecting stream...")
    stream_sid = await stream.connect(timeout=10.0)
    print(f"   Stream connected! session_id={stream_sid[:20]}...")
    print(f"   State: {stream.state}")

    # Wait for initial shell output (prompt)
    await asyncio.sleep(2)
    print(f"   Initial output ({len(output_chunks)} chunks):")
    for i, chunk in enumerate(output_chunks):
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        print(f"   [{i}] {repr(text[:200])}")

    # Clear chunks
    initial_count = len(output_chunks)
    output_chunks.clear()

    # Send a command
    print("\n=== 3. Sending command: echo HELLO_FROM_GRPC_STREAM ===")
    await stream.send_input("echo HELLO_FROM_GRPC_STREAM\n")

    # Wait for output
    await asyncio.sleep(2)

    print(f"   Output ({len(output_chunks)} chunks):")
    full_output = ""
    for i, chunk in enumerate(output_chunks):
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        full_output += text
        print(f"   [{i}] {repr(text[:200])}")

    if "HELLO_FROM_GRPC_STREAM" in full_output:
        print("\n   SUCCESS! Got command output via gRPC stream!")
    else:
        print(f"\n   No expected output found in: {repr(full_output[:500])}")

    # Test another command
    output_chunks.clear()
    print("\n=== 4. Sending: ls -la / | head -5 ===")
    await stream.send_input("ls -la / | head -5\n")
    await asyncio.sleep(2)

    print(f"   Output ({len(output_chunks)} chunks):")
    for i, chunk in enumerate(output_chunks):
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        print(f"   [{i}] {repr(text[:200])}")

    # Close
    print("\n=== 5. Closing stream ===")
    await stream.close()
    await client.close()
    print("   Done!")

    print(f"\n=== RESULT ===")
    print(f"   stream() creates NEW session with full bidirectional I/O")
    print(f"   NO WebSocket/Centrifugo needed!")
    print(f"   Only API key (cmd_...) required")


asyncio.run(test_stream())
