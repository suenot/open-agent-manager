"""
Попытка получить output через TerminalStream (правильно с await).
TerminalStream — agent-side: создаёт НОВУЮ сессию как демон.
"""
import os, asyncio
from pathlib import Path

for line in (Path(__file__).parent.parent / ".env").read_text().strip().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

from cmdop import AsyncCMDOPClient, TerminalStream

async def main():
    client = AsyncCMDOPClient.remote(api_key=os.environ["CMDOP_KEY"])

    print("=== TerminalStream test (agent-side, creates NEW session) ===\n")

    stream = TerminalStream(transport=client.transport)
    output_chunks = []

    stream.on_output(lambda data: output_chunks.append(data))
    stream.on_error(lambda err: print(f"[ERR] {err}"))
    stream.on_status(lambda s: print(f"[STS] {s}"))
    stream.on_disconnect(lambda reason: print(f"[DIS] {reason}"))

    # connect() — async, returns session_id
    print("1. Connecting (creates new session as agent)...")
    try:
        new_sid = await stream.connect(timeout=10)
        print(f"   Session ID: {new_sid}")
        print(f"   State: {stream.state}, connected: {stream.is_connected}")
    except Exception as e:
        print(f"   FAILED: {e}")
        import traceback; traceback.print_exc()
        await client.close()
        return

    # Wait for shell prompt
    print("\n2. Waiting 3s for shell prompt...")
    await asyncio.sleep(3)
    print(f"   Output chunks: {len(output_chunks)}")
    for i, chunk in enumerate(output_chunks):
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        print(f"   [{i}] {repr(text[:300])}")

    # Send ls
    print("\n3. Sending: ls -la /tmp")
    try:
        await stream.send_input("ls -la /tmp\n")
        print("   Sent!")
    except Exception as e:
        print(f"   FAILED: {e}")

    # Wait for output
    print("\n4. Waiting 3s for output...")
    await asyncio.sleep(3)
    print(f"   Output chunks now: {len(output_chunks)}")
    for i, chunk in enumerate(output_chunks):
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        print(f"   [{i}] {repr(text[:300])}")

    # Send whoami
    print("\n5. Sending: whoami")
    await stream.send_input("whoami\n")
    await asyncio.sleep(2)
    print(f"   Output chunks now: {len(output_chunks)}")
    # Show only new chunks
    all_text = ""
    for chunk in output_chunks:
        text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
        all_text += text
    print(f"\n   === FULL OUTPUT ===")
    print(all_text)
    print(f"   === END OUTPUT ===")

    # Cleanup
    print("\n6. Closing...")
    await stream.close()
    await client.close()
    print("Done.")

asyncio.run(main())
