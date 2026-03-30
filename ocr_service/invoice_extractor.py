from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Iterable


STRICT_INVOICE_NUMBER_LABEL = "发票号码"
NO_INVOICE_NUMBER = "无发票号码"
MIN_INVOICE_NUMBER_LENGTH = 8
MAX_INVOICE_NUMBER_LENGTH = 30

_WHITESPACE_RE = re.compile(r"\s+")
_INVOICE_NUMBER_RE = re.compile(rf"^[A-Za-z0-9]{{{MIN_INVOICE_NUMBER_LENGTH},{MAX_INVOICE_NUMBER_LENGTH}}}")
_NUMBER_TOKEN_RE = re.compile(rf"[A-Za-z0-9]{{{MIN_INVOICE_NUMBER_LENGTH},{MAX_INVOICE_NUMBER_LENGTH}}}")


@dataclass(frozen=True)
class MatchDetail:
    source: str
    start_line_index: int
    end_line_index: int
    raw_text: str
    normalized_text: str
    candidate: str


def normalize_text(text: str) -> str:
    return _WHITESPACE_RE.sub("", text or "").strip()


def _strip_prefix_punctuation(text: str) -> str:
    return text.lstrip(":：;；,，.。/\\-_")


def _extract_candidate_after_label(text: str) -> str:
    if STRICT_INVOICE_NUMBER_LABEL not in text:
        return ""

    suffix = text.split(STRICT_INVOICE_NUMBER_LABEL, 1)[1]
    suffix = _strip_prefix_punctuation(suffix)
    match = _INVOICE_NUMBER_RE.match(suffix)
    if not match:
        return ""
    return match.group(0)


def _collect_number_tokens(normalized_lines: list[str]) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []

    for line in normalized_lines:
        for token in _NUMBER_TOKEN_RE.findall(line):
            if token in seen:
                continue
            seen.add(token)
            tokens.append(token)

    return tokens


def _collect_match_details(raw_lines: list[str], normalized_lines: list[str]) -> list[MatchDetail]:
    seen: set[tuple[int, int, str]] = set()
    matches: list[MatchDetail] = []
    max_window = 3

    for start in range(len(normalized_lines)):
        for window_size in range(1, max_window + 1):
            end = start + window_size
            if end > len(normalized_lines):
                break

            merged_normalized = "".join(normalized_lines[start:end])
            if STRICT_INVOICE_NUMBER_LABEL not in merged_normalized:
                continue

            candidate = _extract_candidate_after_label(merged_normalized)
            if not candidate:
                continue

            dedupe_key = (start, end - 1, candidate)
            if dedupe_key in seen:
                continue

            seen.add(dedupe_key)
            matches.append(
                MatchDetail(
                    source="single_line" if window_size == 1 else f"window_{window_size}_lines",
                    start_line_index=start,
                    end_line_index=end - 1,
                    raw_text=" | ".join(raw_lines[start:end]),
                    normalized_text=merged_normalized,
                    candidate=candidate,
                )
            )
            break

    return matches


def extract_invoice_number(text_lines: Iterable[str]) -> dict:
    raw_lines = [str(line).strip() for line in text_lines if normalize_text(str(line))]
    normalized_lines = [normalize_text(line) for line in raw_lines]
    combined_text = "".join(normalized_lines)
    match_details = _collect_match_details(raw_lines, normalized_lines)
    all_number_tokens = _collect_number_tokens(normalized_lines)
    matched_invoice_number = match_details[0].candidate if match_details else ""

    return {
        "invoice_number": matched_invoice_number or NO_INVOICE_NUMBER,
        "matched_invoice_number": matched_invoice_number,
        "has_invoice_number_label": STRICT_INVOICE_NUMBER_LABEL in combined_text,
        "raw_text_lines": raw_lines,
        "normalized_text_lines": normalized_lines,
        "combined_text": combined_text,
        "match_details": [asdict(item) for item in match_details],
        "all_number_tokens": all_number_tokens,
        "ignored_number_tokens": [
            token for token in all_number_tokens if token != matched_invoice_number
        ],
        "scan_rule": "strict_label_only_after_发票号码",
    }
