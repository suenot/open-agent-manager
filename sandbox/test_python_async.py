"""
Test CMDOP Python SDK — AsyncCMDOPClient
Focus: list_sessions, get_history, send_input, polling output
"""
import os
import sys
import asyncio

CMDOP_KEY = os.environ.get("CMDOP_KEY")
if not CMDOP_KEY:
    print("ERROR: CMDOP_KEY not set")
    sys.exit(1)

print(f"=== CMDOP Python Async Test ===")
print(f"API Key: {CMDOP_KEY[:12]}...\n")

from cmdop import AsyncCMDOPClient


async def main():
    # 1. Connect
    print("1. Connecting via AsyncCMDOPClient.remote()...")
    client = AsyncCMDOPClient.remote(api_key=CMDOP_KEY)
    print(f"   Mode: {client.mode}")
    print(f"   Connected: {client.is_connected}")

    # 2. List sessions
    print("\n2. Listing sessions...")
    try:
        result = await client.terminal.list_sessions()
        print(f"   Workspace: {result.workspace_name}")
        print(f"   Total: {result.total}")
        for s in result.sessions:
            print(f"   - {s.session_id} | {s.status} | {s.machine_hostname} | {s.machine_name} | shell={s.shell} | heartbeat={s.heartbeat_age_seconds}s")
    except Exception as e:
        print(f"   list_sessions failed: {e}")
        import traceback
        traceback.print_exc()

    # 3. Find connected session
    print("\n3. Finding connected session...")
    try:
        active = await client.terminal.get_active_session()
        if active:
            print(f"   Active: {active.session_id} ({active.machine_name})")
        else:
            print("   No active sessions!")
            # Try to find any session
            if result and result.sessions:
                active = result.sessions[0]
                print(f"   Using first available: {active.session_id} ({active.status})")
            else:
                print("   No sessions at all, exiting")
                await client.close()
                return
    except Exception as e:
        print(f"   get_active_session failed: {e}")
        import traceback
        traceback.print_exc()
        await client.close()
        return

    session_id = active.session_id
    print(f"   Using session: {session_id}")

    # 4. Get history BEFORE sending input
    print(f"\n4. Getting history (before input)...")
    try:
        history = await client.terminal.get_history(session_id, lines=50)
        print(f"   History data length: {len(history.data) if history.data else 0}")
        print(f"   Total lines: {history.total_lines}")
        if history.data:
            text = history.data.decode('utf-8', errors='replace') if isinstance(history.data, bytes) else str(history.data)
            # Show last 500 chars
            print(f"   Last 500 chars:")
            print(f"   {repr(text[-500:])}")
    except Exception as e:
        print(f"   get_history failed: {e}")
        import traceback
        traceback.print_exc()

    # 5. Send input
    print(f"\n5. Sending 'echo ASYNC-PYTHON-OK-{os.getpid()}'...")
    marker = f"ASYNC-PYTHON-OK-{os.getpid()}"
    try:
        await client.terminal.send_input(session_id, f"echo {marker}\n")
        print("   Input sent OK!")
    except Exception as e:
        print(f"   send_input failed: {e}")
        import traceback
        traceback.print_exc()

    # 6. Poll history for output
    print(f"\n6. Polling history for output (5 attempts, 1s interval)...")
    for i in range(5):
        await asyncio.sleep(1)
        try:
            history = await client.terminal.get_history(session_id, lines=50)
            if history.data:
                text = history.data.decode('utf-8', errors='replace') if isinstance(history.data, bytes) else str(history.data)
                if marker in text:
                    print(f"   [{i+1}] FOUND marker in output!")
                    # Show context around marker
                    idx = text.find(marker)
                    start = max(0, idx - 100)
                    end = min(len(text), idx + len(marker) + 100)
                    print(f"   Context: {repr(text[start:end])}")
                    break
                else:
                    print(f"   [{i+1}] History length={len(text)}, marker not found yet")
            else:
                print(f"   [{i+1}] No history data")
        except Exception as e:
            print(f"   [{i+1}] Poll failed: {e}")
    else:
        print("   Marker not found after 5 attempts")
        # Show what we got
        if history and history.data:
            text = history.data.decode('utf-8', errors='replace') if isinstance(history.data, bytes) else str(history.data)
            print(f"   Last 300 chars: {repr(text[-300:])}")

    # 7. Try execute() convenience method
    print(f"\n7. Trying execute() convenience method...")
    try:
        output, exit_code = await client.terminal.execute("echo EXECUTE-TEST-OK", session_id=session_id)
        text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
        print(f"   Output ({len(text)} chars): {repr(text[:500])}")
        print(f"   Exit code: {exit_code}")
    except Exception as e:
        print(f"   execute() failed: {e}")
        import traceback
        traceback.print_exc()

    # 8. List agents (discovery API)
    print(f"\n8. Listing agents via discovery API...")
    try:
        agents = await AsyncCMDOPClient.list_agents(api_key=CMDOP_KEY)
        print(f"   Found {len(agents)} agents:")
        for a in agents:
            print(f"   - {a.name} ({a.hostname}) | {a.status.value} | {a.platform} | v{a.version}")
    except Exception as e:
        print(f"   list_agents failed: {e}")
        import traceback
        traceback.print_exc()

    # Cleanup
    print("\n9. Closing...")
    await client.close()
    print("   Done.")


asyncio.run(main())
