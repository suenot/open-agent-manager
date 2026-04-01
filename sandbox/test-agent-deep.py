"""
Углублённый тест agent.run() — получение точного вывода команд.
+ Проверка: может ли agent.set_session_id() заставить files работать.
"""
import os, asyncio
from pathlib import Path

for line in (Path(__file__).parent.parent / ".env").read_text().strip().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

from cmdop import AsyncCMDOPClient

async def main():
    client = AsyncCMDOPClient.remote(api_key=os.environ["CMDOP_KEY"])

    # Найти connected сессию
    resp = await client.terminal.list_sessions()
    connected = None
    for s in resp.sessions:
        if s.status == "connected":
            connected = s
            break

    if not connected:
        print("Нет online сессий!")
        return

    sid = connected.session_id
    print(f"Machine: {connected.machine_name} ({sid})\n")

    # ============================================================
    # 1. agent.run — точный ls с raw output
    # ============================================================
    print("=" * 60)
    print("1. agent.run('ls -la /' с просьбой дать raw output)")
    print("=" * 60)
    result = await client.agent.run(
        "Run the command: ls -la / — and return the EXACT raw output, nothing else. Do not summarize, do not explain. Just the raw terminal output.",
        session_id=sid
    )
    print(f"  success: {result.success}")
    print(f"  duration: {result.duration_ms}ms")
    print(f"  text:\n{result.text}")
    print(f"  error: {result.error}")
    if result.tool_results:
        print(f"  tool_results: {result.tool_results}")

    # ============================================================
    # 2. agent.run — ls домашней папки
    # ============================================================
    print(f"\n{'=' * 60}")
    print("2. agent.run('ls домашняя папка')")
    print("=" * 60)
    result = await client.agent.run(
        "Run: ls -la ~ and return the exact raw output only.",
        session_id=sid
    )
    print(f"  success: {result.success}")
    print(f"  text:\n{result.text}")

    # ============================================================
    # 3. agent.run — whoami + hostname + uname
    # ============================================================
    print(f"\n{'=' * 60}")
    print("3. agent.run('whoami && hostname && uname -a')")
    print("=" * 60)
    result = await client.agent.run(
        "Run: whoami && hostname && uname -a — return raw output only.",
        session_id=sid
    )
    print(f"  success: {result.success}")
    print(f"  text:\n{result.text}")

    # ============================================================
    # 4. agent.run — cat /etc/os-release
    # ============================================================
    print(f"\n{'=' * 60}")
    print("4. agent.run('cat /etc/os-release')")
    print("=" * 60)
    result = await client.agent.run(
        "Run: cat /etc/os-release — return raw output only.",
        session_id=sid
    )
    print(f"  success: {result.success}")
    print(f"  text:\n{result.text}")

    # ============================================================
    # 5. agent.run — df -h
    # ============================================================
    print(f"\n{'=' * 60}")
    print("5. agent.run('df -h')")
    print("=" * 60)
    result = await client.agent.run(
        "Run: df -h — return raw output only.",
        session_id=sid
    )
    print(f"  success: {result.success}")
    print(f"  text:\n{result.text}")

    # ============================================================
    # 6. agent.set_session_id + files.list
    # ============================================================
    print(f"\n{'=' * 60}")
    print("6. agent.set_session_id() + files.list('/')")
    print("=" * 60)
    try:
        await client.agent.set_session_id(sid)
        print(f"  set_session_id OK")

        result = await client.files.list("/")
        print(f"  files.list('/') type: {type(result).__name__}")
        if hasattr(result, 'entries') and result.entries:
            for e in result.entries[:15]:
                print(f"    {getattr(e, 'file_type', '?')} {e.name} {getattr(e, 'size', '?')}b")
        else:
            print(f"  entries: пусто")

        # Попробуем read
        data = await client.files.read("/etc/hostname")
        print(f"\n  files.read('/etc/hostname'): {repr(data)}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    # ============================================================
    # 7. agent.run_stream — стриминг
    # ============================================================
    print(f"\n{'=' * 60}")
    print("7. agent.run_stream('ls /')")
    print("=" * 60)
    try:
        chunks = []
        async for event in client.agent.run_stream("Run: ls / — return raw output only."):
            chunks.append(event)
            if hasattr(event, 'text'):
                print(f"  event.text: {repr(event.text[:200])}")
            elif hasattr(event, 'type'):
                print(f"  event.type={event.type}")
            else:
                print(f"  event: {type(event).__name__} = {repr(str(event)[:200])}")
            if len(chunks) > 30:
                print("  (stopped after 30)")
                break
        print(f"  total events: {len(chunks)}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")
        import traceback; traceback.print_exc()

    await client.close()
    print(f"\n{'=' * 60}")
    print("=== ГОТОВО ===")
    print("=" * 60)

asyncio.run(main())
