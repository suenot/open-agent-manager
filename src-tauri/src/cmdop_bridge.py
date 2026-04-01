#!/usr/bin/env python3
"""CMDOP bridge — persistent Python process for real-time terminal streaming.

Spawned by Tauri (Rust) backend. Communicates via JSON over stdin/stdout.

Modes:
  connect  — create a NEW terminal session (independent PTY per tab)
  attach   — attach to an existing agent session

Reconnects automatically on gRPC errors (e.g. 'max connection age').
"""

import asyncio
import sys
import json
import base64
import signal
from cmdop import AsyncCMDOPClient

MAX_RECONNECT_ATTEMPTS = 10
RECONNECT_DELAY_BASE = 1.0  # seconds, doubled each retry up to 30s


def emit(payload: dict):
    """Write JSON line to stdout (picked up by Rust reader thread)."""
    try:
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()
    except BrokenPipeError:
        sys.exit(0)


async def run_stream(api_key: str, session_id: str, mode: str, input_queue: asyncio.Queue):
    """Connect/attach to gRPC stream, forward output, process input from queue."""
    async with AsyncCMDOPClient.remote(api_key=api_key) as client:
        if mode == "connect":
            # Create a brand new terminal session (own PTY)
            stream = client.terminal.stream()
        else:
            # Attach to existing agent session
            stream = client.terminal.attach_stream(session_id)

        # Track the actual session_id (may differ from input in connect mode)
        actual_session_id = session_id

        def on_output(data: bytes):
            emit({
                "type": "output",
                "data": base64.b64encode(data).decode("utf-8"),
            })

        def on_status(status_data):
            emit({
                "type": "status",
                "status": getattr(status_data, "new_status", str(status_data)),
                "reason": getattr(status_data, "reason", ""),
            })

        def on_error(code, message, is_fatal):
            emit({
                "type": "error",
                "code": str(code),
                "message": str(message),
                "is_fatal": bool(is_fatal),
            })

        def on_disconnect(reason):
            emit({"type": "disconnect", "reason": str(reason)})

        stream.on_output(on_output)
        stream.on_status(on_status)
        stream.on_error(on_error)
        stream.on_disconnect(on_disconnect)

        import sys as _sys
        print(f"[BRIDGE] mode={mode}, session_id={session_id}", file=_sys.stderr, flush=True)

        if mode == "connect":
            actual_session_id = await stream.connect()
            emit({
                "type": "session_created",
                "session_id": actual_session_id,
            })
        else:
            await stream.attach(session_id)
            print(f"[BRIDGE] attached to session {session_id}", file=_sys.stderr, flush=True)

        # Startup stimulus: resize and newline to trigger prompt/redraw
        try:
            # First send a small resize to trigger SIGWINCH
            await stream.send_resize(80, 24)
            await asyncio.sleep(0.5)
            # Then a newline to ensure characters are processed
            await stream.send_input(b"\n")
            print(f"[BRIDGE] sent startup stimulus (mode={mode})", file=_sys.stderr, flush=True)
        except Exception as e:
            print(f"[BRIDGE] startup stimulus error: {e}", file=_sys.stderr, flush=True)

        emit({"type": "status", "status": "connected", "reason": f"{mode}ed"})

        # Process input messages from the queue
        try:
            while stream.is_connected:
                try:
                    msg = await asyncio.wait_for(input_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                msg_type = msg.get("type")
                try:
                    if msg_type == "input":
                        data = base64.b64decode(msg.get("data", ""))
                        await stream.send_input(data)
                    elif msg_type == "resize":
                        cols = int(msg.get("cols", 80))
                        rows = int(msg.get("rows", 24))
                        await stream.send_resize(cols, rows)
                    elif msg_type == "signal":
                        await stream.send_signal(int(msg.get("signal", 2)))
                except Exception as e:
                    emit({"type": "debug", "message": f"Command error: {e}"})
        finally:
            try:
                if mode == "connect":
                    await stream.close()
                else:
                    await stream.detach()
            except Exception:
                pass


async def stdin_reader(input_queue: asyncio.Queue):
    """Read JSON lines from stdin and put them into the queue."""
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line = await reader.readline()
        if not line:
            break
        try:
            msg = json.loads(line.decode())
            await input_queue.put(msg)
        except json.JSONDecodeError:
            pass


async def bridge():
    if len(sys.argv) < 4:
        emit({"type": "error", "message": "Usage: cmdop_bridge.py <api_key> <session_id> <mode:connect|attach>"})
        return

    api_key = sys.argv[1]
    session_id = sys.argv[2]
    mode = sys.argv[3]  # "connect" or "attach"

    if mode not in ("connect", "attach"):
        emit({"type": "error", "message": f"Unknown mode: {mode}. Use 'connect' or 'attach'."})
        return

    input_queue: asyncio.Queue = asyncio.Queue()

    # Start stdin reader as a background task
    stdin_task = asyncio.create_task(stdin_reader(input_queue))

    attempt = 0
    while attempt < MAX_RECONNECT_ATTEMPTS:
        try:
            attempt += 1
            if attempt > 1:
                delay = min(RECONNECT_DELAY_BASE * (2 ** (attempt - 2)), 30.0)
                emit({
                    "type": "status",
                    "status": "reconnecting",
                    "reason": f"attempt {attempt}/{MAX_RECONNECT_ATTEMPTS}, delay {delay:.1f}s",
                })
                await asyncio.sleep(delay)

            await run_stream(api_key, session_id, mode, input_queue)
            # If run_stream returns cleanly, we're done
            break

        except Exception as e:
            error_str = str(e)
            emit({
                "type": "error",
                "message": f"Stream error (attempt {attempt}): {error_str}",
                "is_fatal": False,
            })
            if stdin_task.done():
                break

    if attempt >= MAX_RECONNECT_ATTEMPTS:
        emit({
            "type": "error",
            "message": f"Max reconnection attempts ({MAX_RECONNECT_ATTEMPTS}) reached. Exiting.",
            "is_fatal": True,
        })

    stdin_task.cancel()


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    asyncio.run(bridge())
