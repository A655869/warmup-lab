# Blender 无头脚本：生成第一人称视模（步枪 + 手套）GLB
# 纯视觉层：挂在相机上（Three.js 相机前方 -Z），代码驱动后坐，不参与任何判定。
# 参考浏览器瞄准练习游戏的第一人称视角布局；全部原创几何，无游戏资产。
import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mat(name, color, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.75
        if emission is not None:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
    return mat

GUN = make_mat("Gun", (0.10, 0.10, 0.12))
GUN2 = make_mat("GunAccent", (0.70, 0.24, 0.28))       # 主色块（狂徒红调；幻影深色由代码换色）
GLOVE = make_mat("Glove", (0.20, 0.16, 0.13))          # 战术手套棕黑
SIGHT = make_mat("Sight", (0.05, 0.08, 0.10), emission=(0.3, 0.9, 1.0), strength=2.5)

def add_box(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o

# 朝向约定：与机器人步枪相同，枪口朝 -Y（Three.js 侧旋转 π 后朝相机前方 -Z）
# 步枪：机匣 / 上机匣盖 / 枪管 / 枪口制退器 / 护木 / 弹匣 / 枪托 / 握把 / 瞄具
add_box("VmBody", (0, -0.10, 0), (0.055, 0.34, 0.075), GUN)
add_box("VmUpper", (0, -0.08, 0.045), (0.05, 0.30, 0.03), GUN2)
add_box("VmBarrel", (0, -0.34, 0.01), (0.03, 0.16, 0.03), GUN)
add_box("VmMuzzle", (0, -0.44, 0.01), (0.045, 0.05, 0.045), GUN2)
add_box("VmHandguard", (0, -0.26, 0.005), (0.06, 0.10, 0.06), GUN2)
add_box("VmMag", (0, -0.06, -0.075), (0.04, 0.07, 0.10), GUN)
add_box("VmStock", (0, 0.10, -0.005), (0.045, 0.12, 0.06), GUN)
add_box("VmGrip", (0, 0.015, -0.07), (0.035, 0.05, 0.08), GUN)
add_box("VmSight", (0, -0.12, 0.075), (0.035, 0.09, 0.035), SIGHT)
# 持枪手（右手握把 + 左手托护木，方块手套）
add_box("VmHandR", (0.01, 0.03, -0.055), (0.07, 0.09, 0.07), GLOVE)
add_box("VmHandL", (-0.015, -0.25, -0.03), (0.07, 0.08, 0.06), GLOVE)
add_box("VmSleeveR", (0.05, 0.12, -0.09), (0.08, 0.14, 0.08), GLOVE)

bpy.ops.object.select_all(action='SELECT')
out = r"D:\1\kimi1\warmup-lab\public\assets\models\viewmodel.glb"
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_yup=True, export_apply=True)
print("EXPORTED", out)
