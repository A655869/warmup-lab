# Blender 无头脚本：生成训练场装饰场景 GLB ×2（急停通道 / 掩体出枪区）
# 纯视觉装饰层：地面发光车道线、墙面板、顶梁灯带、端墙目标环。
# 坐标对齐现有地图 JSON（Three.js 坐标 → Blender：(x, -z, y)），不参与碰撞与命中判定。
# 全部原创几何，不使用任何游戏资产。
import bpy
import math

FLOOR_Y = 0.012          # 装饰厚度基准（高出灰盒地面 1.2cm，避免 z-fighting）
PANEL_THICK = 0.04       # 墙面板凸出墙面 2cm


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, color, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.9
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
    return mat


PANEL = None
STRIP = None
BEAM = None
RING = None


def add_box(name, loc_three, size_three, mat):
    """loc/size 用 Three.js 坐标语义（x, y, z）描述，内部换算到 Blender Z-up。"""
    x, y, z = loc_three
    sx, sy, sz = size_three
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sz, sy)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def build(out_path, half_w, wall_z0, wall_z1, end_z):
    """half_w: 侧墙内表面 |x|；wall_z0..wall_z1: 侧墙沿 z 范围；end_z: 端墙位置。"""
    reset()
    global PANEL, STRIP, BEAM, RING
    # 暖色调砂岩风（Ascent 调性）：米色墙面板、木梁、暖白灯带
    PANEL = make_mat("Panel", (0.72, 0.62, 0.48))
    STRIP = make_mat("Strip", (0.20, 0.16, 0.10), emission=(1.0, 0.85, 0.6), strength=3.0)   # 暖白发光
    BEAM = make_mat("Beam", (0.32, 0.22, 0.14))
    RING = make_mat("Ring", (0.10, 0.05, 0.05), emission=(1.0, 0.35, 0.2), strength=3.0)      # 红橙发光

    # —— 地面车道线：两侧长线 + 中线虚线段 ——
    zc = (wall_z0 + wall_z1) / 2
    zlen = abs(wall_z1 - wall_z0)
    for sx in (-1, 1):
        add_box(f"Lane{sx}", (sx * (half_w - 0.5), FLOOR_Y, zc), (0.08, 0.02, zlen), STRIP)
    zi = min(wall_z0, wall_z1)
    while zi < max(wall_z0, wall_z1):
        add_box(f"Dash{zi}", (0, FLOOR_Y, zi + 0.5), (0.08, 0.02, 1.0), STRIP)
        zi += 2.5

    # —— 墙面板：每 4m 一块，凸出内墙面 2cm；顶部长条灯带 ——
    for sx in (-1, 1):
        face = sx * (half_w - PANEL_THICK / 2)
        add_box(f"TopStrip{sx}", (face, 2.86, zc), (PANEL_THICK, 0.10, zlen), STRIP)
        zi = min(wall_z0, wall_z1) + 1.5
        n = 0
        while zi < max(wall_z0, wall_z1) - 1:
            add_box(f"Panel{sx}_{n}", (face, 1.3, zi), (PANEL_THICK, 2.2, 3.0), PANEL)
            zi += 4
            n += 1

    # —— 顶梁：每 5m 一根横跨通道，下方挂发光灯条 ——
    zi = min(wall_z0, wall_z1) + 2.5
    n = 0
    while zi < max(wall_z0, wall_z1):
        add_box(f"Beam{n}", (0, 3.15, zi), (half_w * 2, 0.18, 0.18), BEAM)
        add_box(f"BeamLight{n}", (0, 3.04, zi), (half_w * 1.2, 0.04, 0.08), STRIP)
        zi += 5
        n += 1

    # —— 端墙目标环（方块拼的方环，头部高度）——
    ez = end_z + (0.53 if end_z < 0 else -0.53)  # 凸出端墙面
    w = 0.9
    t = 0.08
    cy = 1.5
    add_box("RingT", (0, cy + w / 2, ez), (w, t, 0.04), RING)
    add_box("RingB", (0, cy - w / 2, ez), (w, t, 0.04), RING)
    add_box("RingL", (-w / 2, cy, ez), (t, w, 0.04), RING)
    add_box("RingR", (w / 2, cy, ez), (t, w, 0.04), RING)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_animations=False,
        export_yup=True,
        export_apply=True,
    )
    print("EXPORTED", out_path)


# 急停通道 01：侧墙 x=±6（内面 5.5），z∈[-20,0]，端墙 z=-21
build(r"D:\1\kimi1\warmup-lab\public\assets\models\range-stop-corridor.glb", 5.5, 0, -20, -21)
# 掩体出枪区 01：侧墙 x=±7（内面 6.5），z∈[-22,2]，端墙 z=-22
build(r"D:\1\kimi1\warmup-lab\public\assets\models\range-cover-peek.glb", 6.5, 2, -22, -22)
