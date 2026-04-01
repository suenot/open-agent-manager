"""
Test agent.run() for command execution with output via gRPC.
According to MEMORY.md: agent.run(sid, prompt) → result.text (~5-8s latency)
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
print(f"API Key: {API_KEY[:10]}...")


async def test_agent_run():
    from cmdop import AsyncCMDOPClient

    client = AsyncCMDOPClient.remote(API_KEY)
    print(f"Connected! mode={client.mode}")

    # List sessions to find target
    sessions = await client.terminal.list_sessions()
    connected = [s for s in sessions.sessions if s.status == "connected"]
    if not connected:
        print("No connected sessions!")
        await client.close()
        return

    target = connected[0]
    sid = target.session_id
    print(f"Target: {target.machine_name} ({sid[:20]}...)")

    # Test agent.run()
    print("\n=== Testing agent.run() ===")
    try:
        result = await client.agent.run("echo HELLO_FROM_AGENT && date && uname -a", session_id=sid)
        print(f"Result type: {type(result)}")
        print(f"Result: {result}")
        if hasattr(result, 'text'):
            print(f"Output: {result.text}")
        if hasattr(result, 'output'):
            print(f"Output: {result.output}")
    except Exception as e:
        print(f"agent.run FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

    # Also check available methods on agent service
    print("\n=== Agent service methods ===")
    for name in sorted(dir(client.agent)):
        if not name.startswith('_'):
            print(f"  {name}")

    # Check files service too
    print("\n=== Files service methods ===")
    for name in sorted(dir(client.files)):
        if not name.startswith('_'):
            print(f"  {name}")

    # Test files.list (should work according to MEMORY.md)
    print("\n=== Testing files.list('/') ===")
    try:
        files = await client.files.list(sid, "/")
        print(f"Files: {files}")
    except Exception as e:
        print(f"files.list FAILED: {type(e).__name__}: {e}")

    await client.close()


asyncio.run(test_agent_run())
