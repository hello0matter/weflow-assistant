import argparse
import re
import ctypes
import json
import os
import sys
import time
from ctypes import wintypes
from pathlib import Path

from PIL import ImageGrab

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from ocr_image import run_paddle, run_tesseract


user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalUnlock.restype = wintypes.BOOL
kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.CloseHandle.restype = wintypes.BOOL
user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
user32.SetClipboardData.restype = wintypes.HANDLE
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.SetWindowPos.restype = wintypes.BOOL
user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
user32.GetAncestor.restype = wintypes.HWND
user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int
user32.GetForegroundWindow.restype = wintypes.HWND


EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


user32.WindowFromPoint.argtypes = [POINT]
user32.WindowFromPoint.restype = wintypes.HWND


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", INPUTUNION)]


INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
VK_CONTROL = 0x11
VK_A = 0x41
VK_V = 0x56
VK_BACK = 0x08
VK_RETURN = 0x0D
VK_ESCAPE = 0x1B

SW_RESTORE = 9
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
HWND_TOPMOST = wintypes.HWND(-1)
HWND_NOTOPMOST = wintypes.HWND(-2)
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_SHOWWINDOW = 0x0040

GMEM_MOVEABLE = 0x0002
CF_UNICODETEXT = 13
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
SM_CXSCREEN = 0
SM_CYSCREEN = 1
GA_ROOT = 2


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))


def get_window_text(hwnd):
    length = user32.GetWindowTextLengthW(hwnd)
    buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buffer, length + 1)
    return buffer.value


def get_class_name(hwnd):
    buffer = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buffer, 256)
    return buffer.value


def get_rect(hwnd):
    rect = RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    return {
        "left": int(rect.left),
        "top": int(rect.top),
        "right": int(rect.right),
        "bottom": int(rect.bottom),
        "width": int(rect.right - rect.left),
        "height": int(rect.bottom - rect.top),
    }


def get_process_name(pid):
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not handle:
        return ""
    try:
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return ""
        return Path(buffer.value).stem
    finally:
        kernel32.CloseHandle(handle)


def enum_visible_windows():
    windows = []

    @EnumWindowsProc
    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        rect = get_rect(hwnd)
        if not rect or rect["width"] < 450 or rect["height"] < 350:
            return True
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        process_name = get_process_name(pid.value)
        title = get_window_text(hwnd)
        class_name = get_class_name(hwnd)
        windows.append({
            "hwnd": int(hwnd),
            "pid": int(pid.value),
            "processName": process_name,
            "title": title,
            "className": class_name,
            **rect,
        })
        return True

    user32.EnumWindows(callback, 0)
    return windows


def enum_windows(target_pid=0):
    windows = []
    for item in enum_visible_windows():
        process_name = item["processName"]
        title = item["title"]
        class_name = item["className"]
        if process_name not in {"Weixin", "WeChatAppEx"}:
            continue
        if "登录" in title or "二维码" in title:
            continue
        if process_name == "Weixin" and class_name != "Qt51514QWindowIcon":
            continue
        if process_name == "WeChatAppEx" and "微信" not in title:
            continue
        if target_pid and int(item["pid"]) != int(target_pid):
            continue
        windows.append(item)
    windows.sort(key=lambda item: (item["processName"] != "Weixin", -item["width"] * item["height"]))
    return windows


def is_weixin_window(window):
    process_name = window.get("processName")
    title = window.get("title") or ""
    class_name = window.get("className") or ""
    if process_name not in {"Weixin", "WeChatAppEx"}:
        return False
    if "登录" in title or "二维码" in title:
        return False
    if process_name == "Weixin" and class_name != "Qt51514QWindowIcon":
        return False
    if process_name == "WeChatAppEx" and "微信" not in title:
        return False
    return True


def window_from_hwnd(hwnd):
    rect = get_rect(hwnd)
    if not rect:
        return None
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return {
        "hwnd": int(hwnd),
        "pid": int(pid.value),
        "processName": get_process_name(pid.value),
        "title": get_window_text(hwnd),
        "className": get_class_name(hwnd),
        **rect,
    }


def set_clipboard_text(text):
    data = (text + "\0").encode("utf-16le")
    if not user32.OpenClipboard(None):
        raise RuntimeError("open_clipboard_failed")
    try:
        user32.EmptyClipboard()
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
        if not handle:
            raise RuntimeError("global_alloc_failed")
        locked = kernel32.GlobalLock(handle)
        if not locked:
            raise RuntimeError("global_lock_failed")
        ctypes.memmove(locked, data, len(data))
        kernel32.GlobalUnlock(handle)
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            raise RuntimeError("set_clipboard_data_failed")
    finally:
        user32.CloseClipboard()


def send_key(vk, keyup=False):
    flags = KEYEVENTF_KEYUP if keyup else 0
    input_item = INPUT(type=INPUT_KEYBOARD, u=INPUTUNION(ki=KEYBDINPUT(vk, 0, flags, 0, 0)))
    user32.SendInput(1, ctypes.byref(input_item), ctypes.sizeof(INPUT))


def send_unicode_char(char, keyup=False):
    flags = KEYEVENTF_UNICODE | (KEYEVENTF_KEYUP if keyup else 0)
    input_item = INPUT(type=INPUT_KEYBOARD, u=INPUTUNION(ki=KEYBDINPUT(0, ord(char), flags, 0, 0)))
    user32.SendInput(1, ctypes.byref(input_item), ctypes.sizeof(INPUT))


def type_text_unicode(text, interval=0.035):
    for char in str(text or ""):
        codepoint = ord(char)
        if codepoint > 0xFFFF:
            for surrogate in char.encode("utf-16le"):
                _ = surrogate
            continue
        send_unicode_char(char)
        send_unicode_char(char, True)
        time.sleep(interval)


def paste_text(text):
    set_clipboard_text(text)
    time.sleep(0.18)
    hotkey_ctrl(VK_V)
    time.sleep(0.25)


def hotkey_ctrl(vk):
    send_key(VK_CONTROL)
    time.sleep(0.06)
    send_key(vk)
    time.sleep(0.06)
    send_key(vk, True)
    time.sleep(0.04)
    send_key(VK_CONTROL, True)
    time.sleep(0.08)


def backspace():
    send_key(VK_BACK)
    send_key(VK_BACK, True)


def enter():
    send_key(VK_RETURN)
    send_key(VK_RETURN, True)


def escape():
    send_key(VK_ESCAPE)
    send_key(VK_ESCAPE, True)


def click(x, y):
    user32.SetCursorPos(int(x), int(y))
    user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def focus_window(window):
    hwnd = wintypes.HWND(window["hwnd"])
    user32.ShowWindowAsync(hwnd, SW_RESTORE)
    time.sleep(0.2)
    user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
    time.sleep(0.15)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.5)
    foreground = int(user32.GetForegroundWindow())
    return foreground


def is_window_foreground(window):
    return int(user32.GetForegroundWindow()) == int(window["hwnd"])


def ensure_window_foreground(window):
    if is_window_foreground(window):
        return True
    focus_window(window)
    time.sleep(0.25)
    if is_window_foreground(window):
        return True
    click(window["left"] + 20, window["top"] + 20)
    time.sleep(0.25)
    return is_window_foreground(window)


def release_topmost(window):
    hwnd = wintypes.HWND(window["hwnd"])
    user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)


def close_search_panel(window):
    focus_window(window)
    try:
        escape()
        time.sleep(0.15)
    finally:
        release_topmost(window)


def ocr_image(image_path, provider, tesseract_exe):
    if provider == "paddle":
        result = run_paddle(image_path)
        if result.get("text"):
            return {**result, "provider": "paddle"}
        fallback = run_tesseract(image_path, tesseract_exe)
        return {
            "text": fallback.get("text", ""),
            "error": f"paddle_failed: {result.get('error', '')}; tesseract: {fallback.get('error', '')}",
            "provider": "paddle+tesseract",
        }
    return {**run_tesseract(image_path, tesseract_exe), "provider": "tesseract"}


def clean_ocr_text(text):
    lines = []
    for line in str(text or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if "Creating model:" in stripped:
            continue
        if "Model files already exist" in stripped:
            continue
        if "To redownload" in stripped:
            continue
        if ".paddlex" in stripped:
            continue
        if re.fullmatch(r"\x1b\[[0-9;]*m|\[\d+m|\[0m", stripped):
            continue
        lines.append(stripped)
    return "\n".join(lines)


def search_result_crop(window):
    return {
        "x": window["left"] + int(window["width"] * 0.08),
        "y": window["top"] + int(window["height"] * 0.10),
        "w": max(300, int(window["width"] * 0.38)),
        "h": max(280, int(window["height"] * 0.58)),
        "description": "python: x=8%, y=10%, w=38%, h=58%, scale=2",
    }


def get_screenshot_scale():
    screen = ImageGrab.grab()
    logical_width = max(1, int(user32.GetSystemMetrics(SM_CXSCREEN)))
    logical_height = max(1, int(user32.GetSystemMetrics(SM_CYSCREEN)))
    return screen.width / logical_width, screen.height / logical_height


def grab_logical_bbox(x, y, width, height):
    scale_x, scale_y = get_screenshot_scale()
    bbox = (
        int(round(x * scale_x)),
        int(round(y * scale_y)),
        int(round((x + width) * scale_x)),
        int(round((y + height) * scale_y)),
    )
    return ImageGrab.grab(bbox=bbox), bbox, {"x": scale_x, "y": scale_y}


def search_and_ocr(args):
    windows = enum_windows(args.target_pid)
    if not windows:
        return {"foundWindow": False, "reason": "target_weixin_window_not_found", "targetPid": args.target_pid, "candidates": enum_windows()}

    window = windows[0]
    foreground = focus_window(window)
    try:
        click_x = window["left"] + int(window["width"] * args.ratio_x)
        click_y = window["top"] + int(window["height"] * args.ratio_y)
        click(click_x, click_y)
        time.sleep(0.35)
        hotkey_ctrl(VK_A)
        time.sleep(0.08)
        backspace()
        time.sleep(0.08)
        paste_text(args.keyword)
        time.sleep(args.wait)
        foreground_after_input = int(user32.GetForegroundWindow())
        if not ensure_window_foreground(window):
            return {
                "foundWindow": True,
                "activated": False,
                "prepared": False,
                "reason": "weixin_focus_failed",
                "windowTitle": window["title"],
                "pid": window["pid"],
                "window": window,
                "keyword": args.keyword,
                "click": {"x": click_x, "y": click_y, "ratioX": args.ratio_x, "ratioY": args.ratio_y, "foreground": foreground, "foregroundAfterInput": foreground_after_input},
            }

        if args.skip_ocr:
            return {
                "foundWindow": True,
                "windowTitle": window["title"],
                "pid": window["pid"],
                "window": window,
                "searchFocusMethod": "python_relative_click",
                "searchInputMethod": "clipboard_ctrl_v",
                "keyword": args.keyword,
                "click": {"x": click_x, "y": click_y, "ratioX": args.ratio_x, "ratioY": args.ratio_y, "foreground": foreground, "foregroundAfterInput": foreground_after_input},
                "searchOcrSkipped": True,
                "searchOcrProvider": "disabled",
                "searchOcrError": "",
                "searchOcrText": "",
            }

        crop = search_result_crop(window)
        crop_x = crop["x"]
        crop_y = crop["y"]
        crop_w = crop["w"]
        crop_h = crop["h"]
        image, physical_bbox, screenshot_scale = grab_logical_bbox(crop_x, crop_y, crop_w, crop_h)
        scale = 2
        image = image.resize((image.width * scale, image.height * scale))
        image_path = Path(os.environ.get("TEMP", ".")) / f"weixin-search-py-{int(time.time() * 1000)}.png"
        image.save(image_path)

        ocr = ocr_image(image_path, args.ocr_provider, args.tesseract_exe)
        ocr_text = clean_ocr_text(ocr.get("text", ""))
        return {
            "foundWindow": True,
            "windowTitle": window["title"],
            "pid": window["pid"],
            "window": window,
            "searchFocusMethod": "python_relative_click",
            "searchInputMethod": "clipboard_ctrl_v",
            "keyword": args.keyword,
            "click": {"x": click_x, "y": click_y, "ratioX": args.ratio_x, "ratioY": args.ratio_y, "foreground": foreground, "foregroundAfterInput": foreground_after_input},
            "searchOcrCrop": crop["description"],
            "searchOcrPixelCrop": f"{crop_x},{crop_y},{crop_w},{crop_h}",
            "searchOcrPhysicalCrop": ",".join(str(value) for value in physical_bbox),
            "screenshotScale": screenshot_scale,
            "searchOcrImagePath": str(image_path),
            "searchOcrProvider": ocr.get("provider", args.ocr_provider),
            "searchOcrError": ocr.get("error", ""),
            "searchOcrText": ocr_text,
        }
    finally:
        release_topmost(window)


def is_search_match(ocr_text, keyword):
    text = str(ocr_text or "")
    compact = "".join(text.split())
    keyword_compact = "".join(str(keyword or "").split())
    has_network = "搜索网络" in compact or "搜一搜" in compact
    has_hit_group = any(token in compact for token in ["最佳使用", "聊天记录", "联系人", "群聊"])
    has_keyword = bool(keyword_compact and keyword_compact in compact)
    if has_hit_group and has_keyword:
        return True
    if has_hit_group and not has_network:
        return True
    if has_network and not has_hit_group:
        return False
    return has_keyword and not has_network


def prepare_draft(args):
    result = search_and_ocr(args)
    if not result.get("foundWindow"):
        return {**result, "activated": False, "prepared": False}

    matched = bool(result.get("searchOcrSkipped")) or is_search_match(result.get("searchOcrText", ""), args.keyword)
    if not matched:
        close_search_panel(result["window"])
        return {
            **result,
            "activated": True,
            "prepared": False,
            "reason": "weixin_search_no_match",
            "searchText": args.keyword,
            "hasReadableSearchText": bool(result.get("searchOcrText")),
            "searchOcrPreview": str(result.get("searchOcrText", ""))[:500],
        }

    window = result["window"]
    focus_window(window)
    try:
        enter()
        time.sleep(0.8)
        pasted = False
        if args.should_paste and args.draft:
            hotkey_ctrl(VK_A)
            time.sleep(0.08)
            backspace()
            time.sleep(0.1)
            set_clipboard_text(args.draft)
            time.sleep(max(0, args.delay_ms / 1000.0))
            hotkey_ctrl(VK_V)
            pasted = True
            time.sleep(0.2)
        if args.auto_send:
            enter()
            time.sleep(0.2)
    finally:
        release_topmost(window)

    return {
        **result,
        "activated": True,
        "prepared": True,
        "reason": "",
        "selected": True,
        "pasted": pasted,
        "inputMode": "paste",
        "autoSent": bool(args.auto_send),
        "sendMode": "enter",
        "cleared": True,
        "searchText": args.keyword,
    }


def list_windows(args):
    return {"windows": enum_windows(), "targetPid": args.target_pid}


def calibrate_search_box(args):
    windows = enum_windows(args.target_pid)
    if not windows:
        return {"calibrated": False, "reason": "target_weixin_window_not_found", "candidates": []}
    window = windows[0]
    point = POINT()
    user32.GetCursorPos(ctypes.byref(point))
    ratio_x = round((point.x - window["left"]) / float(window["width"]), 4)
    ratio_y = round((point.y - window["top"]) / float(window["height"]), 4)
    inside = 0 <= ratio_x <= 1 and 0 <= ratio_y <= 1
    return {
        "calibrated": inside,
        "reason": "" if inside else "cursor_not_inside_weixin_window",
        "ratioX": ratio_x,
        "ratioY": ratio_y,
        "cursorX": int(point.x),
        "cursorY": int(point.y),
        "window": window,
    }


def calibrate_target_window():
    point = POINT()
    user32.GetCursorPos(ctypes.byref(point))
    hwnd = user32.WindowFromPoint(point)
    root = user32.GetAncestor(hwnd, GA_ROOT) if hwnd else 0
    window = window_from_hwnd(root)
    if not window:
        return {"calibrated": False, "reason": "cursor_window_not_found", "cursorX": int(point.x), "cursorY": int(point.y)}
    if not is_weixin_window(window):
        return {
            "calibrated": False,
            "reason": "cursor_window_is_not_weixin",
            "cursorX": int(point.x),
            "cursorY": int(point.y),
            "window": window,
        }
    return {
        "calibrated": True,
        "targetPid": int(window["pid"]),
        "cursorX": int(point.x),
        "cursorY": int(point.y),
        "window": window,
    }


def activate_window(args):
    windows = enum_windows(args.target_pid)
    if not windows:
        return {"activated": False, "reason": "target_weixin_window_not_found", "candidates": []}
    window = windows[0]
    foreground = focus_window(window)
    release_topmost(window)
    return {
        "activated": True,
        "pid": window["pid"],
        "processName": window["processName"],
        "title": window["title"],
        "window": window,
        "foreground": foreground,
    }


def cleanup_search_panel(args):
    windows = enum_windows(args.target_pid)
    if not windows:
        return {"closed": [], "reason": "target_weixin_window_not_found", "candidates": []}
    window = windows[0]
    close_search_panel(window)
    return {"closed": [{"pid": window["pid"], "title": window["title"], "processName": window["processName"]}]}


def activate_assistant(args):
    keywords = [
        "WeFlow 助手",
        f"127.0.0.1:{args.port}",
        f"localhost:{args.port}",
    ]
    candidates = []
    for window in enum_visible_windows():
        title = window.get("title") or ""
        process_name = window.get("processName") or ""
        if process_name.lower() not in {"electron", "chrome", "msedge"}:
            continue
        if any(keyword and keyword in title for keyword in keywords):
            candidates.append(window)
    if not candidates:
        return {"activated": False, "reason": "assistant_window_not_found", "candidates": []}
    def score(window):
        title = window.get("title") or ""
        process_name = (window.get("processName") or "").lower()
        is_electron = process_name in {"electron", "weflow-assistant"}
        exact_title = title == "WeFlow 助手"
        return (0 if is_electron else 1, 0 if exact_title else 1, -window["width"] * window["height"])

    window = sorted(candidates, key=score)[0]
    foreground = focus_window(window)
    release_topmost(window)
    return {"activated": True, "window": window, "foreground": foreground}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["debug-search", "prepare-draft", "list-windows", "calibrate-search-box", "calibrate-target-window", "activate-window", "activate-assistant", "cleanup-search-panel"])
    parser.add_argument("--keyword", default="")
    parser.add_argument("--draft", default="")
    parser.add_argument("--should-paste", action="store_true")
    parser.add_argument("--auto-send", action="store_true")
    parser.add_argument("--delay-ms", type=int, default=1200)
    parser.add_argument("--ratio-x", type=float, default=0.19)
    parser.add_argument("--ratio-y", type=float, default=0.071)
    parser.add_argument("--ocr-provider", choices=["tesseract", "paddle"], default="paddle")
    parser.add_argument("--skip-ocr", action="store_true")
    parser.add_argument("--tesseract-exe", default="")
    parser.add_argument("--wait", type=float, default=1.2)
    parser.add_argument("--port", type=int, default=5088)
    parser.add_argument("--target-pid", type=int, default=0)
    args = parser.parse_args()

    if args.command == "list-windows":
        emit(list_windows(args))
        return 0
    if args.command == "calibrate-search-box":
        emit(calibrate_search_box(args))
        return 0
    if args.command == "calibrate-target-window":
        emit(calibrate_target_window())
        return 0
    if args.command == "activate-window":
        emit(activate_window(args))
        return 0
    if args.command == "cleanup-search-panel":
        emit(cleanup_search_panel(args))
        return 0
    if args.command == "activate-assistant":
        emit(activate_assistant(args))
        return 0

    if args.command == "debug-search":
        if not args.keyword:
            emit({"foundWindow": False, "reason": "missing_keyword"})
            return 0
        result = search_and_ocr(args)
        if result.get("foundWindow"):
            close_search_panel(result["window"])
        emit(result)
        return 0
    if args.command == "prepare-draft":
        if not args.keyword:
            emit({"activated": False, "prepared": False, "reason": "missing_keyword"})
            return 0
        emit(prepare_draft(args))
        return 0
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        emit({"foundWindow": False, "reason": "python_exception", "error": str(exc)})
        sys.exit(0)
