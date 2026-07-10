"""Mocks 1:1 de las 4 salas del caso con el mobiliario pixel-art.

Replica paintFurnitureSprite: sprite anclado por la base en feetY (+15% de la
altura de sombra), escalado por ancho visual, sombra de contacto debajo.
Los (cx, feetY, visualW) salen de los call sites del renderer + el cableado.
"""
from PIL import Image, ImageDraw

D = 'D:/Sua_Files/IdeaProjects/psico_project_v3/frontend/src/assets/game/furniture/'
W, H = 960, 528

PALS = {
    'urgencias':   ((24, 40, 52), (29, 49, 66), (34, 58, 74)),
    'escucha':     ((12, 10, 20), (58, 44, 68), (45, 34, 54)),
    'recepcion':   ((9, 12, 18), (42, 51, 68), (32, 39, 52)),
    'consultorio': ((10, 13, 12), (41, 58, 52), (31, 43, 39)),
}

# sala -> [(asset, cx, feetY, visualW, shadowW, shadowH, alpha)]
ROOMS = {
    'urgencias': [
        ('counter.png',        490, 300, 236, 244, 22, .30),
        ('waiting_chairs.png', 195, 340, 156, 160, 16, .26),
        ('gurney.png',         755, 340, 122, 120, 16, .28),
        ('plant.png',          822, 407,  50,  46, 13, .30),
    ],
    'escucha': [
        ('sofa.png',         195, 362, 146, 150, 22, .30),
        ('coffee_table.png', 325, 400,  96, 100, 14, .26),
        ('shelf.png',        675, 294, 150, 164, 14, .26),
        ('chair.png',        708, 354,  40,  40, 10, .24),
    ],
    'recepcion': [
        ('counter.png',        490, 300, 236, 244, 22, .30),
        ('file_cabinet.png',   765, 314, 130, 146, 16, .28),
        ('waiting_chairs.png', 195, 340, 156, 160, 16, .26),
    ],
    'consultorio': [
        ('desk.png',          530, 372, 224, 260, 24, .32),
        ('file_cabinet.png',  805, 318,  90, 106, 16, .28),
        ('chair.png',         402, 380,  40,  40, 10, .24),
        ('chair.png',         582, 380,  40,  40, 10, .24),
        ('plant.png',         132, 411,  46,  46, 13, .30),
    ],
}


def paint_room(name):
    back, wall, floor = PALS[name]
    room = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(room)
    d.rectangle([0, 0, W, H], fill=(*back, 255))
    d.polygon([(96, 76), (864, 76), (864, 220), (96, 220)], fill=(*wall, 255))
    d.polygon([(96, 236), (864, 236), (792, 486), (168, 486)], fill=(*floor, 255))

    def shadow(cx, cy, w, h, a):
        d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=(0, 0, 0, int(60 * a)))
        d.ellipse([cx - w * .34, cy - h * .34, cx + w * .34, cy + h * .34], fill=(0, 0, 0, int(110 * a)))

    for f, cx, fy, vw, sw, sh, sa in sorted(ROOMS[name], key=lambda t: t[2]):
        im = Image.open(D + f).convert('RGBA')
        sc = vw / im.width
        im2 = im.resize((round(im.width * sc), round(im.height * sc)), Image.NEAREST)
        shadow(cx, fy, sw, sh, sa)
        room.alpha_composite(im2, (round(cx - im2.width / 2), round(fy + sh * 0.15 - im2.height)))
    return room.convert('RGB')


rows = [paint_room(k) for k in ['urgencias', 'escucha', 'recepcion', 'consultorio']]
gap = 10
canvas = Image.new('RGB', (W, H * 4 + gap * 3), (5, 8, 12))
for i, r in enumerate(rows):
    canvas.paste(r, (0, i * (H + gap)))
canvas.save('rooms_all_mock.png')
print('rooms_all_mock.png', canvas.size)
