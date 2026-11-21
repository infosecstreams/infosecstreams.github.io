#!/usr/bin/env python3
"""Write rack.riv: the hero's server rack, without the Rive editor or CLI.

Type and property keys come from rive-runtime's generated headers (MIT),
frozen into defs.json (pinned commit in its "source"). Import rules followed (rive-runtime
src/file.cpp + importers):
  - Backboard, then each Artboard; the artboard is object 0 of its own list and
    every Component after it takes the next index (parentId = that index);
  - animations follow the components; KeyedObject.objectId = component index;
  - state machines follow animations; AnimationState.animationId = index into
    the artboard's animations; StateTransition.stateToId = index of the state
    in its layer.
No manifest is written, so nothing plays before the scene.

Scene (artboard 560 x 420): a 2 x 22 rack of half-width sleds. Each sled i has
named nodes the page drives through the low-level API (artboard.node(name)):
  on{i} / pre{i}  status LED, green (live) / amber (getting ready); scale 0 = off
  bar{i}          30-day activity bar, scaleX = share of the most active streamer
plus sel (the selection bracket that follows the cursor), selbar (its bright
bar), scan (a slow scan line, animated by the 'idle' animation the 'Rack'
state machine plays) and hole (the empty slot a clicked sled leaves).
Second artboard, 'Console': the rack console a clicked sled slides out as,
built from unit pieces hero.ts lays out at any size (see below).
usage: build_rack.py <out.riv> <out.svg> <out.json>
  run from site/: python3 scripts/rive/build_rack.py src/assets/rive/rack.riv src/assets/rack.svg src/assets/rack.json
"""
import json, os, struct, sys

# Frozen from rive-runtime's generated headers (see defs.json "source").
_DEFS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'defs.json')))['classes']
class defs:  # noqa: N801 — same shape as the header parser this was frozen from
    @staticmethod
    def cls(name):
        c = _DEFS[name]
        return {'typeKey': c['typeKey'], 'props': {k: tuple(v) for k, v in c['props'].items()}}

FALLBACK = {'cornerRadiusTL': 'Double', 'linkCornerRadius': 'Bool', 'name': 'String', 'parentId': 'Uint', 'objectId': 'Uint', 'animationId': 'Uint', 'stateToId': 'Uint',
            'defaultStateMachineId': 'Uint', 'interpolatorId': 'Uint'}

def varuint(n):
    n = int(n); out = bytearray()
    while True:
        b = n & 0x7F; n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n: return bytes(out)

def enc(t, v):
    if t == 'Double': return struct.pack('<f', float(v))
    if t == 'Uint': return varuint(v)
    if t == 'Bool': return bytes([1 if v else 0])
    if t == 'Color': return struct.pack('<I', v)
    if t == 'String': b = str(v).encode(); return varuint(len(b)) + b
    raise ValueError(t)

class Out:
    def __init__(self):
        self.buf = bytearray(b'RIVE') + varuint(7) + varuint(0) + varuint(0) + varuint(0)
    def obj(self, typ, **props):
        c = defs.cls(typ)
        self.buf += varuint(c['typeKey'])
        for k, v in props.items():
            if v is None: continue
            key, t = c['props'][k]
            t = t or FALLBACK[k]
            self.buf += varuint(key) + enc(t, v)
        self.buf += varuint(0)

def argb(hexrgb, a=255):
    return (a << 24) | int(hexrgb.lstrip('#'), 16)

# ---- scene ----
W, H = 560, 420
COLS, ROWS = 2, 22
FRAME_X, FRAME_Y, FRAME_W, FRAME_H = 40, 14, 480, 392
RAIL = 22                      # rail width each side, with mounting holes
GAP = 6
SLED_W = (FRAME_W - 2 * RAIL - GAP * (COLS + 1)) / COLS
SLED_H = (FRAME_H - 2 * 10 - 2 * (ROWS - 1)) / ROWS
# the bar sits right of the name plate (the page writes names there: .rack-names)
NAME_X, NAME_W = 22, 92
BAR_X, BAR_W, BAR_H = 120, SLED_W - 120 - 14, 4

VOID, CARBON, GRAPHITE, LINE, LINE_HI = '#0b0e12', '#121519', '#1a1d21', '#2a2d31', '#3a3d42'
LED, LED_DIM, AMBER = '#00d892', '#0f3d30', '#f5b83d'

comps = []   # (type, props, parentIndex)
def add(typ, parent, **props):
    comps.append((typ, props, parent)); return len(comps)  # artboard is 0

def rect_shape(parent, name, x, y, w, h, fill=None, stroke=None, thick=1, origin=(0, 0), fill_a=255, stroke_a=255):
    s = add('Shape', parent, name=name, x=x, y=y)
    add('Rectangle', s, width=w, height=h, originX=origin[0], originY=origin[1])
    if fill:
        f = add('Fill', s); add('SolidColor', f, colorValue=argb(fill, fill_a))
    if stroke:
        k = add('Stroke', s, thickness=thick); add('SolidColor', k, colorValue=argb(stroke, stroke_a))
    return s

def dot(parent, name, x, y, d, color, a=255):
    s = add('Shape', parent, name=name, x=x, y=y)
    add('Ellipse', s, width=d, height=d)
    f = add('Fill', s); add('SolidColor', f, colorValue=argb(color, a))
    return s

# Drawables later in the list draw on top, so build back to front.
frame = add('Node', 0, name='frame', x=0, y=0)
rect_shape(frame, 'cabinet', FRAME_X, FRAME_Y, FRAME_W, FRAME_H, fill=CARBON, stroke=LINE_HI)
for side in (0, 1):
    rx = FRAME_X + (0 if side == 0 else FRAME_W - RAIL)
    rect_shape(frame, f'rail{side}', rx, FRAME_Y, RAIL, FRAME_H, fill=GRAPHITE, stroke=LINE)
    for u in range(ROWS):
        hy = FRAME_Y + 10 + u * (SLED_H + 2) + SLED_H / 2 - 1.5
        rect_shape(frame, f'hole{side}_{u}', rx + RAIL / 2 - 2, hy, 4, 3, fill=VOID)

rack = add('Node', 0, name='rack', x=0, y=0)
for i in range(COLS * ROWS):
    col, row = i % COLS, i // COLS
    sx = FRAME_X + RAIL + GAP + col * (SLED_W + GAP)
    sy = FRAME_Y + 10 + row * (SLED_H + 2)
    sled = add('Node', rack, name=f'sled{i}', x=sx, y=sy)
    rect_shape(sled, f'face{i}', 0, 0, SLED_W, SLED_H, fill=VOID, stroke=LINE)
    dot(sled, f'led{i}', 11, SLED_H / 2, 5, LINE_HI)
    halo = dot(sled, f'on{i}', 11, SLED_H / 2, 12, LED, 60)
    dot(halo, f'oncore{i}', 0, 0, 5, LED)
    dot(sled, f'pre{i}', 11, SLED_H / 2, 5, AMBER)
    rect_shape(sled, f'track{i}', BAR_X, SLED_H / 2 - BAR_H / 2, BAR_W, BAR_H, fill=GRAPHITE)
    rect_shape(sled, f'bar{i}', BAR_X, SLED_H / 2 - BAR_H / 2, BAR_W, BAR_H, fill=LED_DIM)
    # two vent slits at the right edge
    for v in range(2):
        rect_shape(sled, f'vent{i}_{v}', SLED_W - 10 + v * 4, 3, 1.5, SLED_H - 6, fill=GRAPHITE)

scan = add('Node', 0, name='scan', x=0, y=FRAME_Y + 10)
rect_shape(scan, 'scanglow', FRAME_X + RAIL, -6, FRAME_W - 2 * RAIL, 12, fill=LED, fill_a=14)
rect_shape(scan, 'scanline', FRAME_X + RAIL, 0, FRAME_W - 2 * RAIL, 1, fill=LED, fill_a=60)

sel = add('Node', 0, name='sel', x=0, y=0, scaleX=0, scaleY=0)
rect_shape(sel, 'selbox', -3, -3, SLED_W + 6, SLED_H + 6, stroke=LED, thick=1, stroke_a=200)
selbar = add('Node', sel, name='selbar', x=BAR_X, y=SLED_H / 2 - BAR_H / 2)
rect_shape(selbar, 'selbarfill', 0, 0, BAR_W, BAR_H, fill=LED)
for cx, cy in ((-3, -3), (SLED_W + 3, -3), (-3, SLED_H + 3), (SLED_W + 3, SLED_H + 3)):
    rect_shape(sel, f'tick{cx}{cy}', cx - 1.5, cy - 1.5, 3, 3, fill=LED)

# ---- console ----
# Clicking a sled slides it out as a rack-mount console that leaves the rack and
# fills most of the window. In the rack only its empty slot ('hole') is drawn;
# the console itself is a second artboard, 'Console', on a full-window canvas.
con = add('Node', 0, name='con', x=0, y=0, scaleX=0, scaleY=0)
hole = add('Node', con, name='hole', x=0, y=0)
rect_shape(hole, 'holeface', 0, 0, SLED_W, SLED_H, fill='#050608', stroke=LINE)

RACK = comps
comps = []
# The Console artboard is built from unit squares and unit circles with fills
# only (no strokes, hairlines are 1-unit rects), so hero.ts can lay it out at
# any size by setting each named piece's x, y and scale: crisp at every width,
# from a phone to a wide monitor. Units are CSS pixels. Nodes:
#   deck  keyboard tray; scaleY 0..1 pulls it out
# The screen lid is not here: it flips open in 3D, which a 2D renderer can't
# do, so the page draws it as a CSS 3D panel hinged at the deck.
#   front the drawer front: a sled at console size (LED, 30-day bar, handles)
def unit(parent, name, color, a=255):
    sh = add('Shape', parent, name=name, x=0, y=0)
    add('Rectangle', sh, width=1, height=1, originX=0, originY=0)
    f = add('Fill', sh); add('SolidColor', f, colorValue=argb(color, a))
    return sh
def unit_dot(parent, name, color, a=255):
    sh = add('Shape', parent, name=name, x=0, y=0)
    add('Ellipse', sh, width=1, height=1)
    f = add('Fill', sh); add('SolidColor', f, colorValue=argb(color, a))
    return sh
def box(parent, name, x, y, w, h, color, a=255, r=0):
    """A fixed-size rect in a design-space group (scaled as a whole)."""
    sh = add('Shape', parent, name=name, x=x, y=y)
    add('Rectangle', sh, width=w, height=h, originX=0, originY=0, linkCornerRadius=True if r else None, cornerRadiusTL=r or None)
    f = add('Fill', sh); add('SolidColor', f, colorValue=argb(color, a))
    return sh
def circ(parent, name, x, y, d, color, a=255):
    sh = add('Shape', parent, name=name, x=x, y=y)
    add('Ellipse', sh, width=d, height=d)
    f = add('Fill', sh); add('SolidColor', f, colorValue=argb(color, a))
    return sh

KEY_BASE, KEY_CAP, KEY_TOP = '#050608', '#262b31', '#363c44'
croot = add('Node', 0, name='console', x=0, y=0)

# Deck: the keyboard tray, seen from the front and a little above, so it is
# foreshortened. Unit pieces (placed by hero's console.ts) plus two design-
# space groups: 'keys' (1000 x 200) and 'pad' (300 x 200).
cdeck = add('Node', croot, name='deck', x=0, y=0, scaleY=0)
unit(cdeck, 'dk', '#14171b')
unit(cdeck, 'dkGlow', LED, 9)          # the screen's light on the deck
unit(cdeck, 'dkShade', '#000000', 110)  # under the lid's hinge
unit(cdeck, 'dkLip', '#20242a')         # the tray's front lip
unit(cdeck, 'dkLipHi', LINE_HI)
for n in ('dkL', 'dkR'): unit(cdeck, n, LINE)
keys = add('Node', cdeck, name='keys', x=0, y=0)
U = 1000 / 15.5
rows = [  # (height, [key widths in units; negative = gap])
    (22, [1, -.5, 1, 1, 1, 1, -.25, 1, 1, 1, 1, -.25, 1, 1, 1, 1, -.25, 1.25]),
    (30, [1] * 13 + [2.5]),
    (30, [1.5] + [1] * 12 + [2]),
    (30, [1.75] + [1] * 11 + [2.75]),
    (30, [2.25] + [1] * 10 + [3.25]),
    (30, [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1, 1, 1]),
]
y = 0
for r, (h, ws) in enumerate(rows):
    x = 0
    for k, w in enumerate(ws):
        if w < 0: x += -w * U; continue
        kw = w * U
        box(keys, f'kb{r}_{k}', x + 2, y, kw - 4, h, KEY_BASE, r=3)
        box(keys, f'kc{r}_{k}', x + 4, y + 1, kw - 8, h - 6, KEY_CAP, r=3)
        box(keys, f'kt{r}_{k}', x + 5, y + 1, kw - 10, 3, KEY_TOP, r=1)
        x += kw
    y += h + 4
pad = add('Node', cdeck, name='pad', x=0, y=0)
box(pad, 'padEdge', 0, 0, 300, 150, LINE, r=8)
box(pad, 'padFace', 3, 3, 294, 144, '#171a1e', r=6)
box(pad, 'padHi', 6, 4, 288, 4, '#22262b', r=2)
for b_ in range(2):
    box(pad, f'padB{b_}', b_ * 152, 160, 148, 36, LINE, r=5)
    box(pad, f'padBf{b_}', b_ * 152 + 2, 162, 144, 32, '#171a1e', r=4)

# Front: the 1U drawer face. Rack ears with screws at both ends, pull
# handles, power and status LEDs, a recessed label plate (the page writes
# the name on it), a 10-segment 30-day meter like the list's, and a
# perforated vent panel. Groups: ear0/ear1 (40 x 100), hd0/hd1 (16 x 100),
# vents (240 x 100); everything else is a unit piece.
cfront = add('Node', croot, name='front', x=0, y=0)
for e in range(2):
    ear = add('Node', cfront, name=f'ear{e}', x=0, y=0)
    box(ear, f'earPlate{e}', 0, 0, 40, 100, '#1b1f24', r=3)
    box(ear, f'earHi{e}', 0, 0, 40, 2, LINE_HI)
    box(ear, f'earSh{e}', 0, 96, 40, 4, '#0b0d10')
    for k, sy_ in enumerate((24, 76)):
        circ(ear, f'scr{e}{k}', 20, sy_, 15, '#07090b')
        circ(ear, f'scrr{e}{k}', 20, sy_, 11, '#2b3036')
        box(ear, f'scrs{e}{k}', 15, sy_ - 1, 10, 2, '#07090b')
unit(cfront, 'fc', '#111418')
unit(cfront, 'fcHi', '#ffffff', 9)      # light from above on the upper half
unit(cfront, 'fcT', LINE_HI)
unit(cfront, 'fcB', '#050607')
for n in ('fcL', 'fcR'): unit(cfront, n, LINE)
for h_ in range(2):
    hd = add('Node', cfront, name=f'hd{h_}', x=0, y=0)
    box(hd, f'hdBase{h_}', 0, 6, 16, 88, '#07090b', r=4)
    box(hd, f'hdBar{h_}', 2, 10, 12, 80, '#2a2f35', r=3)
    box(hd, f'hdHi{h_}', 3, 12, 3, 76, '#3c4249', r=1)
unit(cfront, 'plateEdge', LINE)
unit(cfront, 'plate', '#090b0e')
for k in range(10):
    unit(cfront, f'mo{k}', '#1c2025')
    unit(cfront, f'mi{k}', LED)
vents = add('Node', cfront, name='vents', x=0, y=0)
for r in range(4):
    for c in range(16):
        circ(vents, f'vh{r}_{c}', 8 + c * 15 + (r % 2) * 7.5, 14 + r * 24, 7, '#050607')
unit_dot(cfront, 'pwr', '#0f3d30')
unit_dot(cfront, 'pwrCore', LED)
unit_dot(cfront, 'led', LINE_HI)
halo = unit_dot(cfront, 'on', LED, 60)
sh = add('Shape', halo, name='oncore', x=0, y=0)
add('Ellipse', sh, width=0.45, height=0.45)
f = add('Fill', sh); add('SolidColor', f, colorValue=argb(LED))
unit_dot(cfront, 'pre', AMBER)
CONSOLE = comps
comps = RACK


def emit(o, comps):
    """Emit one artboard's components. Rive paints earlier drawables on top;
    scenes here are built back to front, so sibling Nodes/Shapes are emitted
    in reverse (paths and paints keep their order) and parents re-indexed."""
    kids = {}
    for i, (typ, props, parent) in enumerate(comps, start=1):
        kids.setdefault(parent, []).append(i)
    order = []
    def visit(idx):
        ch = kids.get(idx, [])
        nodes = [c for c in ch if comps[c - 1][0] in ('Node', 'Shape')]
        rest = [c for c in ch if comps[c - 1][0] not in ('Node', 'Shape')]
        for c in rest + nodes[::-1]:
            order.append(c); visit(c)
    visit(0)
    newidx = {old: n for n, old in enumerate(order, start=1)}; newidx[0] = 0
    for old in order:
        typ, props, parent = comps[old - 1]
        o.obj(typ, parentId=newidx[parent], **props)
    return newidx

def write(path):
    o = Out()
    o.obj('Backboard')
    o.obj('Artboard', name='Rack', width=W, height=H, originX=0, originY=0, clip=True, defaultStateMachineId=0)
    newidx = emit(o, RACK)
    # animation 0: idle — the scan line sweeps the rack top to bottom and back, 12 s
    fps, dur = 60, 720
    o.obj('LinearAnimation', name='idle', fps=fps, duration=dur, loopValue=1)
    o.obj('KeyedObject', objectId=newidx[scan])
    o.obj('KeyedProperty', propertyKey=defs.cls('Node')['props']['y'][0])
    o.obj('KeyFrameDouble', frame=0, value=FRAME_Y + 10, interpolationType=1)
    o.obj('KeyFrameDouble', frame=dur // 2, value=FRAME_Y + FRAME_H - 10, interpolationType=1)
    o.obj('KeyFrameDouble', frame=dur, value=FRAME_Y + 10, interpolationType=1)
    # state machine: entry -> idle (loops)
    o.obj('StateMachine', name='Rack')
    o.obj('StateMachineLayer', name='Layer 1')
    o.obj('EntryState')                       # state 0
    o.obj('StateTransition', stateToId=3)     #   -> idle
    o.obj('AnyState')                         # state 1
    o.obj('ExitState')                        # state 2
    o.obj('AnimationState', animationId=0)    # state 3
    # The console: no timeline; hero.ts lays it out and moves it with springs.
    o.obj('Artboard', name='Console', width=1, height=1, originX=0, originY=0, clip=False)
    emit(o, CONSOLE)
    open(path, 'wb').write(bytes(o.buf))
    return len(o.buf)

def write_svg(path):
    """The same rack as a static SVG: the poster the page shows before the
    runtime has drawn (and without JS). LEDs and bars carry ids (r-on3, r-bar3)
    and start hidden; hero.ts lights them from live data."""
    hidden = {'sel', 'scan', 'con'}
    def hide(name): return name in hidden or name.startswith('oncore')
    def svg_id(name):
        for p in ('on', 'pre', 'bar'):
            if name.startswith(p) and name[len(p):].isdigit(): return name
        return None
    kids = {}
    for i, (typ, props, parent) in enumerate(comps, start=1): kids.setdefault(parent, []).append(i)
    out = []
    def rgba(c):
        a = (c >> 24) & 255; rgb = '#%06x' % (c & 0xffffff)
        return rgb, round(a / 255, 3)
    def visit(idx, ox, oy):
        for c in kids.get(idx, []):
            typ, props, _ = comps[c - 1]
            if typ not in ('Node', 'Shape') or hide(props.get('name', '')): continue
            x, y = ox + props.get('x', 0), oy + props.get('y', 0)
            if typ == 'Shape':
                parts = {comps[k - 1][0]: (k, comps[k - 1][1]) for k in kids.get(c, [])}
                fill = stroke = None
                for k in kids.get(c, []):
                    t2 = comps[k - 1][0]
                    if t2 in ('Fill', 'Stroke'):
                        col = comps[kids[k][0] - 1][1]['colorValue']
                        if t2 == 'Fill': fill = rgba(col)
                        else: stroke = (rgba(col), comps[k - 1][1].get('thickness', 1))
                attrs = f'fill="{fill[0]}"' + (f' fill-opacity="{fill[1]}"' if fill and fill[1] < 1 else '') if fill else 'fill="none"'
                if stroke: attrs += f' stroke="{stroke[0][0]}" stroke-width="{stroke[1]}"' + (f' stroke-opacity="{stroke[0][1]}"' if stroke[0][1] < 1 else '')
                sid = svg_id(props.get('name', ''))
                # LEDs and bars start off; the page lights them from live data.
                extra = f' id="r-{sid}" visibility="hidden"' if sid else ''
                if 'Rectangle' in parts:
                    r = parts['Rectangle'][1]
                    out.append(f'<rect x="{x:g}" y="{y:g}" width="{r["width"]:g}" height="{r["height"]:g}" {attrs}{extra}/>')
                elif 'Ellipse' in parts:
                    e = parts['Ellipse'][1]
                    if sid and sid.startswith('on'):  # halo + core, as in the scene
                        out.append(f'<g id="r-{sid}" visibility="hidden"><circle cx="{x:g}" cy="{y:g}" r="{e["width"] / 2:g}" {attrs}/><circle cx="{x:g}" cy="{y:g}" r="2.5" fill="#00d892"/></g>')
                    else:
                        out.append(f'<circle cx="{x:g}" cy="{y:g}" r="{e["width"] / 2:g}" {attrs}{extra}/>')
            visit(c, x, y)
    visit(0, 0, 0)
    svg = f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + ''.join(out) + '</svg>'
    open(path, 'w').write(svg + '\n')
    return len(svg)

def write_geometry(path):
    """Sled rectangles in artboard units, for the page's hit-testing."""
    sleds = []
    for i in range(COLS * ROWS):
        col, row = i % COLS, i // COLS
        sleds.append([round(FRAME_X + RAIL + GAP + col * (SLED_W + GAP), 2), round(FRAME_Y + 10 + row * (SLED_H + 2), 2)])
    json.dump({'width': W, 'height': H, 'sledW': SLED_W, 'sledH': SLED_H, 'sleds': sleds, 'name': [NAME_X, NAME_W]}, open(path, 'w'))

if __name__ == '__main__':
    riv, svg, geo = sys.argv[1], sys.argv[2], sys.argv[3]
    n = write(riv); m = write_svg(svg); write_geometry(geo)
    print(f'wrote {riv} ({n} bytes, {len(comps)} components), {svg} ({m} bytes), {geo}')
