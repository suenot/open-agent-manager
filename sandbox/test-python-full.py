"""
Full Python SDK (cmdop) exploration
Tests ALL available methods and documents results
"""
import os
import sys
import json
import asyncio
import inspect

# Load .env
from pathlib import Path
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().strip().split("\n"):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip()

CMDOP_KEY = os.environ.get("CMDOP_KEY")
CMDOP_MACHINE = os.environ.get("CMDOP_MACHINE")

print("=== CMDOP Python SDK — Full Exploration ===")
print(f"API Key: {CMDOP_KEY[:12]}...")
print(f"Machine: {CMDOP_MACHINE}\n")

import cmdop
print(f"cmdop version: {cmdop.__version__ if hasattr(cmdop, '__version__') else 'unknown'}")

# List all top-level exports
print(f"\ncmdop exports: {[x for x in dir(cmdop) if not x.startswith('_')]}")

from cmdop import CMDOPClient, AsyncCMDOPClient

# =============== SYNC CLIENT ===============
def test_sync():
    print("\n" + "="*60)
    print("SYNC CLIENT (CMDOPClient)")
    print("="*60)

    client = CMDOPClient.remote(api_key=CMDOP_KEY)
    print(f"Mode: {client.mode}")
    print(f"Client attrs: {[x for x in dir(client) if not x.startswith('_')]}")

    # Terminal service
    ts = client.terminal
    print(f"\nTerminal service methods:")
    for name in dir(ts):
        if not name.startswith('_'):
            attr = getattr(ts, name)
            if callable(attr):
                try:
                    sig = inspect.signature(attr)
                    print(f"  terminal.{name}{sig}")
                except:
                    print(f"  terminal.{name}()")

    # List sessions
    print(f"\n--- list() ---")
    try:
        result = ts.list()
        print(f"Type: {type(result)}")
        print(f"Result: {result}")
        if hasattr(result, '__dict__'):
            print(f"Dict: {result.__dict__}")
        # Try accessing as dict or object
        if isinstance(result, dict):
            sessions = result.get("sessions", [])
        elif hasattr(result, 'sessions'):
            sessions = result.sessions
        else:
            sessions = result

        print(f"Sessions count: {len(sessions) if sessions else 0}")
        for s in (sessions or []):
            print(f"  Session: {s}")
    except Exception as e:
        print(f"FAILED: {e}")
        import traceback; traceback.print_exc()

    client.close()

# =============== ASYNC CLIENT ===============
async def test_async():
    print("\n" + "="*60)
    print("ASYNC CLIENT (AsyncCMDOPClient)")
    print("="*60)

    client = AsyncCMDOPClient.remote(api_key=CMDOP_KEY)
    print(f"Mode: {client.mode}")
    print(f"Client attrs: {[x for x in dir(client) if not x.startswith('_')]}")

    # Terminal service
    ts = client.terminal
    print(f"\nAsync Terminal service methods:")
    for name in dir(ts):
        if not name.startswith('_'):
            attr = getattr(ts, name)
            if callable(attr):
                try:
                    sig = inspect.signature(attr)
                    print(f"  terminal.{name}{sig}")
                except:
                    print(f"  terminal.{name}()")

    # List sessions
    print(f"\n--- list_sessions() ---")
    try:
        sessions = await ts.list_sessions()
        print(f"Type: {type(sessions)}")
        print(f"Count: {len(sessions)}")

        connected = None
        for s in sessions:
            fields = s.__dict__ if hasattr(s, '__dict__') else s
            print(f"  Session: {fields}")
            if hasattr(s, 'status') and s.status == 'connected':
                connected = s
            elif isinstance(s, dict) and s.get('status') == 'connected':
                connected = s

        if not connected:
            print("No connected sessions!")
            await client.close()
            return

        sid = connected.session_id if hasattr(connected, 'session_id') else connected.get('session_id')
        machine_name = connected.machine_name if hasattr(connected, 'machine_name') else connected.get('machine_name', 'unknown')
        print(f"\nUsing: {sid} ({machine_name})")

        # Get status
        print(f"\n--- get_status({sid}) ---")
        try:
            status = await ts.get_status(sid)
            print(f"Status: {status}")
            if hasattr(status, '__dict__'):
                print(f"Dict: {status.__dict__}")
        except Exception as e:
            print(f"FAILED: {e}")

        # Get history
        print(f"\n--- get_history({sid}) ---")
        try:
            history = await ts.get_history(sid)
            print(f"Type: {type(history)}")
            print(f"History: {str(history)[:500]}")
            if hasattr(history, '__dict__'):
                print(f"Dict: {history.__dict__}")
        except Exception as e:
            print(f"FAILED: {e}")

        # Send input
        marker = f"PY-FULL-{int(__import__('time').time())}"
        print(f"\n--- send_input({sid}, 'echo {marker}') ---")
        try:
            result = await ts.send_input(sid, f"echo {marker}\n")
            print(f"Result: {result}")
        except Exception as e:
            print(f"FAILED: {e}")

        # Resize
        print(f"\n--- resize({sid}, 120, 40) ---")
        try:
            result = await ts.resize(sid, 120, 40)
            print(f"Result: {result}")
        except Exception as e:
            print(f"FAILED: {e}")

        # Execute
        print(f"\n--- execute({sid}, 'echo EXEC-OK') ---")
        try:
            result = await ts.execute(sid, "echo EXEC-OK", timeout=5)
            print(f"Type: {type(result)}")
            print(f"Result: {str(result)[:500]}")
        except Exception as e:
            print(f"FAILED: {e}")

        # Get active session
        print(f"\n--- get_active_session({sid}) ---")
        try:
            result = await ts.get_active_session(sid)
            print(f"Result: {result}")
        except Exception as e:
            print(f"FAILED: {e}")

    except Exception as e:
        print(f"FAILED: {e}")
        import traceback; traceback.print_exc()

    # =============== EXPLORE TERMINAL STREAM ===============
    print(f"\n--- TerminalStream exploration ---")
    try:
        from cmdop import TerminalStream
        print(f"TerminalStream init sig: {inspect.signature(TerminalStream.__init__)}")
        print(f"TerminalStream attrs: {[x for x in dir(TerminalStream) if not x.startswith('_')]}")

        # What does it need?
        for name in dir(TerminalStream):
            if not name.startswith('_'):
                attr = getattr(TerminalStream, name)
                if callable(attr):
                    try:
                        sig = inspect.signature(attr)
                        print(f"  TerminalStream.{name}{sig}")
                    except:
                        print(f"  TerminalStream.{name}()")
    except ImportError as e:
        print(f"TerminalStream not available: {e}")

    # =============== EXPLORE TRANSPORT ===============
    print(f"\n--- Transport exploration ---")
    transport = client.transport if hasattr(client, 'transport') else None
    if transport:
        print(f"Transport type: {type(transport)}")
        print(f"Transport attrs: {[x for x in dir(transport) if not x.startswith('_')]}")
        for name in dir(transport):
            if not name.startswith('_'):
                attr = getattr(transport, name)
                if callable(attr):
                    try:
                        sig = inspect.signature(attr)
                        print(f"  transport.{name}{sig}")
                    except:
                        print(f"  transport.{name}()")
                else:
                    print(f"  transport.{name} = {repr(attr)[:100]}")

    # =============== EXPLORE DISCOVERY ===============
    print(f"\n--- AgentDiscovery exploration ---")
    try:
        from cmdop import AgentDiscovery
        print(f"AgentDiscovery attrs: {[x for x in dir(AgentDiscovery) if not x.startswith('_')]}")
        for name in dir(AgentDiscovery):
            if not name.startswith('_'):
                attr = getattr(AgentDiscovery, name)
                if callable(attr):
                    try:
                        sig = inspect.signature(attr)
                        print(f"  AgentDiscovery.{name}{sig}")
                    except:
                        print(f"  AgentDiscovery.{name}()")
    except ImportError as e:
        print(f"AgentDiscovery not available: {e}")

    await client.close()

# Run tests
print("\n")
test_sync()
asyncio.run(test_async())
print("\n=== DONE ===")
