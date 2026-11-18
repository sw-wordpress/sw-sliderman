#!/usr/bin/env python3
"""Reproducible, original local templates. No third-party assets or network access."""
import copy
import hashlib
import json
import re
from pathlib import Path
import struct
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent.parent
LICENSE = 'CC0-1.0: Original geometric artwork by the SW Sliderman project, dedicated to the public domain. https://creativecommons.org/publicdomain/zero/1.0/'


def png():
    width, height = 800, 400
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            ridge = height - abs(x - 480) // 2 - 80
            rows.extend((38, 95, 105) if y > ridge else (17 + y // 12, 32 + y // 8, 58 + y // 6))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')


def encode(data):
    return json.dumps(data, ensure_ascii=True, separators=(',', ':')).encode()


def main():
    version = re.search(r"define\( 'SWS_VERSION', '([^']+)' \);", (ROOT / 'sw-sliderman.php').read_text()).group(1)
    minimum = re.search(r"MIN_PLUGIN_VERSION = '([^']+)'", (ROOT / 'src/ImportExport/PackageManifest.php').read_text()).group(1)
    base = json.loads((ROOT / 'schemas/defaults/new-slider.json').read_text())
    example = json.loads((ROOT / 'tests/fixtures/documents/valid/basic.json').read_text())
    for name in ['image-slider', 'text-hero', 'event']:
        doc = copy.deepcopy(base)
        doc['id'] = name
        doc['settings']['label'] = name.replace('-', ' ').title()
        slide = doc['slides'][0]
        slide['name'] = doc['settings']['label']
        heading = copy.deepcopy(example['slides'][0]['layers'][0])
        heading['style']['fontRef'] = None
        heading['content']['text'] = {'image-slider': 'New perspectives', 'text-hero': 'Ideas become reality', 'event': 'An evening of inspiration'}[name]
        slide['layers'] = [heading]
        media, payload = [], {}
        if name == 'image-slider':
            data = png()
            path = 'media/' + hashlib.sha256(data).hexdigest() + '.png'
            payload[path] = data
            media = [{'id': 1, 'file': path, 'mime': 'image/png', 'alt': 'Abstract mountain landscape', 'license': LICENSE}]
            slide['background']['attachmentId'] = 1
            second = copy.deepcopy(slide)
            second['id'] = 'slide-2'
            second['name'] = 'A fresh view'
            second['layers'][0]['id'] = 'heading-2'
            second['layers'][0]['content']['text'] = 'A fresh view'
            doc['slides'].append(second)
        else:
            button = copy.deepcopy(example['slides'][0]['layers'][1])
            button['content']['label'] = 'Discover more' if name == 'text-hero' else 'Event details'
            button['content']['url'] = '#details'
            slide['layers'].append(button)
            if name == 'event':
                detail = copy.deepcopy(heading)
                detail['id'] = 'date'
                detail['content']['text'] = 'Friday · 18:00 · Community hall'
                detail['content']['tag'] = 'p'
                detail['layout']['y'] = 300
                detail['style']['fontSize'] = 28
                detail['overrides']['mobile']['layout']['y'] = 230
                detail['overrides']['mobile']['style']['fontSize'] = 22
                slide['layers'].append(detail)
        payload['slider.json'] = encode(doc)
        manifest = {'formatVersion': 1, 'schemaVersion': 1, 'pluginVersion': version, 'minPluginVersion': minimum, 'complete': True, 'title': doc['settings']['label'], 'media': media, 'fonts': [], 'files': [{'path': key, 'sizeBytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()} for key, value in sorted(payload.items())]}
        payload['manifest.json'] = encode(manifest)
        with zipfile.ZipFile(ROOT / 'templates' / (name + '.zip'), 'w', compression=zipfile.ZIP_STORED) as archive:
            for key, value in sorted(payload.items()):
                info = zipfile.ZipInfo(key, (2026, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                archive.writestr(info, value)


if __name__ == '__main__':
    main()
