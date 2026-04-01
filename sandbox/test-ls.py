"""
Попытка подключиться к удалённой машине и выполнить ls, получив output.
"""
import os, asyncio, time
from pathlib import Path

# Load .env
for line in (Path(__file__).parent.parent / ".env").read_text().strip().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

from cmdop import AsyncCMDOPClient

async def main():
    client = AsyncCMDOPClient.remote(api_key=os.environ["CMDOP_KEY"])

    # 1. Найти connected сессию
    print("1. Ищу connected сессию...")
    active = await client.terminal.get_active_session()
    if not active:
        print("   Нет подключённых сессий!")
        return
    sid = active.session_id
    print(f"   Найдена: {sid} ({active.machine_name}, {active.machine_hostname})")

    # 2. Отправить ls
    marker = f"__MARKER_{int(time.time())}__"
    print(f"\n2. Отправляю: echo {marker} && ls -la /tmp && echo END_{marker}")
    await client.terminal.send_input(sid, f"echo {marker} && ls -la /tmp && echo END_{marker}\n")
    print("   Отправлено!")

    # 3. Попытка получить output через get_history
    print(f"\n3. Попытка get_history (5 раз с интервалом 1с)...")
    for i in range(5):
        await asyncio.sleep(1)
        history = await client.terminal.get_history(sid, lines=200)
        data = history.data
        total = history.total_lines
        has_more = history.has_more
        print(f"   [{i+1}] total_lines={total}, has_more={has_more}, data length={len(data) if data else 0}")
        if data and len(data) > 0:
            text = data.decode('utf-8', errors='replace') if isinstance(data, bytes) else str(data)
            print(f"   DATA: {text[:500]}")
            if marker in text:
                print(f"   НАШЁЛ МАРКЕР В HISTORY!")
                break

    # 4. Попытка execute
    print(f"\n4. Попытка execute('ls -la /tmp', timeout=10)...")
    try:
        output, exit_code = await client.terminal.execute("ls -la /tmp", timeout=10, session_id=sid)
        print(f"   exit_code={exit_code}")
        print(f"   output type={type(output)}, len={len(output) if output else 0}")
        if output:
            text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
            print(f"   OUTPUT: {text[:500]}")
        else:
            print("   OUTPUT: пусто")
    except Exception as e:
        print(f"   ОШИБКА: {e}")

    # 5. Попытка execute без session_id (создаст новую?)
    print(f"\n5. Попытка execute('ls -la /tmp') без session_id...")
    try:
        output, exit_code = await client.terminal.execute("ls -la /tmp", timeout=10)
        print(f"   exit_code={exit_code}")
        print(f"   output len={len(output) if output else 0}")
        if output:
            text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
            print(f"   OUTPUT: {text[:500]}")
        else:
            print("   OUTPUT: пусто")
    except Exception as e:
        print(f"   ОШИБКА: {e}")

    # 6. Попробовать через TerminalStream (agent-side — создаст новую сессию)
    print(f"\n6. Попытка через TerminalStream (agent-side)...")
    from cmdop import TerminalStream
    output_chunks = []

    stream = TerminalStream(transport=client.transport)
    stream.on_output(lambda data: output_chunks.append(data))
    stream.on_error(lambda err: print(f"   STREAM ERROR: {err}"))
    stream.on_status(lambda s: print(f"   STREAM STATUS: {s}"))

    try:
        new_sid = stream.connect(timeout=10)
        print(f"   Новая сессия создана: {new_sid}")
        print(f"   Состояние: {stream.state}, connected={stream.is_connected}")

        # Подождать начальный output (приглашение shell)
        await asyncio.sleep(2)
        print(f"   Output chunks после connect: {len(output_chunks)}")
        for i, chunk in enumerate(output_chunks[:5]):
            text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
            print(f"   [{i}] {repr(text[:200])}")

        # Отправить ls
        print(f"\n   Отправляю: ls -la /tmp")
        stream.send_input("ls -la /tmp\n")

        # Ждать output
        await asyncio.sleep(3)
        print(f"   Output chunks после ls: {len(output_chunks)}")
        for i, chunk in enumerate(output_chunks):
            text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
            print(f"   [{i}] {repr(text[:200])}")

        stream.close()
    except Exception as e:
        print(f"   ОШИБКА: {e}")
        import traceback; traceback.print_exc()

    await client.close()
    print("\n=== ГОТОВО ===")

asyncio.run(main())
