"""The game's own panels, as planes: GRAVITAS's windows sit on them, in their perspective, as panels of the game (v0.9.0).

Measured by CMDR Hongark at 2560 × 1440 (in the game's default field of view) and drawn as guide lines on 2000 × 1125
pictures: the top edges of the comms panel and of the INFO panel, straight ahead; the frame of the left panel (1) and
of the right panel (4). The game keeps its vertical field of view and widens the view for a wider screen, so the
guides are kept from the window's centre in heights: they fit 1920 × 1080, 2560 × 1440 and 3840 × 2160 alike, and a
wider (or narrower) window too.

A plane is four corners on screen (top left, top right, bottom right, bottom left). A window on a plane is drawn flat,
then every point of it is carried onto the plane by a perspective map (homography): the window leans and narrows as
the game's panels do. Its texts stay upright and sharp.
"""
GUIDE_W, GUIDE_H = 2000, 1125
# the comms panel's and the INFO panel's top edges (straight ahead), and the frames of the side panels
COMMS_TOP = ((155, 109.0), (653, 196.5))
INFO_TOP = ((1306, 194.0), (1836, 95.0))
LEFT_PANEL = ((349, 301), (1309, 286), (1324, 797), (390, 891))       # GuiFocus 2 (key 1)
RIGHT_PANEL = ((683, 282), (1684, 293), (1641, 887), (671, 791))      # GuiFocus 1 (key 4)
NEAR = 1.154    # the near edge of a side panel is this much taller than the far one (from the left panel's frame)
DEPTH = 0.50    # how far down the comms and INFO planes are taken (parts of the height): the game shows no bottom edge


def to_screen(p, W, H):
    """A guide point (on the 2000 × 1125 picture) on a W × H game window: kept from the centre, in heights."""
    gx, gy = p
    return W / 2 + (gx - GUIDE_W / 2) / GUIDE_H * H, gy / GUIDE_H * H


def front_plane(top, near_left, W, H):
    """The plane under one of the top edges straight ahead: it goes down DEPTH, its near (outer) side the taller."""
    (x1, y1), (x2, y2) = to_screen(top[0], W, H), to_screen(top[1], W, H)
    d = DEPTH * H
    hl, hr = (d, d / NEAR) if near_left else (d / NEAR, d)
    return [(x1, y1), (x2, y2), (x2, y2 + hr), (x1, y1 + hl)]


def plane(name, W, H):
    if name == "comms":
        return front_plane(COMMS_TOP, True, W, H)
    if name == "info":
        return front_plane(INFO_TOP, False, W, H)
    if name == "left":
        return [to_screen(p, W, H) for p in LEFT_PANEL]
    if name == "right":
        return [to_screen(p, W, H) for p in RIGHT_PANEL]
    raise KeyError(name)


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        if abs(M[p][c]) < 1e-12:
            return None
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]


def homography(src, dst):
    """The perspective map that takes the four points src to the four points dst."""
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    h = solve(A, b)
    return None if h is None else h + [1.0]


def apply(h, x, y):
    w = h[6] * x + h[7] * y + h[8]
    return (h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w


def size(q):
    """A plane's size as if seen flat (pixels): the mean of its top and bottom, and of its sides."""
    d = lambda a, b: ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
    return (d(q[0], q[1]) + d(q[3], q[2])) / 2, (d(q[0], q[3]) + d(q[1], q[2])) / 2


# where each window goes by default: on which plane, and where on it its first window starts (as parts of the plane,
# u across and v down, outside 0..1 for beside it); the windows on one plane follow one another downwards
#   comms: the left column straight ahead, under the chat;  info: the right column, under the INFO messages
#   left / right: beside the side panel (1 / 4) while it is open
SLOTS = {"comms": (0.0, 0.40), "info": (None, 0.32), "left": (1.03, 0.0), "right": (None, 0.0)}
GAP = 0.025       # between two windows on one plane (part of its height)
HOME = {"targets": "comms", "target": "info", "feed": "info", "fight": "left", "speed": "right", "bounty": "info"}
TOP = {"status": 0.022, "alert": 0.072, "report": 0.115, "banner": 0.27}   # flat, in the middle at the top

# v0.19.0: the free room round the comms panel (key 2) and the role panel (key 3) while each is open, marked by CMDR
# Hongark on the game at 2560 x 1440 (left, top, right, bottom on the 2000 x 1125 guide): the windows tied to that panel
# sit there flat, one after another down each area, the first in A, the next in B, and so on; a window wider than its
# area is made smaller to fit
AREAS = {"comms_a": (13, 11, 467, 731),      # left of the opened comms panel
         "comms_b": (489, 12, 942, 156),     # above it
         "role_a": (26, 307, 501, 836),      # left of the role panel, over the console
         "role_b": (547, 186, 1391, 309),    # above it
         "right_t": (700, 120, 1660, 272)}   # v0.25.0: above the right panel (4), taken from its frame (RIGHT_PANEL)
AREA_GAP = 0.012  # between two windows in one area (part of the window's height)


def area(name, W, H):
    """An area's corners on a W x H game window: (left, top, right, bottom), kept from the centre in heights."""
    x0, y0, x1, y1 = AREAS[name]
    (a, b), (c, d) = to_screen((x0, y0), W, H), to_screen((x1, y1), W, H)
    return a, b, c, d

MID_Y0 = 0.17     # v0.21.0: "Main panel top": the windows flat in the middle from here down (part of the height)
