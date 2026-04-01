"""
Полная инспекция ВСЕХ сервисов и методов CMDOP Python SDK.
"""
import os, asyncio, inspect
from pathlib import Path

for line in (Path(__file__).parent.parent / ".env").read_text().strip().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ[k.strip()] = v.strip()

from cmdop import AsyncCMDOPClient

async def main():
    client = AsyncCMDOPClient.remote(api_key=os.environ["CMDOP_KEY"])

    print("=" * 60)
    print("=== ИНСПЕКЦИЯ ВСЕХ СЕРВИСОВ CMDOP SDK ===")
    print("=" * 60)

    # Все атрибуты клиента
    print("\n--- Атрибуты клиента ---")
    for attr in sorted(dir(client)):
        if attr.startswith('_'):
            continue
        val = getattr(client, attr)
        print(f"  {attr}: {type(val).__name__}")

    services = ['terminal', 'files', 'agent', 'extract', 'browser']

    for svc_name in services:
        svc = getattr(client, svc_name, None)
        if not svc:
            print(f"\n!!! Сервис '{svc_name}' не найден!")
            continue

        print(f"\n{'=' * 60}")
        print(f"=== {svc_name.upper()} SERVICE ({type(svc).__name__}) ===")
        print(f"{'=' * 60}")

        for attr in sorted(dir(svc)):
            if attr.startswith('_'):
                continue
            val = getattr(svc, attr)
            kind = type(val).__name__
            if callable(val):
                try:
                    sig = inspect.signature(val)
                    print(f"  {attr}{sig}")
                except (ValueError, TypeError):
                    print(f"  {attr}() [no sig]")
            else:
                print(f"  {attr} = {repr(val)[:100]} ({kind})")

    # Также проверим что есть в модуле cmdop
    print(f"\n{'=' * 60}")
    print("=== МОДУЛЬ cmdop — все экспорты ===")
    print(f"{'=' * 60}")
    import cmdop
    for attr in sorted(dir(cmdop)):
        if attr.startswith('_'):
            continue
        val = getattr(cmdop, attr)
        print(f"  {attr}: {type(val).__name__}")

    await client.close()

asyncio.run(main())
