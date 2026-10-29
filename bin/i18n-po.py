#!/usr/bin/env python3
"""Writes languages/sw-sliderman-de_DE.po from the POT and languages/src/php-de_DE.json.

Usage: python3 bin/i18n-po.py   (then msgfmt compiles the .mo; see bin/i18n.sh)
Fails when a POT entry has no translation, so new PHP strings cannot ship untranslated.
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
pot = (root / 'languages/sw-sliderman.pot').read_text(encoding='utf-8')
catalog = json.loads((root / 'languages/src/php-de_DE.json').read_text(encoding='utf-8'))


def unescape(value: str) -> str:
    return value.encode('utf-8').decode('unicode_escape').encode('latin-1').decode('utf-8')


def escape(value: str) -> str:
    return value.replace('\\', '\\\\').replace('"', '\\"')


entries = re.split(r'\n\n', pot.strip())
out = [
    'msgid ""\nmsgstr ""\n"Project-Id-Version: SW Sliderman\\n"\n"Language: de_DE\\n"\n'
    '"MIME-Version: 1.0\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n'
    '"Content-Transfer-Encoding: 8bit\\n"\n"Plural-Forms: nplurals=2; plural=(n != 1);\\n"\n'
    '"X-Domain: sw-sliderman\\n"\n"Last-Translator: SW Sliderman\\n"\n"Language-Team: German\\n"'
]
missing = []
for entry in entries[1:]:
    match = re.search(r'^msgid "((?:[^"\\]|\\.)*)"$', entry, re.M)
    if not match:
        continue
    msgid = unescape(match.group(1))
    if msgid not in catalog or catalog[msgid] == '':
        missing.append(msgid)
        continue
    head = entry[: entry.index('msgid "')]
    out.append(f'{head}msgid "{escape(msgid)}"\nmsgstr "{escape(catalog[msgid])}"')
if missing:
    sys.stderr.write('Untranslated PHP strings:\n' + '\n'.join(missing) + '\n')
    sys.exit(1)
(root / 'languages/sw-sliderman-de_DE.po').write_text('\n\n'.join(out) + '\n', encoding='utf-8')
print('languages/sw-sliderman-de_DE.po written')
