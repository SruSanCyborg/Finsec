"""Compliance report, laid out as a PDF.

A faithful port of the CLI's hand-written PDF writer (packages/cli/src/engine/
pdf.ts + report-pdf.ts on the CLI branch): text, horizontal rules, page breaks,
no dependencies, WinAnsi-safe output with Rs. in place of ₹.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]

# Helvetica advance widths in 1/1000 em for the printable ASCII range.
_NARROW = set(" .,:;'`|!ilj")
_NUM = set("0123456789")


@dataclass
class TextRun:
    text: str
    size: float = 10
    bold: bool = False
    grey: float = 0
    align: str = "left"
    spaceBefore: float = 0


@dataclass
class PdfOptions:
    title: str
    width: float = 595
    height: float = 842
    margin: float = 56


RULE = object()


def _char_width(ch: str, bold: bool) -> int:
    if ch == " ":
        w = 278
    elif ch in _NARROW:
        w = 278
    elif ch in _NUM:
        w = 556
    elif ch.isupper():
        w = 722 if ch != "I" else 278
    elif ch.islower():
        w = 556
    elif ch in "()[\\]{}/-":
        w = 333
    else:
        w = 556
    return round(w * 1.06) if bold else w


def measure(text: str, size: float, bold: bool = False) -> float:
    total = sum(_char_width(c, bold) for c in text)
    return (total / 1000) * size


def wrap_to_width(text: str, width: float, size: float, bold: bool = False) -> list[str]:
    if measure(text, size, bold) <= width:
        return [text]
    words = [w for w in re.split(r"\s+", text) if w]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}" if current else word
        if current and measure(candidate, size, bold) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def _literal(text: str) -> str:
    """Escape a PDF literal; drop/replace what WinAnsi cannot carry."""
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if ch in "()\\":
            out.append(f"\\{ch}")
        elif ch == "\u20b9":
            out.append("Rs.")
        elif ch in "\u2014\u2013":
            out.append("-")
        elif ch in "\u2018\u2019":
            out.append("'")
        elif ch in "\u201c\u201d":
            out.append('"')
        elif ch in "\u00b7\u2022":
            out.append("-")
        elif code < 32:
            out.append(" ")
        elif code > 255:
            out.append("?")
        else:
            out.append(ch)
    return "".join(out)


def render_pdf(blocks: list, options: PdfOptions) -> bytes:
    width = options.width
    height = options.height
    margin = options.margin
    usable = width - margin * 2

    pages: list[list[str]] = []
    stream: list[str] = []
    y = height - margin

    def new_page() -> None:
        nonlocal stream, y
        if stream:
            pages.append(stream)
        stream = []
        y = height - margin

    for block in blocks:
        if block is RULE:
            if y < margin + 24:
                new_page()
            y -= 8
            stream.append(f"0.85 g {margin:.1f} {y:.1f} {usable} 0.6 re f")
            y -= 12
            continue

        size = block.size or 10
        bold = block.bold or False
        leading = size * 1.45
        y -= block.spaceBefore or 0

        for line in wrap_to_width(block.text, usable, size, bold):
            if y < margin + leading:
                new_page()
            x = margin + usable - measure(line, size, bold) if block.align == "right" else margin
            grey = block.grey or 0
            stream.append(
                f"BT /{'F2' if bold else 'F1'} {size} Tf {grey:.2f} g "
                f"1 0 0 1 {x:.1f} {y:.1f} Tm ({_literal(line)}) Tj ET"
            )
            y -= leading

    if stream:
        pages.append(stream)
    if not pages:
        pages.append([])

    objects: list[str] = []

    def add(body: str) -> int:
        objects.append(body)
        return len(objects)

    font_regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    font_bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

    pages_obj = add("")
    page_numbers: list[int] = []
    for page in pages:
        content = "\n".join(page)
        content_obj = add(
            f"<< /Length {len(content.encode('latin1', errors='replace'))} >>\nstream\n{content}\nendstream"
        )
        page_numbers.append(
            add(
                f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {width} {height}] "
                f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> "
                f"/Contents {content_obj} 0 R >>"
            )
        )

    objects[pages_obj - 1] = (
        f"<< /Type /Pages /Count {len(page_numbers)} /Kids "
        f"[{' '.join(f'{n} 0 R' for n in page_numbers)}] >>"
    )

    info = add(f"<< /Title ({_literal(options.title)}) /Producer (sirius) /Creator (sirius) >>")
    catalog = add(f"<< /Type /Catalog /Pages {pages_obj} 0 R >>")

    chunks: list[bytes] = []
    offset = 0

    def push(text: str) -> None:
        nonlocal offset
        buf = text.encode("latin1", errors="replace")
        chunks.append(buf)
        offset += len(buf)

    push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = []
    for idx, body in enumerate(objects):
        offsets.append(offset)
        push(f"{idx + 1} 0 obj\n{body}\nendobj\n")

    xref = offset
    table = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for o in offsets:
        table += f"{str(o).zfill(10)} 00000 n \n"
    push(table)
    push(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R /Info {info} 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    )
    return b"".join(chunks)


def rupees(paise: int) -> str:
    """Indian digit grouping, Rs. prefix (WinAnsi-safe)."""
    s = f"{paise:,}"
    # en-IN grouping: 12,34,567 → 1,23,45,678 (2-2-3)
    parts = s.split(",")
    if len(parts) > 2:
        head = "".join(parts[:-2])
        tail = ",".join(parts[-2:])
        s = f"{int(head):,},{tail}"
    return f"Rs.{s}"


def report_to_pdf(document: dict) -> bytes:
    """Build the compliance report PDF from a report document dict.

    Mirrors packages/cli/src/engine/report-pdf.ts on the CLI branch.
    """
    blocks: list = []
    summary = document["summary"]
    findings = document.get("findings", [])
    compliance_refs = document.get("compliance_refs", [])
    attestation = document.get("attestation", {})

    blocks.append(TextRun("Compliance report", size=22, bold=True))
    tool = document.get("tool", {})
    blocks.append(TextRun(f"{tool.get('name', 'sirius')} v{tool.get('version', '0.4.0')}", size=9, grey=0.45))
    blocks.append(RULE)
    blocks.append(TextRun(document.get("root", ""), size=10, spaceBefore=4))
    blocks.append(
        TextRun(
            f"scan {document.get('scan_id', '')} · {document.get('source', 'local')} engine"
            + (f" · {document.get('scanned_at', '')}" if document.get("scanned_at") else ""),
            size=9,
            grey=0.45,
        )
    )

    score = summary.get("compliance_score")
    blocks.append(TextRun("Summary", size=13, bold=True, spaceBefore=20))
    blocks.append(RULE)
    blocks.append(
        TextRun(
            "Compliance score  not reported" if score is None else f"Compliance score  {round(score)}/100",
            size=11,
            bold=True,
            spaceBefore=4,
        )
    )
    blocks.append(TextRun(f"Money at risk  {rupees(summary.get('money_at_risk_inr', 0))}", size=11, bold=True))
    findings_count = summary.get("findings", 0)
    files_scanned = summary.get("files_scanned")
    files_txt = f" across {files_scanned} files" if files_scanned is not None else ""
    blocks.append(
        TextRun(f"{findings_count} finding{'s' if findings_count != 1 else ''}{files_txt}", size=10, grey=0.3)
    )
    counts = summary.get("counts", {})
    count_parts = [f"{counts[sev]} {sev}" for sev in SEVERITY_ORDER if counts.get(sev, 0) > 0]
    if count_parts:
        blocks.append(TextRun(" · ".join(count_parts), size=10, grey=0.3))
    blocks.append(
        TextRun(
            "Money at risk is an order-of-magnitude estimate for prioritisation, not an actuarial "
            "figure. Run `sirius explain <rule>` for the derivation of any single number.",
            size=8.5,
            grey=0.5,
            spaceBefore=10,
        )
    )

    if compliance_refs:
        blocks.append(TextRun("Clauses engaged", size=13, bold=True, spaceBefore=20))
        blocks.append(RULE)
        blocks.append(TextRun("   ·   ".join(compliance_refs), size=10, spaceBefore=4))

    blocks.append(TextRun("Findings", size=13, bold=True, spaceBefore=20))
    blocks.append(RULE)
    if not findings:
        blocks.append(TextRun("No findings at or above the configured threshold.", size=10, spaceBefore=4))

    ordered = sorted(
        findings,
        key=lambda f: SEVERITY_ORDER.index(f.get("severity", "info"))
        if f.get("severity") in SEVERITY_ORDER
        else 99,
    )
    for finding in ordered:
        blocks.append(
            TextRun(f"{str(finding.get('severity', '')).upper()}   {finding.get('rule_id', '')}",
                    size=10, bold=True, spaceBefore=12)
        )
        if finding.get("message"):
            blocks.append(TextRun(finding["message"], size=10))
        blocks.append(TextRun(f"{finding.get('file', '')}:{finding.get('line', '')}", size=9, grey=0.4))
        detail = "     ".join(
            x for x in [" · ".join(finding.get("compliance_ref", [])), rupees(finding.get("money_at_risk_inr", 0))] if x
        )
        if detail:
            blocks.append(TextRun(detail, size=9, grey=0.4))

    blocks.append(TextRun("Provenance", size=13, bold=True, spaceBefore=24))
    blocks.append(RULE)
    if attestation:
        blocks.append(
            TextRun(
                f"Signed {attestation.get('algorithm', 'ed25519')} · key {attestation.get('key_id', '')}",
                size=9,
                grey=0.35,
                spaceBefore=4,
            )
        )
        blocks.append(TextRun(f"Signed at {attestation.get('signed_at', '')}", size=9, grey=0.35))
        blocks.append(TextRun(f"Payload SHA-256 {attestation.get('payload_sha256', '')}", size=8, grey=0.35))
    blocks.append(
        TextRun(
            "The signature covers the report payload, not this PDF. A verifier needs that payload "
            "byte for byte: run `sirius report --format json` for the file it can check, and "
            "`sirius report --verify <file>` to check it. The digest above is the same one, so the "
            "two can be compared by eye.",
            size=8.5,
            grey=0.5,
            spaceBefore=10,
        )
    )

    return render_pdf(blocks, PdfOptions(title=f"sirius compliance report {document.get('scan_id', '')}"))
