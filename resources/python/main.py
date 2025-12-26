import sys
import json
import subprocess
import time
import os
import signal
import tempfile
import traceback
import platform

# Status Codes
STATUS_AC = "Accepted (AC)"
STATUS_WA = "Wrong Answer (WA)"
STATUS_TLE = "Time Limit Exceeded (TLE)"
STATUS_RE = "Runtime Error (RE)"
STATUS_CE = "Compile Error (CE)"


def current_time_ms():
    return time.time() * 1000


def get_response(
    status,
    user_code,
    expected_output,
    execution_time,
    error_message="",
    user_output="",
    input_test_case="",
):
    return json.dumps(
        {
            "status": status,
            "user_code": user_code,
            "expected_output": expected_output,
            "execution_time": f"{execution_time:.2f}ms",
            "error_message": error_message,
            "user_output": user_output,
            "input_test_case": input_test_case,
        }
    )


def main():
    process = None
    tf_path = None
    input_data = ""

    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            return
        data = json.loads(raw_input)

        source_code = data.get("source_code", "")
        input_data = data.get("input", "")
        expected_output = data.get("expected_output", "")
        time_limit_sec = float(data.get("time_limit", 2.0))

    except Exception as e:
        print(
            get_response(
                STATUS_RE,
                "",
                "",
                0,
                f"Judge Input Error: {str(e)}",
                user_output="",
                input_test_case=input_data,
            )
        )
        return

    # Signal handler: on cancel, kill child (and its group) and cleanup
    def terminate_child_and_exit():
        nonlocal process, tf_path
        try:
            if process is not None:
                if process.poll() is None:
                    try:
                        # Kill entire group on POSIX if we started a new session
                        if platform.system() != "Windows":
                            try:
                                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                            except Exception:
                                process.kill()
                        else:
                            process.kill()
                        # Ensure it's reaped
                        try:
                            process.communicate(timeout=0.1)
                        except Exception:
                            pass
                    except Exception:
                        pass
        finally:
            # Best-effort temp file cleanup
            if tf_path and os.path.exists(tf_path):
                try:
                    os.remove(tf_path)
                except Exception:
                    pass
        # Exit promptly; stdout may be empty since Node 端會回 TC
        os._exit(0)

    def signal_handler(sig, frame):
        terminate_child_and_exit()

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # 1. Compile-time check
    try:
        compile(source_code, "<string>", "exec")
    except SyntaxError:
        print(
            get_response(
                STATUS_CE,
                source_code,
                expected_output,
                0,
                traceback.format_exc(),
                user_output="",
                input_test_case=input_data,
            )
        )
        return
    except Exception as e:
        print(
            get_response(
                STATUS_CE,
                source_code,
                expected_output,
                0,
                str(e),
                user_output="",
                input_test_case=input_data,
            )
        )
        return

    # Watchdog injection
    judge_pid = os.getpid()
    watchdog_code = f"""
import threading
import os
import time
import sys

def _watchdog_monitor():
    parent_pid = {judge_pid}
    while True:
        try:
            os.kill(parent_pid, 0)
        except OSError:
            os._exit(1)
        time.sleep(0.5)

_t = threading.Thread(target=_watchdog_monitor, daemon=True)
_t.start()
"""

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as tf:
        tf_path = tf.name
        tf.write(watchdog_code + "\n" + source_code)

    start_time = time.time()

    try:
        # 2. Execute user code
        # start_new_session=True puts child into its own process group (POSIX),
        # so we can kill the whole group on cancel.
        popen_kwargs = dict(
            args=[sys.executable, tf_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        # Use start_new_session on non-Windows
        if platform.system() != "Windows":
            process = subprocess.Popen(
                [sys.executable, tf_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
            )
        else:
            process = subprocess.Popen(
                [sys.executable, tf_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

        try:
            stdout_data, stderr_data = process.communicate(
                input=input_data, timeout=time_limit_sec
            )
            end_time = time.time()
            execution_time_ms = (end_time - start_time) * 1000

            user_output = stdout_data.strip()

            if process.returncode != 0:
                print(
                    get_response(
                        STATUS_RE,
                        source_code,
                        expected_output,
                        execution_time_ms,
                        stderr_data,
                        user_output=user_output,
                        input_test_case=input_data,
                    )
                )
            else:
                expected_output_clean = expected_output.strip()
                if user_output == expected_output_clean:
                    print(
                        get_response(
                            STATUS_AC,
                            source_code,
                            expected_output,
                            execution_time_ms,
                            "",
                            user_output=user_output,
                            input_test_case=input_data,
                        )
                    )
                else:
                    msg = (
                        f"Output Mismatch.\nYour Output:\n{user_output}\n"
                        f"Expected:\n{expected_output_clean}"
                    )
                    print(
                        get_response(
                            STATUS_WA,
                            source_code,
                            expected_output,
                            execution_time_ms,
                            msg,
                            user_output=user_output,
                            input_test_case=input_data,
                        )
                    )

        except subprocess.TimeoutExpired:
            try:
                if platform.system() != "Windows":
                    try:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    except Exception:
                        process.kill()
                else:
                    process.kill()
                process.communicate()
            except Exception:
                pass

            execution_time_ms = time_limit_sec * 1000
            print(
                get_response(
                    STATUS_TLE,
                    source_code,
                    expected_output,
                    execution_time_ms,
                    "Execution exceeded time limit.",
                    user_output="",
                    input_test_case=input_data,
                )
            )

    except Exception as e:
        print(
            get_response(
                STATUS_RE,
                source_code,
                expected_output,
                0,
                f"Judge System Error: {str(e)}",
                user_output="",
                input_test_case=input_data,
            )
        )

    finally:
        if process and process.poll() is None:
            try:
                if platform.system() != "Windows":
                    try:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    except Exception:
                        process.kill()
                else:
                    process.kill()
                process.wait(timeout=0.2)
            except Exception:
                pass

        if tf_path and os.path.exists(tf_path):
            try:
                os.remove(tf_path)
            except Exception:
                pass


if __name__ == "__main__":
    main()
