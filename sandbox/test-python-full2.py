"""
Full Python SDK (cmdop) exploration — Part 2
Tests async methods that failed in part 1, plus AgentDiscovery, file service, etc.
"""
import os
import sys
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

from cmdop import AsyncCMDOPClient, AgentDiscovery, TerminalStream

async def main():
    print("=== CMDOP Python SDK — Part 2 ===\n")

    client = AsyncCMDOPClient.remote(api_key=CMDOP_KEY)

    # =============== 1. LIST SESSIONS — correct way ===============
    print("1. list_sessions() — correct parsing")
    result = await client.terminal.list_sessions()
    print(f"   Type: {type(result)}")
    print(f"   Attrs: {[x for x in dir(result) if not x.startswith('_')]}")
    # Access sessions
    if hasattr(result, 'sessions'):
        sessions = result.sessions
    elif hasattr(result, 'items'):
        sessions = result.items
    else:
        # Try iterating
        try:
            sessions = list(result)
        except:
            sessions = []
    print(f"   Attrs of result: {result.__dict__ if hasattr(result, '__dict__') else 'no dict'}")

    # Try total
    total = getattr(result, 'total', getattr(result, 'count', 'unknown'))
    print(f"   Total: {total}")

    connected = None
    for s in sessions:
        sid = getattr(s, 'session_id', None)
        status = getattr(s, 'status', None)
        machine = getattr(s, 'machine_name', None)
        hostname = getattr(s, 'hostname', None)
        agent_ver = getattr(s, 'agent_version', None)
        print(f"   {sid} | status={status} | machine={machine} | host={hostname} | ver={agent_ver}")
        print(f"     Full: {s.__dict__ if hasattr(s, '__dict__') else s}")
        if status and 'connected' in str(status).lower():
            connected = s

    if not connected:
        print("   No connected sessions!")
        await client.close()
        return

    sid = connected.session_id
    print(f"\n   Using: {sid}")

    # =============== 2. GET ACTIVE SESSION ===============
    print(f"\n2. get_active_session(hostname='suenotpc')")
    try:
        active = await client.terminal.get_active_session(hostname="suenotpc")
        print(f"   Result: {active}")
        if active:
            print(f"   Dict: {active.__dict__ if hasattr(active, '__dict__') else 'no dict'}")
    except Exception as e:
        print(f"   FAILED: {e}")

    print(f"\n   get_active_session() — no filter")
    try:
        active2 = await client.terminal.get_active_session()
        print(f"   Result: {active2}")
        if active2:
            print(f"   Dict: {active2.__dict__ if hasattr(active2, '__dict__') else 'no dict'}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 3. SEND INPUT ===============
    import time
    marker = f"PY2-{int(time.time())}"
    print(f"\n3. send_input({sid}, 'echo {marker}')")
    try:
        await client.terminal.send_input(sid, f"echo {marker}\n")
        print("   OK")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 4. GET HISTORY ===============
    print(f"\n4. get_history({sid})")
    try:
        history = await client.terminal.get_history(sid)
        print(f"   Type: {type(history)}")
        print(f"   Attrs: {[x for x in dir(history) if not x.startswith('_')]}")
        print(f"   Dict: {history.__dict__ if hasattr(history, '__dict__') else 'no dict'}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 5. EXECUTE ===============
    print(f"\n5. execute('whoami')")
    try:
        output, exit_code = await client.terminal.execute("whoami", timeout=10)
        print(f"   Output: {output}")
        print(f"   Exit code: {exit_code}")
    except Exception as e:
        print(f"   FAILED: {e}")

    print(f"\n   execute('echo HELLO-FROM-PY')")
    try:
        output, exit_code = await client.terminal.execute("echo HELLO-FROM-PY", timeout=10)
        print(f"   Output: {output}")
        print(f"   Exit code: {exit_code}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 6. RESIZE ===============
    print(f"\n6. resize({sid}, 120, 40)")
    try:
        await client.terminal.resize(sid, 120, 40)
        print("   OK")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 7. SIGNAL ===============
    print(f"\n7. send_signal — exploring SignalType")
    try:
        from cmdop import SignalType
        print(f"   SignalType members: {list(SignalType)}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 8. AGENT DISCOVERY ===============
    print(f"\n8. AgentDiscovery")
    try:
        disc = AgentDiscovery(api_key=CMDOP_KEY)
        print(f"   Created. Attrs: {[x for x in dir(disc) if not x.startswith('_')]}")

        print(f"\n   list_agents():")
        agents = disc.list_agents()
        print(f"   Type: {type(agents)}")
        print(f"   Agents: {agents}")
    except Exception as e:
        print(f"   FAILED: {e}")
        import traceback; traceback.print_exc()

    # =============== 9. CLIENT list_agents ===============
    print(f"\n9. client.list_agents()")
    try:
        agents = await client.list_agents()
        print(f"   Type: {type(agents)}")
        print(f"   Agents: {agents}")
    except Exception as e:
        print(f"   FAILED: {e}")

    print(f"\n   client.get_online_agents()")
    try:
        online = await client.get_online_agents()
        print(f"   Type: {type(online)}")
        print(f"   Online: {online}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 10. FILES SERVICE ===============
    print(f"\n10. Files service")
    fs = client.files
    print(f"   Files service methods:")
    for name in dir(fs):
        if not name.startswith('_'):
            attr = getattr(fs, name)
            if callable(attr):
                try:
                    sig = inspect.signature(attr)
                    print(f"     files.{name}{sig}")
                except:
                    print(f"     files.{name}()")

    # Try listing files
    print(f"\n   files.list('~')")
    try:
        files = await fs.list("~")
        print(f"   Type: {type(files)}")
        if hasattr(files, '__iter__'):
            for i, f in enumerate(files):
                if i >= 5:
                    print(f"   ... and more")
                    break
                print(f"   {f}")
    except Exception as e:
        print(f"   FAILED: {e}")

    # =============== 11. BROWSER SERVICE ===============
    print(f"\n11. Browser service")
    browser = client.browser if hasattr(client, 'browser') else None
    if browser:
        print(f"   Browser methods:")
        for name in dir(browser):
            if not name.startswith('_'):
                attr = getattr(browser, name)
                if callable(attr):
                    try:
                        sig = inspect.signature(attr)
                        print(f"     browser.{name}{sig}")
                    except:
                        print(f"     browser.{name}()")
    else:
        print("   No browser service")

    # =============== 12. AGENT SERVICE ===============
    print(f"\n12. Agent service")
    agent = client.agent
    print(f"   Agent methods:")
    for name in dir(agent):
        if not name.startswith('_'):
            attr = getattr(agent, name)
            if callable(attr):
                try:
                    sig = inspect.signature(attr)
                    print(f"     agent.{name}{sig}")
                except:
                    print(f"     agent.{name}()")

    # =============== 13. EXTRACT SERVICE ===============
    print(f"\n13. Extract service")
    extract = client.extract if hasattr(client, 'extract') else None
    if extract and callable(extract):
        try:
            sig = inspect.signature(extract)
            print(f"   client.extract{sig}")
        except:
            print(f"   client.extract()")
    elif extract:
        print(f"   Extract methods:")
        for name in dir(extract):
            if not name.startswith('_'):
                attr = getattr(extract, name)
                if callable(attr):
                    try:
                        sig = inspect.signature(attr)
                        print(f"     extract.{name}{sig}")
                    except:
                        print(f"     extract.{name}()")

    # =============== 14. DOWNLOAD SERVICE ===============
    print(f"\n14. Download service")
    download = client.download if hasattr(client, 'download') else None
    if download and callable(download):
        try:
            sig = inspect.signature(download)
            print(f"   client.download{sig}")
        except:
            print(f"   client.download()")
    elif download:
        print(f"   Download: {type(download)}")

    # =============== 15. TERMINAL STREAM — agent-side ===============
    print(f"\n15. TerminalStream (agent-side only)")
    print(f"   TerminalStream.__init__ sig: {inspect.signature(TerminalStream.__init__)}")
    print(f"   NOTE: TerminalStream is agent-side only — it creates NEW sessions")
    print(f"   connect() generates uuid4 session_id and sends RegisterRequest")
    print(f"   This is what runs on the REMOTE machine as a daemon")

    await client.close()
    print("\n=== DONE ===")

asyncio.run(main())
