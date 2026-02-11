encodings = ['utf-8', 'cp1252', 'latin1', 'utf-16']

content = None
for enc in encodings:
    try:
        with open('server.log', 'r', encoding=enc, errors='replace') as f:
            content = f.read()
            print(f"Successfully read with encoding: {enc}")
            break
    except Exception as e:
        print(f"Failed with {enc}: {e}")

if content:
    print("-" * 20)
    print(content)
    print("-" * 20)
else:
    print("Could not read file with any encoding.")
