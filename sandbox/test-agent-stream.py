"""
Test agent.run_stream() for streaming output from remote machine.
"""
import asyncio
import os
import time

# Load .env
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
for line in open(env_path):
    line = line.strip()
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()

API_KEY = os.environ.get('CMDOP_KEY')


async def test():
    from cmdop import AsyncCMDOPClient
    from cmdop.models import AgentResult, AgentStreamEvent

    client = AsyncCMDOPClient.remote(API_KEY)

    # Get session
    sessions = await client.terminal.list_sessions()
    connected = [s for s in sessions.sessions if s.status == "connected"]
    if not connected:
        print("No connected sessions!")
        await client.close()
        return

    sid = connected[0].session_id
    client.agent.set_session_id(sid)
    print(f"Session: {connected[0].machine_name} ({sid[:20]}...)\n")

    # Test run_stream
    print("=== agent.run_stream() ===")
    start = time.time()
    try:
        async for event in client.agent.run_stream("echo LINE1 && sleep 1 && echo LINE2 && sleep 1 && echo LINE3"):
            elapsed = time.time() - start
            if isinstance(event, AgentResult):
                print(f"  [{elapsed:.1f}s] RESULT: success={event.success} text={repr(event.text[:200])}")
            elif isinstance(event, AgentStreamEvent):
                print(f"  [{elapsed:.1f}s] STREAM EVENT: type={event.event_type} data={repr(str(event.data)[:200])}")
            else:
                print(f"  [{elapsed:.1f}s] UNKNOWN: {type(event).__name__}: {repr(str(event)[:200])}")
    except Exception as e:
        print(f"  STREAM FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

    # Test agent.run with a simple file command
    print("\n=== agent.run('cat /etc/hostname') ===")
    result = await client.agent.run("cat /etc/hostname", session_id=sid)
    print(f"  hostname: {result.text}")

    # Test files service
    print("\n=== files.read(sid, '/etc/hostname') ===")
    try:
        content = await client.files.read("/etc/hostname")
        print(f"  content: {content}")
    except Exception as e:
        print(f"  FAILED: {e}")

    print("\n=== files.list('/') ===")
    try:
        entries = await client.files.list("/")
        print(f"  entries: {entries}")
    except Exception as e:
        print(f"  FAILED: {e}")

    await client.close()
    print("\nDone!")


asyncio.run(test())
