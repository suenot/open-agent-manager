import asyncio
import os
from cmdop import AsyncCMDOPClient

async def test_stream():
    api_key = os.environ.get("CMDOP_KEY")
    if not api_key:
        print("Error: CMDOP_KEY env var not set")
        return

    async with AsyncCMDOPClient.remote(api_key=api_key) as client:
        # List sessions
        response = await client.terminal.list_sessions()
        if not response.sessions:
            print("No active sessions found")
            return
        
        session = response.sessions[0]
        print(f"Using session: {session.session_id} on {session.machine_hostname}")

        # Test stream
        stream = client.terminal.stream()
        stream.on_output(lambda data: print(f"Output: {data.decode()}", end=""))
        
        print("Attaching to stream...")
        await stream.attach(session.session_id)
        
        print("Sending 'ls -la'...")
        await stream.send_input(b"ls -la\n")
        
        await asyncio.sleep(2)
        print("\nClosing stream...")
        await stream.close()

if __name__ == "__main__":
    asyncio.run(test_stream())
