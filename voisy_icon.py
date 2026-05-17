"""
Génère Voisy_Icon_1024.png depuis les paths SVG de l'index.html.

Paramètre clé :
  base_y  — distance en pixels du BAS du canvas jusqu'à la base des triangles.
             Augmenter  → triangles montent   ↑
             Diminuer   → triangles descendent ↓
"""

from PIL import Image, ImageDraw

SIZE = 1024
BG_COLOR = (45, 106, 79)  # #2D6A4F vert Voisy


def bezier(p0, p1, p2, steps=40):
    """Quadratic Bezier de p0 à p2 via le point de contrôle p1."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def generate(base_y=390, output="Voisy_Icon_1024.png"):
    """
    base_y : pixels depuis le bas du canvas jusqu'à la ligne de base des triangles.
             Valeur actuelle  : 390  (triangles centrés, légèrement au-dessus du centre).
             Valeur précédente: ~300 (triangles trop bas).
    """
    # Géométrie SVG d'origine (viewBox 0 0 80 56)
    SVG_BASE_Y = 54   # bas des triangles dans le viewBox
    SVG_APEX_Y = 6    # sommet des triangles dans le viewBox
    VB_W = 80

    # Mise à l'échelle : logo = 56 % de la largeur du canvas
    scale = (SIZE * 0.56) / VB_W

    # Hauteur en pixels du triangle (de l'apex à la base)
    tri_h_px = (SVG_BASE_Y - SVG_APEX_Y) * scale  # 48 unités SVG → ~344 px

    # Position verticale dans le canvas (coordonnées image, y=0 en haut)
    base_px = SIZE - base_y          # y de la base des triangles
    apex_px = base_px - tri_h_px     # y du sommet

    # Centrage horizontal
    ox = (SIZE - VB_W * scale) / 2

    def tx(x):
        return ox + x * scale

    def ty(svg_y):
        return apex_px + (svg_y - SVG_APEX_Y) * scale

    # Triangle gauche  : M2 54 L19 10 Q20 6 21 10 L39 54 Z  (opacité 0.95)
    notch1 = bezier((tx(19), ty(10)), (tx(20), ty(6)), (tx(21), ty(10)))
    poly1 = [(tx(2), ty(54)), (tx(19), ty(10))] + notch1 + [(tx(39), ty(54))]

    # Triangle droit   : M41 54 L59 10 Q60 6 61 10 L78 54 Z  (opacité 0.55)
    notch2 = bezier((tx(59), ty(10)), (tx(60), ty(6)), (tx(61), ty(10)))
    poly2 = [(tx(41), ty(54)), (tx(59), ty(10))] + notch2 + [(tx(78), ty(54))]

    img = Image.new("RGBA", (SIZE, SIZE), (*BG_COLOR, 255))

    for poly, alpha in [(poly1, 242), (poly2, 140)]:  # 242≈0.95×255 / 140≈0.55×255
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(poly, fill=(255, 255, 255, alpha))
        img = Image.alpha_composite(img, layer)

    img.convert("RGB").save(output)

    center_px = (apex_px + base_px) / 2
    print(f"✓ {output} généré")
    print(f"  base_y={base_y}  →  base à y={base_px:.0f}px, apex à y={apex_px:.0f}px")
    print(f"  Centre géométrique des triangles : y={center_px:.0f}px  (centre canvas : {SIZE//2}px)")


if __name__ == "__main__":
    generate()
