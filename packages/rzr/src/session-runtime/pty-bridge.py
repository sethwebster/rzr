#!/usr/bin/env python3

import argparse
import errno
import fcntl
import json
import os
import select
import signal
import struct
import subprocess
import sys
import termios


def set_winsize(fd, cols, rows):
    if cols <= 0 or rows <= 0:
        return
    size = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, size)


def read_available(fd):
    try:
        return os.read(fd, 4096)
    except BlockingIOError:
        return None
    except OSError as error:
        if error.errno == errno.EIO:
            return b""
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cols", type=int, default=80)
    parser.add_argument("--rows", type=int, default=24)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("command is required")

    master_fd, slave_fd = os.openpty()
    set_winsize(slave_fd, args.cols, args.rows)

    env = dict(os.environ)
    env.setdefault("TERM", "xterm-256color")

    child = subprocess.Popen(
        command,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True,
        start_new_session=True,
        env=env,
    )
    os.close(slave_fd)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    control_fd = 3

    os.set_blocking(master_fd, False)
    os.set_blocking(stdin_fd, False)
    os.set_blocking(control_fd, False)

    stdin_open = True
    control_open = True
    master_open = True
    control_buffer = b""

    while master_open:
        read_fds = [master_fd]
        if stdin_open:
          read_fds.append(stdin_fd)
        if control_open:
          read_fds.append(control_fd)

        ready, _, _ = select.select(read_fds, [], [], 0.1)

        if master_fd in ready:
            chunk = read_available(master_fd)
            if chunk == b"":
                master_open = False
            elif chunk:
                os.write(stdout_fd, chunk)

        if stdin_open and stdin_fd in ready:
            chunk = read_available(stdin_fd)
            if chunk == b"":
                stdin_open = False
            elif chunk:
                os.write(master_fd, chunk)

        if control_open and control_fd in ready:
            chunk = read_available(control_fd)
            if chunk == b"":
                control_open = False
            elif chunk:
                control_buffer += chunk
                while b"\n" in control_buffer:
                    line, control_buffer = control_buffer.split(b"\n", 1)
                    if not line.strip():
                        continue
                    message = json.loads(line.decode("utf-8"))
                    if message.get("type") == "resize":
                        set_winsize(master_fd, int(message.get("cols", 0)), int(message.get("rows", 0)))
                    elif message.get("type") == "close":
                        child.terminate()

        if child.poll() is not None and not stdin_open and not control_open:
            break

    try:
        os.close(master_fd)
    except OSError:
        pass

    if child.poll() is None:
        child.terminate()

    try:
        return child.wait(timeout=1)
    except subprocess.TimeoutExpired:
        child.kill()
        return child.wait(timeout=1)


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    raise SystemExit(main())
