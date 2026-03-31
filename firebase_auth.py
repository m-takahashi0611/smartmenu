import pty, os, sys, select

code = '4/0Aci98E9mIKZ2RCrb1KGt-J3FFsaX7VXeP7W8rIH4LlJnDPeCI9JkYXS6Z5k4mtRF-UbgMA'

master, slave = pty.openpty()
pid = os.fork()
if pid == 0:
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(master)
    os.execvp('firebase', ['firebase', 'login:ci', '--no-localhost'])
else:
    os.close(slave)
    output = b''
    answered = {'gemini': False, 'firebase': False, 'code': False}
    for _ in range(200):
        r, _, _ = select.select([master], [], [], 0.5)
        if r:
            try:
                chunk = os.read(master, 4096)
                output += chunk
                text = chunk.decode('utf-8', errors='replace')
                sys.stdout.write(text)
                sys.stdout.flush()
                if not answered['gemini'] and 'Gemini' in text:
                    os.write(master, b'n\n')
                    answered['gemini'] = True
                if not answered['firebase'] and 'Allow Firebase' in text:
                    os.write(master, b'n\n')
                    answered['firebase'] = True
                if not answered['code'] and ('authorization code' in text or 'Enter authorization' in text):
                    import time
                    time.sleep(0.5)
                    os.write(master, (code + '\n').encode())
                    answered['code'] = True
                if b'1//0' in output or (b'Success' in output and b'token' in output.lower()):
                    break
            except OSError:
                break
    try:
        os.waitpid(pid, 0)
    except:
        pass
