"""
Windows compatibility shim for third-party packages that unconditionally import
`posix.pread`.

This project runs on Windows for local development, where the built-in `posix`
module does not exist. Some pandas-ta builds still import `pread` from `posix`
during module import, even when it is not used at runtime by this project.
"""

from typing import Any


def pread(*args: Any, **kwargs: Any) -> bytes:
    """
    Compatibility stub.

    If any dependency tries to actually call `pread` on Windows, we raise a
    clear error instead of failing at import time.
    """
    raise NotImplementedError("posix.pread is not available on Windows.")

