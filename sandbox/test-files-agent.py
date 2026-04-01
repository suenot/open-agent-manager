"""
Тестирование files/agent/terminal.execute через gRPC с API key.
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

    sid = connected.session_id if connected else None
    print(f"Session: {sid} ({connected.machine_name if connected else 'N/A'})\n")

    # ============================================================
    # 1. FILES SERVICE — листинг файлов
    # ============================================================
    print("=" * 60)
    print("1. FILES.LIST('/')")
    print("=" * 60)
    try:
        result = await client.files.list("/")
        print(f"  type: {type(result).__name__}")
        if hasattr(result, 'entries'):
            for e in result.entries[:20]:
                print(f"  {e.file_type if hasattr(e,'file_type') else '?'} {e.name} {getattr(e,'size','?')}b")
            if len(result.entries) > 20:
                print(f"  ... ещё {len(result.entries) - 20}")
        else:
            print(f"  {result}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    print(f"\n{'=' * 60}")
    print("2. FILES.LIST('~')")
    print("=" * 60)
    try:
        result = await client.files.list("~")
        if hasattr(result, 'entries'):
            for e in result.entries[:20]:
                print(f"  {getattr(e,'file_type','?')} {e.name}")
        else:
            print(f"  {result}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    print(f"\n{'=' * 60}")
    print("3. FILES.READ('/etc/hostname')")
    print("=" * 60)
    try:
        data = await client.files.read("/etc/hostname")
        if isinstance(data, bytes):
            print(f"  = {data.decode('utf-8', errors='replace').strip()}")
        else:
            print(f"  = {data}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    print(f"\n{'=' * 60}")
    print("4. FILES.INFO('/')")
    print("=" * 60)
    try:
        info = await client.files.info("/")
        print(f"  type: {type(info).__name__}")
        if hasattr(info, '__dict__'):
            for k, v in info.__dict__.items():
                if not k.startswith('_'):
                    print(f"  {k} = {v}")
        else:
            print(f"  {info}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    # ============================================================
    # 5. TERMINAL.EXECUTE — выполнить команду и получить output
    # ============================================================
    print(f"\n{'=' * 60}")
    print("5. TERMINAL.EXECUTE('ls -la /')")
    print("=" * 60)
    try:
        output, exit_code = await client.terminal.execute("ls -la /", timeout=15)
        print(f"  exit_code: {exit_code}")
        if output:
            text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
            print(f"  output ({len(text)} chars):")
            for line in text.split('\n')[:20]:
                print(f"    {line}")
        else:
            print(f"  output: пусто")
    except Exception as e:
        print(f"  ОШИБКА: {e}")

    if sid:
        print(f"\n{'=' * 60}")
        print(f"6. TERMINAL.EXECUTE('ls -la /', session_id={sid[:12]}...)")
        print("=" * 60)
        try:
            output, exit_code = await client.terminal.execute("ls -la /", timeout=15, session_id=sid)
            print(f"  exit_code: {exit_code}")
            if output:
                text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
                print(f"  output ({len(text)} chars):")
                for line in text.split('\n')[:20]:
                    print(f"    {line}")
            else:
                print(f"  output: пусто")
        except Exception as e:
            print(f"  ОШИБКА: {e}")

    # ============================================================
    # 7. AGENT.RUN — выполнить через агента
    # ============================================================
    print(f"\n{'=' * 60}")
    print("7. AGENT.RUN('Выполни команду: ls -la / и верни результат')")
    print("=" * 60)
    try:
        result = await client.agent.run("Выполни команду: ls -la / и верни результат")
        print(f"  type: {type(result).__name__}")
        if hasattr(result, '__dict__'):
            for k, v in result.__dict__.items():
                if not k.startswith('_'):
                    val_str = str(v)[:500]
                    print(f"  {k} = {val_str}")
        else:
            print(f"  {str(result)[:500]}")
    except Exception as e:
        print(f"  ОШИБКА: {e}")
        import traceback; traceback.print_exc()

    if sid:
        print(f"\n{'=' * 60}")
        print(f"8. AGENT.RUN с session_id")
        print("=" * 60)
        try:
            result = await client.agent.run("ls -la /", session_id=sid)
            print(f"  type: {type(result).__name__}")
            if hasattr(result, '__dict__'):
                for k, v in result.__dict__.items():
                    if not k.startswith('_'):
                        print(f"  {k} = {str(v)[:500]}")
        except Exception as e:
            print(f"  ОШИБКА: {e}")

    # ============================================================
    # 9. TERMINAL.CREATE + EXECUTE (новая сессия)
    # ============================================================
    print(f"\n{'=' * 60}")
    print("9. TERMINAL.CREATE() + EXECUTE")
    print("=" * 60)
    try:
        new_session = await client.terminal.create()
        new_sid = new_session.session_id if hasattr(new_session, 'session_id') else str(new_session)
        print(f"  Создана сессия: {new_sid}")
        if hasattr(new_session, '__dict__'):
            for k, v in new_session.__dict__.items():
                if not k.startswith('_'):
                    print(f"  {k} = {v}")

        # Подождать чуть и попробовать execute
        await asyncio.sleep(2)
        output, exit_code = await client.terminal.execute("ls -la /", timeout=15, session_id=new_sid)
        print(f"\n  execute exit_code: {exit_code}")
        if output:
            text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
            print(f"  output ({len(text)} chars):")
            for line in text.split('\n')[:10]:
                print(f"    {line}")
        else:
            print(f"  output: пусто")

        # Закрыть
        await client.terminal.close(new_sid)
        print(f"  Сессия закрыта")
    except Exception as e:
        print(f"  ОШИБКА: {e}")
        import traceback; traceback.print_exc()

    # ============================================================
    # 10. TERMINAL.STREAM — полноценный стрим
    # ============================================================
    print(f"\n{'=' * 60}")
    print("10. TERMINAL.STREAM()")
    print("=" * 60)
    try:
        stream = client.terminal.stream()
        print(f"  type: {type(stream).__name__}")
        output_chunks = []

        stream.on_output(lambda data: output_chunks.append(data))
        stream.on_error(lambda err: print(f"  [ERR] {err}"))
        stream.on_status(lambda s: print(f"  [STS] {s}"))

        new_sid = await stream.connect(timeout=15)
        print(f"  Подключён: {new_sid}")
        print(f"  state: {stream.state}, connected: {stream.is_connected}")

        # Ждём shell prompt
        await asyncio.sleep(3)
        print(f"  Chunks после connect: {len(output_chunks)}")
        for i, chunk in enumerate(output_chunks[:5]):
            text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
            print(f"  [{i}] {repr(text[:200])}")

        # Отправить ls
        await stream.send_input("ls -la / && echo __DONE__\n")
        await asyncio.sleep(3)
        print(f"\n  Chunks после ls: {len(output_chunks)}")
        all_text = ""
        for chunk in output_chunks:
            text = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else str(chunk)
            all_text += text
        if all_text:
            print(f"  === OUTPUT ({len(all_text)} chars) ===")
            for line in all_text.split('\n')[:20]:
                print(f"    {line}")
            print(f"  === END ===")
        else:
            print(f"  OUTPUT: пусто!")

        await stream.close()
    except Exception as e:
        print(f"  ОШИБКА: {e}")
        import traceback; traceback.print_exc()

    await client.close()
    print(f"\n{'=' * 60}")
    print("=== ГОТОВО ===")
    print("=" * 60)

asyncio.run(main())
