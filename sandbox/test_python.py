"""
Test CMDOP Python SDK — explore API surface, auth, terminal
"""
import os
import sys
import inspect

# Load env
CMDOP_KEY = os.environ.get("CMDOP_KEY")
CMDOP_MACHINE = os.environ.get("CMDOP_MACHINE", "suenotpc")

if not CMDOP_KEY:
    print("ERROR: CMDOP_KEY env var not set")
    sys.exit(1)

print("=== CMDOP Python SDK Test ===\n")
print(f"API Key: {CMDOP_KEY[:8]}...")
print(f"Machine: {CMDOP_MACHINE}")

# Step 1: Explore the SDK structure
print("\n1. SDK structure...")
import cmdop
print(f"   Version: {cmdop.__version__ if hasattr(cmdop, '__version__') else 'unknown'}")
print(f"   Dir: {[x for x in dir(cmdop) if not x.startswith('_')]}")

# Step 2: Try to import and explore modules
print("\n2. Exploring modules...")
try:
    from cmdop import terminal
    print(f"   terminal: {[x for x in dir(terminal) if not x.startswith('_')]}")
except Exception as e:
    print(f"   terminal import failed: {e}")

try:
    from cmdop import agent
    print(f"   agent: {[x for x in dir(agent) if not x.startswith('_')]}")
except Exception as e:
    print(f"   agent import failed: {e}")

try:
    from cmdop import client
    print(f"   client: {[x for x in dir(client) if not x.startswith('_')]}")
except Exception as e:
    print(f"   client import failed: {e}")

# Step 3: Try CMDOPClient or similar
print("\n3. Looking for main client class...")
for name in dir(cmdop):
    obj = getattr(cmdop, name)
    if inspect.isclass(obj):
        print(f"   Class: {name}")
        methods = [m for m in dir(obj) if not m.startswith('_')]
        print(f"     Methods: {methods[:20]}")

# Step 4: Try to connect
print("\n4. Trying to connect...")
try:
    # Try CMDOPClient
    if hasattr(cmdop, 'CMDOPClient'):
        c = cmdop.CMDOPClient(api_key=CMDOP_KEY)
        print(f"   Client created: {c}")
    elif hasattr(cmdop, 'Client'):
        c = cmdop.Client(api_key=CMDOP_KEY)
        print(f"   Client created: {c}")
    else:
        # Try to find the client
        for name in dir(cmdop):
            obj = getattr(cmdop, name)
            if 'client' in name.lower() and callable(obj):
                print(f"   Trying {name}...")
                try:
                    c = obj(api_key=CMDOP_KEY)
                    print(f"   Created via {name}: {c}")
                    break
                except Exception as e2:
                    print(f"   {name} failed: {e2}")
except Exception as e:
    print(f"   Connection failed: {e}")

# Step 5: Try terminal.connect or similar
print("\n5. Trying terminal operations...")
try:
    if hasattr(cmdop, 'terminal'):
        t = cmdop.terminal
        print(f"   terminal module: {type(t)}")
        print(f"   dir: {[x for x in dir(t) if not x.startswith('_')]}")

        # Try connect
        if hasattr(t, 'connect'):
            print("   Trying terminal.connect()...")
            conn = t.connect(api_key=CMDOP_KEY)
            print(f"   Connected: {conn}")
        elif hasattr(t, 'Terminal'):
            print("   Trying terminal.Terminal()...")
            term = t.Terminal(api_key=CMDOP_KEY)
            print(f"   Terminal: {term}")
except Exception as e:
    print(f"   Terminal failed: {e}")

print("\nDone.")
