"""生成内置空白报告模板 skill/templates/report-blank.docx。

纯标准库（zipfile）拼最小 OOXML，不引入 python-docx 等依赖。
程序「创建文档」时只需 copyFileSync 这个模板并改名即可，零依赖、零运行时开销。
改章节结构后重跑：python scripts/make-report-template.py
"""
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "skill" / "templates" / "report-blank.docx"

SECTIONS = [
    "标题", "摘要", "范围与归属", "前置条件", "正常基线", "变异步骤",
    "关键请求与响应差异", "最终业务状态", "实际影响", "根因分析",
    "修复建议", "回归验证", "证据与脱敏说明",
]

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def para(text="", bold=False, size=None):
    rpr = ""
    if bold or size:
        props = ""
        if bold:
            props += "<w:b/>"
        if size:
            props += f'<w:sz w:val="{size * 2}"/><w:szCs w:val="{size * 2}"/>'
        rpr = f"<w:rPr>{props}</w:rPr>"
    run = f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ""
    return f"<w:p>{run}</w:p>"


body = para("安全测试报告", bold=True, size=16)
for s in SECTIONS:
    body += para(s, bold=True, size=12)
    body += para()
body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>'

document = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f"<w:document {W}><w:body>{body}</w:body></w:document>"
)

content_types = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    "</Types>"
)

rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/>'
    "</Relationships>"
)

# 部分 Word/WPS 版本缺这个 part 会提示"文件已损坏"，补一个空关系表最稳
doc_rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
)

OUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.writestr("word/document.xml", document)

print(f"生成 {OUT.relative_to(ROOT)}  ({OUT.stat().st_size} bytes, {len(SECTIONS)} 个小节)")
