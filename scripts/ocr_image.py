import argparse
import contextlib
import json
import os
import subprocess
import sys
import warnings
from pathlib import Path

os.environ.setdefault("FLAGS_minloglevel", "3")
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("PADDLE_CPP_LOG_LEVEL", "ERROR")
warnings.filterwarnings("ignore")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False))


def run_tesseract(image_path, tesseract_exe):
    if not tesseract_exe or not Path(tesseract_exe).exists():
        return {"text": "", "error": f"tesseract_not_found: {tesseract_exe or ''}"}
    try:
        completed = subprocess.run(
            [tesseract_exe, str(image_path), "stdout", "-l", "chi_sim+eng", "--psm", "11"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if completed.returncode != 0:
            return {"text": completed.stdout.strip(), "error": completed.stderr.strip() or f"tesseract_exit_{completed.returncode}"}
        return {"text": completed.stdout.strip(), "error": ""}
    except Exception as exc:
        return {"text": "", "error": str(exc)}


def flatten_paddle_result(result):
    texts = []
    if not result:
        return texts
    for item in result:
        if isinstance(item, dict):
            rec_texts = item.get("rec_texts")
            if isinstance(rec_texts, list):
                texts.extend(str(text) for text in rec_texts if text)
            continue
        if isinstance(item, (list, tuple)):
            if len(item) >= 2 and isinstance(item[1], (list, tuple)) and item[1]:
                texts.append(str(item[1][0]))
            else:
                texts.extend(flatten_paddle_result(item))
    return texts


def run_paddle(image_path):
    os.environ.setdefault("FLAGS_use_onednn", "0")
    os.environ.setdefault("FLAGS_use_mkldnn", "0")
    os.environ.setdefault("FLAGS_enable_pir_api", "0")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    try:
        with contextlib.redirect_stdout(sys.stderr):
            from paddleocr import PaddleOCR
    except Exception as exc:
        return {"text": "", "error": f"paddleocr_not_available: {exc}"}

    try:
        with contextlib.redirect_stdout(sys.stderr):
            try:
                ocr = PaddleOCR(
                    lang="ch",
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
            except Exception:
                ocr = PaddleOCR(lang="ch")

            try:
                result = ocr.predict(str(image_path), use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
            except Exception:
                result = ocr.ocr(str(image_path))

        return {"text": "\n".join(flatten_paddle_result(result)).strip(), "error": ""}
    except Exception as exc:
        return {"text": "", "error": str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--provider", choices=["tesseract", "paddle"], default="tesseract")
    parser.add_argument("--fallback", choices=["none", "tesseract"], default="tesseract")
    parser.add_argument("--tesseract-exe", default="")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        emit({"text": "", "error": f"image_not_found: {image_path}", "provider": args.provider})
        return 0

    if args.provider == "paddle":
        result = run_paddle(image_path)
        if result["text"] or args.fallback == "none":
            emit({**result, "provider": "paddle"})
            return 0
        fallback = run_tesseract(image_path, args.tesseract_exe)
        emit({
            "text": fallback["text"],
            "error": f"paddle_failed: {result['error']}; tesseract: {fallback['error']}",
            "provider": "paddle+tesseract",
        })
        return 0

    result = run_tesseract(image_path, args.tesseract_exe)
    emit({**result, "provider": "tesseract"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
